import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, UPLOAD_DIR, loadEnv } from './lib/db.js';
import { analyzeDxf, UNIT_FACTORS } from './lib/dxf.js';
import { samplePlan } from './lib/samplePlan.js';
import {
  computeQuantities, computeBOQ, computeSchedule, computeFloorSummary, DEFAULT_RATES,
  buildFloors, applyFormworkScheme, FORMWORK_SCHEMES
} from './lib/calc.js';
import { analyzeImage, analyzeDocuments, chatAssistant, aiEnabled, aiProvider, supportsNativePdf } from './lib/ai.js';
import {
  SUPPORTED_EXT, fileKind, textOf, imageDataUri, pdfToImages, cleanupDir, popplerAvailable
} from './lib/extract.js';
import { parseFloorsFromText, parseSize, describeParsed } from './lib/docparse.js';
import {
  validatePlan, validateFloors, validateRates, validatePriceOverrides, validateOpts, ValidationError
} from './lib/validate.js';
import {
  authEnabled, requireAuth, checkPassword, createSession, destroySession,
  sessionToken, setSessionCookie, clearSessionCookie
} from './lib/auth.js';

loadEnv();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');

// CORS: parol yoqilgan bo'lsa faqat ko'rsatilgan manzil (cookie bilan),
// aks holda lokal dev serveri (vite) uchun ochiq.
const ORIGIN = process.env.APP_ORIGIN || '';
app.use(cors(ORIGIN
  ? { origin: ORIGIN, credentials: true }
  : { origin: (o, cb) => cb(null, true), credentials: true }));
app.use(express.json({ limit: '10mb' }));

const ALLOWED_EXT = SUPPORTED_EXT;
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + path.basename(file.originalname).replace(/[^\w.\-]/g, '_'))
  }),
  limits: { fileSize: 30 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new ValidationError(
        'Qo‘llanmaydigan format: ' + ext + '. Mumkin: DXF, PDF, JPG, PNG, WEBP, DOCX, XLSX, TXT, CSV'));
    }
    cb(null, true);
  }
});

// ---------- Autentifikatsiya ----------
app.post('/api/login', (req, res) => {
  if (!authEnabled()) return res.json({ ok: true, auth: false });
  if (!checkPassword(req.body?.password)) {
    return res.status(401).json({ error: 'Parol noto‘g‘ri' });
  }
  const { token, maxAge } = createSession();
  setSessionCookie(res, token, maxAge);
  res.json({ ok: true, auth: true });
});

app.post('/api/logout', (req, res) => {
  destroySession(sessionToken(req));
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth-status', (req, res) => {
  res.json({ required: authEnabled(), ai: aiEnabled() });
});

// Ochiq yo'llardan tashqari hamma narsa himoyalangan
app.use(requireAuth(['/api/login', '/api/logout', '/api/auth-status']));
app.use('/files', express.static(UPLOAD_DIR, { dotfiles: 'deny', index: false }));

// ---------- Upload (bir yoki bir necha fayl) ----------
const saveUploaded = (f, i) => {
  const id = 'f' + Date.now().toString(36) + i.toString(36);
  const type = fileKind(f.originalname);
  const meta = { id, name: f.originalname, path: f.filename, type, size: f.size };
  db.saveFile(id, meta);
  return { fileId: id, name: f.originalname, type, size: f.size };
};

app.post('/api/upload', upload.any(), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Fayl yuklanmadi' });
  const saved = files.map(saveUploaded);
  // Eski mijozlar uchun bitta fayl maydonlari ham qaytariladi
  res.json({ files: saved, fileId: saved[0].fileId, name: saved[0].name, type: saved[0].type });
});

// ---------- Analyze ----------
app.post('/api/analyze', async (req, res, next) => {
  const { fileId, units } = req.body || {};
  const file = db.getFile(fileId);
  if (!file) return res.status(404).json({ error: 'Fayl topilmadi' });
  if (units && !UNIT_FACTORS[units]) {
    return res.status(400).json({ error: 'Birlik noto‘g‘ri (mm, cm, dm, m, in, ft)' });
  }
  const full = path.join(UPLOAD_DIR, path.basename(file.path));
  try {
    if (file.type === 'dxf') {
      const text = await fs.promises.readFile(full, 'utf8');
      const raw = analyzeDxf(text, { units });
      const plan = validatePlan(raw);
      plan.meta.analysis = raw.meta.analysis; // tahlil hisoboti saqlanadi
      return res.json({ plan, demo: false, method: 'dxf-heuristic' });
    }
    const b64 = 'data:image/' + (path.extname(file.path).slice(1) || 'png') + ';base64,' +
      (await fs.promises.readFile(full)).toString('base64');
    const r = await analyzeImage(b64);
    return res.json({ plan: validatePlan(r.plan), demo: false, method: 'ai-vision' });
  } catch (e) {
    if (e.code === 'DXF_UNITS') {
      return res.status(422).json({ error: e.message, code: 'DXF_UNITS', units: e.units, size: e.size });
    }
    next(e);
  }
});

// ---------- Ko'p hujjatli tahlil ----------
// Barcha yuklangan fayllar BIRGA o'qiladi: DXF dan aniq geometriya,
// rasm va PDF sahifalaridan AI vision, DOCX/XLSX/TXT dan matn konteksti.
app.post('/api/analyze-batch', async (req, res, next) => {
  const { fileIds, units, scheme = 'podval-1' } = req.body || {};
  if (!Array.isArray(fileIds) || !fileIds.length) {
    return res.status(400).json({ error: 'Fayl tanlanmadi' });
  }
  if (fileIds.length > 20) return res.status(400).json({ error: 'Bir vaqtda 20 tagacha fayl' });
  if (units && !UNIT_FACTORS[units]) return res.status(400).json({ error: 'Birlik noto‘g‘ri' });

  const files = fileIds.map((id) => db.getFile(id)).filter(Boolean);
  if (!files.length) return res.status(404).json({ error: 'Fayllar topilmadi' });

  const report = [];       // har fayl bo'yicha holat
  const images = [];       // AI vision uchun data URI lar
  const imageNames = [];
  const documents = [];    // Claude ga to'g'ridan-to'g'ri beriladigan PDF lar
  const texts = [];        // hujjat matnlari
  const tmpDirs = [];
  let dxfPlan = null, dxfFileName = null;

  try {
    for (const f of files) {
      const full = path.join(UPLOAD_DIR, path.basename(f.path));
      const kind = f.type && f.type !== 'other' ? f.type : fileKind(f.name);
      try {
        if (kind === 'dxf') {
          const raw = analyzeDxf(await fs.promises.readFile(full, 'utf8'), { units });
          // eng ko'p devorli DXF ni asosiy geometriya deb olamiz
          if (!dxfPlan || raw.walls.length > dxfPlan.walls.length) { dxfPlan = raw; dxfFileName = f.name; }
          report.push({ name: f.name, kind, ok: true, info: `${raw.walls.length} devor, ${raw.rooms.length} xona` });
        } else if (kind === 'image') {
          images.push(await imageDataUri(full));
          imageNames.push(f.name);
          report.push({ name: f.name, kind, ok: true, info: 'AI ko‘rish uchun qo‘shildi' });
        } else if (kind === 'pdf') {
          const t = await textOf(full, 'pdf');
          if (t) texts.push(`--- ${f.name} ---\n${t}`);
          if (supportsNativePdf()) {
            // Claude PDF ni o'zi sahifama-sahifa o'qiydi — rasmga o'girish shart emas
            documents.push({
              name: f.name,
              mediaType: 'application/pdf',
              data: (await fs.promises.readFile(full)).toString('base64')
            });
            report.push({ name: f.name, kind, ok: true, info: `hujjat sifatida AI ga berildi${t ? ', matn ham o‘qildi' : ''}` });
          } else {
            const { dir, files: pages } = await pdfToImages(full, 6);
            tmpDirs.push(dir);
            for (const [i, pg] of pages.entries()) {
              images.push(await imageDataUri(pg));
              imageNames.push(`${f.name} (${i + 1}-sahifa)`);
            }
            report.push({ name: f.name, kind, ok: true, info: `${pages.length} sahifa rasmga o‘girildi${t ? ', matn o‘qildi' : ''}` });
          }
        } else if (['docx', 'xlsx', 'text'].includes(kind)) {
          const t = await textOf(full, kind);
          if (t) texts.push(`--- ${f.name} ---\n${t}`);
          report.push({ name: f.name, kind, ok: !!t, info: t ? `${t.length} belgi matn o‘qildi` : 'matn topilmadi' });
        } else {
          report.push({ name: f.name, kind, ok: false, info: 'qo‘llanmaydigan format' });
        }
      } catch (e) {
        report.push({ name: f.name, kind, ok: false, info: e.message });
      }
    }

    const text = texts.join('\n\n');
    let ai = null, aiError = null;

    // AI: rasm va/yoki matn bo'lsa chaqiriladi
    if (images.length || documents.length || text.trim()) {
      if (aiEnabled()) {
        try {
          ai = await analyzeDocuments({
            images: images.slice(0, 10),
            documents: documents.slice(0, 5),
            text,
            fileNames: [...imageNames, ...files.filter((f) => ['docx', 'xlsx', 'text', 'pdf'].includes(f.type)).map((f) => f.name)],
            dxfHint: dxfPlan ? { walls: dxfPlan.walls.length, size: dxfPlan.meta.analysis?.size } : null
          });
        } catch (e) {
          aiError = e.message;
        }
      } else {
        aiError = 'AI kaliti yo‘q — rasm va PDF chizmalar o‘qilmadi (DXF va matn ishlaydi)';
      }
    }

    // --- Geometriyani birlashtirish: DXF ustun, bo'lmasa AI ---
    let plan;
    if (dxfPlan) {
      plan = validatePlan(dxfPlan);
      plan.meta.analysis = dxfPlan.meta.analysis;
      plan.meta.source = 'dxf';
    } else if (ai && ai.walls.length) {
      plan = validatePlan({
        meta: { name: ai.name || 'AI tahlil', source: 'ai-docs', level: '1-qavat' },
        walls: ai.walls, openings: ai.openings, rooms: ai.rooms
      });
    } else {
      return res.status(422).json({
        error: aiError || 'Hujjatlardan chizma aniqlanmadi. DXF fayl yuklang yoki chizma rasmini aniqroq suratga oling.',
        report, code: 'NO_GEOMETRY'
      });
    }

    // --- Qavatlar ---
    // 1) AI aniqlagan qavatlar; 2) AI bo'lmasa — hujjat matnidan evristik;
    // 3) ikkalasi ham bo'lmasa — standart (Podval + 1-qavat).
    const parsedFloors = parseFloorsFromText(text);
    const parsedSize = parseSize(text);
    const detected = ai?.floors?.length ? ai.floors : parsedFloors;
    const floorSource = ai?.floors?.length ? 'ai' : (parsedFloors.length ? 'matn' : 'standart');

    plan.floors = buildFloors(detected, {
      scheme: FORMWORK_SCHEMES[scheme] ? scheme : 'podval-1'
    });
    if (ai?.name) plan.meta.name = ai.name;

    res.json({
      plan,
      report,
      summary: ai?.summary || describeParsed(parsedFloors, parsedSize),
      confidence: ai?.confidence || (dxfPlan ? 'yuqori' : null),
      aiError,
      aiUsed: !!ai,
      floorSource,
      docSize: parsedSize,
      source: dxfPlan ? `DXF: ${dxfFileName}` : 'AI hujjat tahlili',
      scheme
    });
  } catch (e) {
    next(e);
  } finally {
    for (const d of tmpDirs) await cleanupDir(d);
  }
});

app.get('/api/capabilities', async (req, res) => {
  res.json({
    ai: aiEnabled(),
    provider: aiEnabled() ? aiProvider() : null,
    nativePdf: supportsNativePdf(),
    pdf: await popplerAvailable(),
    formats: [...SUPPORTED_EXT],
    schemes: FORMWORK_SCHEMES,
    maxFiles: 20,
    maxFileMb: 30
  });
});

// ---------- Projects ----------
function recalcProject(p) {
  const rent = p.opts?.rentMode === 'rent';
  const q = computeQuantities(p.plan, {
    rates: p.rates || {},
    rent,
    rentMonths: p.opts?.rentMonths || 1
  });
  const boq = computeBOQ(q.items, p.rates || {});
  // Qo'lda kiritilgan narxlar (har qator uchun override) — hisoblangan narxni almashtiradi
  if (p.priceOverrides && Object.keys(p.priceOverrides).length) {
    for (const row of boq.rows) {
      const ov = p.priceOverrides[row.key];
      if (ov === undefined || ov === null) continue;
      const n = Number(ov);
      if (!Number.isFinite(n)) continue;
      row.matRate = n;
      row.matCost = Math.round(row.qty * n);
      row.total = row.matCost + row.laborCost;
    }
    boq.total = boq.rows.reduce((s, x) => s + x.total, 0);
    boq.totalMat = boq.rows.reduce((s, x) => s + x.matCost, 0);
    boq.totalLabor = boq.rows.reduce((s, x) => s + x.laborCost, 0);
  }
  p.quantities = q.quantities;
  p.boq = boq;
  p.schedule = computeSchedule(q.quantities, boq);
  p.floorSummary = computeFloorSummary(boq, q.quantities.perFloor);
  p.updatedAt = new Date().toISOString();
  return p;
}

app.post('/api/projects', (req, res, next) => {
  try {
    const { name, plan, wallMaterial = 'brick', scheme } = req.body || {};
    const validPlan = plan ? validatePlan(plan) : validatePlan(samplePlan());
    // Apalka sxemasi HAR DOIM qo'llanadi. Standart — 'podval-1': qavat soni
    // qancha bo'lishidan qat'i nazar qolip faqat yer osti qavatlariga va
    // birinchi yer usti qavatiga qo'yiladi.
    const useScheme = scheme && FORMWORK_SCHEMES[scheme] ? scheme : 'podval-1';
    if (validPlan.floors?.length) {
      validPlan.floors = applyFormworkScheme(validPlan.floors, useScheme);
    }
    const p = {
      id: db.newId(),
      name: String(name || validPlan.meta?.name || 'Yangi loyiha').slice(0, 80),
      plan: validPlan,
      rates: {},
      priceOverrides: {},
      opts: { ...validateOpts({ wallMaterial }), rentMode: 'buy', rentMonths: 1 },
      createdAt: new Date().toISOString()
    };
    recalcProject(p);
    db.saveProject(p);
    res.json(p);
  } catch (e) { next(e); }
});

app.get('/api/projects', (req, res) => {
  res.json(db.listProjects().map((p) => ({
    id: p.id, name: p.name, createdAt: p.createdAt,
    facadeArea: p.quantities?.facadeArea,
    wallCount: p.plan?.walls?.length,
    floorCount: p.quantities?.floorCount,
    total: p.boq?.total
  })));
});

app.get('/api/projects/:id', (req, res) => {
  const p = db.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Loyiha topilmadi' });
  res.json(p);
});

app.put('/api/projects/:id', (req, res, next) => {
  try {
    const p = db.getProject(req.params.id);
    if (!p) return res.status(404).json({ error: 'Loyiha topilmadi' });
    const { rates, opts, name, plan, priceOverrides } = req.body || {};
    if (rates) p.rates = { ...p.rates, ...validateRates(rates) };
    if (opts) p.opts = { ...p.opts, ...validateOpts(opts) };
    if (name) p.name = String(name).slice(0, 80);
    if (plan) p.plan = validatePlan(plan);
    if (priceOverrides) p.priceOverrides = validatePriceOverrides(priceOverrides);
    recalcProject(p);
    db.saveProject(p);
    res.json(p);
  } catch (e) { next(e); }
});

app.delete('/api/projects/:id', (req, res) => {
  const ok = db.deleteProject(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Loyiha topilmadi' });
  res.json({ ok: true });
});

// Qavatlar: qo'shish/o'chirish/tahrirlash va har qavatda apalkani yoqish/o'chirish
app.put('/api/projects/:id/floors', (req, res, next) => {
  try {
    const p = db.getProject(req.params.id);
    if (!p) return res.status(404).json({ error: 'Loyiha topilmadi' });
    const floors = validateFloors(req.body?.floors);
    if (!floors) throw new ValidationError('Qavatlar ro‘yxati bo‘sh');
    p.plan = { ...p.plan, floors };
    recalcProject(p);
    db.saveProject(p);
    res.json(p);
  } catch (e) { next(e); }
});

app.get('/api/sample-plan', (req, res) => res.json({ plan: samplePlan() }));
app.get('/api/rates-defaults', (req, res) => res.json({ rates: DEFAULT_RATES }));
app.get('/api/ai-status', (req, res) => res.json({ enabled: aiEnabled() }));

// ---------- AI chat ----------
app.post('/api/ai/chat', async (req, res, next) => {
  const { message, history = [], projectId } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Xabar bo‘sh' });
  let context = null;
  if (projectId) {
    const p = db.getProject(projectId);
    if (p) {
      const q = p.quantities || {};
      const som = (n) => Math.round(Number(n) || 0).toLocaleString('uz-UZ');
      // AI taxmin qilmasligi uchun kontekstga QAVAT KESIMI va asosiy
      // pozitsiyalar to'liq beriladi — javob hisoblangan raqamlardan chiqadi
      const floors = (p.floorSummary || []).map((f) => (
        f.facade
          ? `  · ${f.name} (h=${f.height} m): qolip ${f.facadeArea} m2, ${f.panelCount} panel, ` +
            `${f.rows} pozitsiya, ${som(f.total)} so'm`
          : `  · ${f.name} (h=${f.height} m): APALKA QO'YILMAYDI — hisobga kirmaydi`
      )).join('\n');

      // Har qavat uchun asosiy aksessuar miqdorlari
      const byFloor = {};
      for (const r of p.boq?.rows || []) {
        (byFloor[r.floorName] ||= []).push(`${r.name.replace(/\s*\(.*?\)\s*/g, ' ').trim()}: ${r.qty} ${r.unit}`);
      }
      const items = Object.entries(byFloor)
        .map(([fl, list]) => `  ${fl}:\n    ${list.join('\n    ')}`)
        .join('\n');

      context =
        `Loyiha: ${p.name}\n` +
        `Qavatlar: ${q.floorCount} ta, yer usti balandligi ${q.totalHeight} m\n` +
        `Narxlash rejimi: ${q.rent ? 'ARENDA, ' + q.rentMonths + ' oy' : 'sotib olish'}\n` +
        `JAMI: qolip yuzasi ${q.facadeArea} m2 (ikki yuza, eshik/deraza chegirilgan), ` +
        `${q.panelCount} panel, ${p.boq?.rows?.length} pozitsiya, ${som(p.boq?.total)} so'm, ` +
        `montaj ${p.schedule?.totalDays} kun\n` +
        `QAVAT KESIMI:\n${floors}\n` +
        `SPETSIFIKATSIYA (qavat bo'yicha):\n${items}\n` +
        `MUHIM: bu raqamlar platformada hisoblangan — javob berganda aynan shulardan foydalaning, ` +
        `qayta taxmin qilmang va jamini qavatlarga bo'lmang.`;
    }
  }
  try {
    const safeHistory = Array.isArray(history)
      ? history.slice(-8).filter((h) => h && typeof h.content === 'string').map((h) => ({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.content.slice(0, 4000)
        }))
      : [];
    const answer = await chatAssistant(message.slice(0, 4000), safeHistory, context);
    res.json({ answer, demo: !aiEnabled() });
  } catch (e) { next(e); }
});

// ---------- Production static ----------
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) =>
    (req.path.startsWith('/api') || req.path.startsWith('/files')) ? next() : res.sendFile(path.join(dist, 'index.html')));
}

// ---------- Xatoliklarni yagona joyda ushlash ----------
app.use((err, req, res, _next) => {
  if (err instanceof ValidationError || err?.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Fayl juda katta (maksimal 30 MB)' });
  }
  console.error('[xato]', err?.message || err);
  res.status(500).json({ error: err?.message || 'Server xatosi' });
});

// ---------- Eski loyihalarni yangi hisob dvigateliga ko'chirish ----------
// Avvalgi versiyalarda maydon bir yuzada hisoblangan, TU va arenda yo'q edi.
// Saqlangan loyihalar birinchi ishga tushirishda qayta hisoblanadi.
function migrateProjects() {
  let n = 0;
  for (const p of db.listProjects()) {
    if (p.quantities?.faces === 2) continue; // allaqachon yangi dvigatel
    try {
      p.plan = validatePlan(p.plan || samplePlan());
      p.opts = { rentMode: 'buy', rentMonths: 1, ...validateOpts(p.opts || {}) };
      p.priceOverrides = validatePriceOverrides(p.priceOverrides);
      recalcProject(p);
      db.saveProject(p);
      n++;
    } catch (e) {
      console.warn(`[migratsiya] "${p.name}" qayta hisoblanmadi: ${e.message}`);
    }
  }
  if (n) console.log(`  Migratsiya: ${n} ta loyiha yangi hisob bo'yicha qayta hisoblandi`);
}

const PORT = Number(process.env.PORT) || 3001;
// Parol berilmagan bo'lsa server ochiq tarmoqqa chiqmaydi.
const HOST = process.env.HOST || (authEnabled() ? '0.0.0.0' : '127.0.0.1');

migrateProjects();

export const server = process.env.NODE_ENV === 'test' ? null : app.listen(PORT, HOST, () => {
  console.log(`ArxAI server: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  AI: ${aiEnabled() ? 'ULANGAN' : 'demo rejim'}`);
  console.log(`  Kirish: ${authEnabled() ? 'parol bilan himoyalangan' : 'PAROLSIZ — faqat 127.0.0.1 (tarmoqqa ochish uchun .env da APP_PASSWORD bering)'}`);
});

export { app };
