import express from 'express';
import * as limiter from './lib/ratelimit.js';
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
  buildFloors, applyFormworkScheme, FORMWORK_SCHEMES,
  computeVariants, VARIANTS, DEFAULT_VARIANT
} from './lib/calc.js';
import { analyzeImage, analyzeDocuments, chatAssistant, aiEnabled, aiProvider, supportsNativePdf, aiMisconfig } from './lib/ai.js';
import {
  SUPPORTED_EXT, fileKind, textOf, imageDataUri, pdfToImages, cleanupDir, popplerAvailable
} from './lib/extract.js';
import { parseFloorsFromText, parseSize, describeParsed } from './lib/docparse.js';
import { readIfc, ifcToPlan } from './lib/ifc.js';
import * as library from './lib/library.js';
import { detectRole, ROLES } from './lib/docrole.js';
import { parseSpecification, compareToSpec } from './lib/specparse.js';
import {
  validatePlan, validateFloors, validateRates, validatePriceOverrides, validateOpts, ValidationError, LIMITS
} from './lib/validate.js';
import {
  authEnabled, requireAuth, checkPassword, createSession, destroySession,
  sessionToken, setSessionCookie, clearSessionCookie
} from './lib/auth.js';

loadEnv();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
// nginx ortida turibmiz: haqiqiy mijoz IP si X-Forwarded-For da keladi.
// Busiz har so'rov 127.0.0.1 dek ko'rinadi va IP bo'yicha cheklov ishlamaydi
// (bitta hujumchi hammani qulflab qo'yardi).
app.set('trust proxy', 'loopback');

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
        'Qo‘llanmaydigan format: ' + ext + '. Mumkin: IFC, DXF, DWG, PDF, JPG, PNG, WEBP, DOCX, XLSX, TXT, CSV'));
    }
    cb(null, true);
  }
});

// ---------- Autentifikatsiya ----------
app.post('/api/login', async (req, res) => {
  if (!authEnabled()) return res.json({ ok: true, auth: false });

  // Parolni terib topishga qarshi: qulflangan IP umuman tekshirilmaydi.
  const ip = req.ip || 'nomalum';
  const gate = limiter.check(ip);
  if (!gate.allowed) {
    res.set('Retry-After', String(gate.retryAfterSec));
    return res.status(429).json({
      error: `Juda ko'p urinish. ${gate.retryAfterSec} soniyadan keyin qayta uring.`,
      retryAfterSec: gate.retryAfterSec
    });
  }

  if (!checkPassword(req.body?.password)) {
    const r = limiter.fail(ip);
    // Sekinlashtirish: odam sezmaydi, robot esa tezligini yo'qotadi.
    await limiter.delay();
    if (r.lockedSec) {
      res.set('Retry-After', String(r.lockedSec));
      return res.status(429).json({
        error: `Juda ko'p urinish. ${r.lockedSec} soniyadan keyin qayta uring.`,
        retryAfterSec: r.lockedSec
      });
    }
    return res.status(401).json({ error: 'Parol noto‘g‘ri' });
  }

  limiter.succeed(ip);
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
// Fayl nomini to'g'ri o'qish. multer/busboy nomni latin1 deb oladi, shuning uchun
// kirill (ruscha) nomlar buziladi: "Спецификация" → "Ð¡Ð¿ÐµÑ...".
// UTF-8 ga qaytarilmasa, hujjat roli fayl nomidan aniqlanmay qoladi.
function fixName(name) {
  const raw = String(name || '');
  if (!/[\u00C0-\u00FF]/.test(raw)) return raw;         // buzilish belgisi yo'q
  try {
    const fixed = Buffer.from(raw, 'latin1').toString('utf8');
    // Qayta o'girish kirill/lotin harf bergan bo'lsa — qabul qilamiz
    return /[\u0400-\u04FF\w]/.test(fixed) && !fixed.includes('\uFFFD') ? fixed : raw;
  } catch {
    return raw;
  }
}

const saveUploaded = (f, i) => {
  const id = 'f' + Date.now().toString(36) + i.toString(36);
  const name = fixName(f.originalname);
  const type = fileKind(name);
  const meta = { id, name, path: f.filename, type, size: f.size };
  db.saveFile(id, meta);
  return { fileId: id, name, type, size: f.size };
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

// Etalon spetsifikatsiyani tekshirish (tashqaridan kelgan ma'lumot)
function validateEtalon(e) {
  if (!e || typeof e !== 'object' || !Array.isArray(e.sections)) return null;
  const sections = e.sections.slice(0, 20).map((s) => ({
    title: String(s.title || 'Bo\'lim').slice(0, 120),
    items: (Array.isArray(s.items) ? s.items : []).slice(0, 500).map((i) => ({
      name: String(i.name || '').slice(0, 160),
      qty: Math.max(0, Math.min(1e9, Number(i.qty) || 0)),
      unit: String(i.unit || 'шт').slice(0, 16)
    })).filter((i) => i.name && i.qty > 0)
  })).filter((s) => s.items.length);
  if (!sections.length) return null;
  return {
    fileName: String(e.fileName || '').slice(0, 160),
    sections,
    total: sections.reduce((n, s) => n + s.items.length, 0),
    roles: Array.isArray(e.roles) ? e.roles.slice(0, 20) : []
  };
}

// BIM markaziga biriktirilgan manba fayllari. RVT/DWG native formatlari
// saqlanadi va versiyalanadi, ammo brauzerda ishonchli geometriya uchun IFC/DXF
// almashuv formati talab qilinadi. Bu "ochildi" degan soxta va'dadan saqlaydi.
function buildBimModels(sourceFiles) {
  if (!Array.isArray(sourceFiles)) return [];
  return sourceFiles.slice(0, 20).map((item, i) => {
    const f = db.getFile(typeof item === 'string' ? item : item?.fileId);
    if (!f) return null;
    const ext = path.extname(f.name).slice(1).toUpperCase();
    const discipline = f.type === 'ifc' ? 'BIM / IFC' : f.type === 'dxf' || f.type === 'cad' ? 'CAD' : 'Hujjat';
    const state = f.type === 'ifc' || f.type === 'dxf' ? 'ready' : f.type === 'cad' ? 'exchange_required' : 'reference';
    return {
      id: 'model-' + Date.now().toString(36) + '-' + i,
      fileId: f.id, name: f.name, format: ext || 'FILE', discipline, state,
      revision: 'P01', createdAt: new Date().toISOString()
    };
  }).filter(Boolean);
}

function validateBim(bim) {
  if (!bim || typeof bim !== 'object') return null;
  const models = Array.isArray(bim.models) ? bim.models.slice(0, 30).map((m, i) => ({
    id: String(m.id || 'model-' + i).slice(0, 60), fileId: String(m.fileId || '').slice(0, 80),
    name: String(m.name || 'Model').slice(0, 160), format: String(m.format || 'FILE').slice(0, 16),
    discipline: String(m.discipline || 'BIM').slice(0, 40),
    state: ['ready', 'reference', 'exchange_required', 'processing'].includes(m.state) ? m.state : 'reference',
    revision: String(m.revision || 'P01').slice(0, 30), createdAt: m.createdAt || new Date().toISOString()
  })) : [];
  const issues = Array.isArray(bim.issues) ? bim.issues.slice(0, 200).map((x, i) => ({
    id: String(x.id || 'issue-' + i).slice(0, 60), title: String(x.title || 'Koordinatsiya masalasi').slice(0, 160),
    discipline: String(x.discipline || 'Umumiy').slice(0, 40),
    status: ['open', 'in_progress', 'resolved'].includes(x.status) ? x.status : 'open',
    priority: ['low', 'normal', 'high'].includes(x.priority) ? x.priority : 'normal',
    createdAt: x.createdAt || new Date().toISOString()
  })) : [];
  return { models, issues, updatedAt: new Date().toISOString() };
}

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

  const report = [];       // har fayl bo'yicha holat va ROLI
  let etalon = null;       // topilgan tayyor spetsifikatsiya
  const images = [];       // AI vision uchun data URI lar
  const imageNames = [];
  const documents = [];    // Claude ga to'g'ridan-to'g'ri beriladigan PDF lar
  const texts = [];        // hujjat matnlari
  const tmpDirs = [];
  let dxfPlan = null, dxfFileName = null;
  let ifcPlan = null, ifcFileName = null;   // IFC dan qurilgan plan

  try {
    for (const f of files) {
      const full = path.join(UPLOAD_DIR, path.basename(f.path));
      const kind = f.type && f.type !== 'other' ? f.type : fileKind(f.name);
      // Hujjat roli: spetsifikatsiya / devor / perekrytiye / rigel / DWG ...
      let roleText = '';
      try {
        if (['pdf', 'docx', 'xlsx', 'text'].includes(kind)) roleText = await textOf(full, kind);
      } catch { /* rol aniqlashga xalal bermaydi */ }
      const role = detectRole(f.name, roleText, kind);

      // DWG — binar format, o'qib bo'lmaydi
      if (role.id === 'cad') {
        report.push({
          name: f.name, kind, role: role.id, roleTitle: role.title, ok: false,
          info: 'DWG binar format — AutoCAD da "Save As → DXF" qilib qayta yuklang'
        });
        continue;
      }

      // IFC — openBIM almashuv modeli. Endi undan GEOMETRIYA o'qiladi:
      // devor uchlari, qalinligi, ustun kesimi va qavatlar. Ilgari bu yerda
      // faqat sarlavha tekshirilardi va model hisobga kirmasdan chetda
      // qolardi — Revit dan chiqqan model foydasiz edi.
      if (kind === 'ifc') {
        const raw = await fs.promises.readFile(full, 'utf8');
        let model;
        try {
          model = readIfc(raw);
        } catch (err) {
          // IFC o'qilmasa qolgan fayllar natijasi yo'qolmasin
          report.push({ name: f.name, kind, role: 'bim', roleTitle: 'OpenBIM model',
                        ok: false, info: err.message });
          continue;
        }
        const c = model.stats.counts;
        const parts = [
          c.wall ? `${c.wall} devor` : null,
          c.column ? `${c.column} ustun` : null,
          c.slab ? `${c.slab} plita` : null,
          c.beam ? `${c.beam} to'sin` : null
        ].filter(Boolean);

        // Geometriya chiqqan bo'lsa — plan quriladi va hisobga tushadi.
        // Chiqmasa model baribir BIM markazida qoladi, lekin buni
        // yashirmaymiz: nima uchun hisobga kirmagani aytiladi.
        const built = ifcToPlan(model, { name: f.name.replace(/\.ifc$/i, '') });
        // Juda katta model butun tahlilni yiqitmasin: validatePlan uni rad
        // etib 400 qaytarardi va foydalanuvchi qolgan fayllar natijasini
        // ham ko'rmasdi. Endi shu model chetga qo'yiladi, sabab aytiladi.
        const tooBig = built.walls.length > LIMITS.MAX_WALLS;
        // Bir necha IFC yuklansa - devori ko'prog'i olinadi (DXF dagi kabi)
        if (!tooBig && built.walls.length >= 3 &&
            (!ifcPlan || built.walls.length > ifcPlan.walls.length)) {
          ifcPlan = built;
          ifcFileName = f.name;
        }
        const note = tooBig
          ? `model juda katta (${built.walls.length} devor, chegara ${LIMITS.MAX_WALLS}) — ` +
            'bitta qavatni alohida eksport qiling'
          : built.walls.length >= 3
            ? `plan IFC dan qurildi (${built.walls.length} devor, ${built.floors.length} qavat)`
            : 'geometriya yetarli emas — hisob uchun DXF yoki reja kerak';

        report.push({
          name: f.name, kind, role: 'bim', roleTitle: 'OpenBIM model', ok: true,
          info: `${model.schema} (${model.unit}): ${parts.join(', ') || 'element topilmadi'} — ${note}`,
          problems: model.problems
        });
        continue;
      }

      // Tayyor spetsifikatsiya — etalon sifatida saqlanadi, chizma emas
      if (role.id === 'spec' && roleText) {
        try {
          const parsed = parseSpecification(roleText, { fileName: f.name });
          if (parsed.total > 0) {
            etalon = parsed;
            report.push({
              name: f.name, kind, role: role.id, roleTitle: role.title, ok: true,
              info: `${parsed.total} pozitsiya, ${parsed.sections.length} bo‘lim — etalon sifatida olindi`
            });
            if (roleText) texts.push(`--- ${f.name} ---\n${roleText}`);
            continue;
          }
        } catch { /* oddiy hujjat sifatida davom etadi */ }
      }

      try {
        if (kind === 'dxf') {
          const raw = analyzeDxf(await fs.promises.readFile(full, 'utf8'), { units });
          // eng ko'p devorli DXF ni asosiy geometriya deb olamiz
          if (!dxfPlan || raw.walls.length > dxfPlan.walls.length) { dxfPlan = raw; dxfFileName = f.name; }
          report.push({ name: f.name, kind, role: role.id, roleTitle: role.title, ok: true, info: `${raw.walls.length} devor, ${raw.rooms.length} xona` });
        } else if (kind === 'image') {
          images.push(await imageDataUri(full));
          imageNames.push(f.name);
          report.push({ name: f.name, kind, role: role.id, roleTitle: role.title, ok: true, info: 'AI ko‘rish uchun qo‘shildi' });
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
            report.push({ name: f.name, kind, role: role.id, roleTitle: role.title, ok: true, info: `hujjat sifatida AI ga berildi${t ? ', matn ham o‘qildi' : ''}` });
          } else {
            const { dir, files: pages } = await pdfToImages(full, 6);
            tmpDirs.push(dir);
            for (const [i, pg] of pages.entries()) {
              images.push(await imageDataUri(pg));
              imageNames.push(`${f.name} (${i + 1}-sahifa)`);
            }
            report.push({ name: f.name, kind, role: role.id, roleTitle: role.title, ok: true, info: `${pages.length} sahifa rasmga o‘girildi${t ? ', matn o‘qildi' : ''}` });
          }
        } else if (['docx', 'xlsx', 'text'].includes(kind)) {
          const t = await textOf(full, kind);
          if (t) texts.push(`--- ${f.name} ---\n${t}`);
          report.push({ name: f.name, kind, role: role.id, roleTitle: role.title, ok: !!t, info: t ? `${t.length} belgi matn o‘qildi` : 'matn topilmadi' });
        } else {
          report.push({ name: f.name, kind, role: role.id, roleTitle: role.title, ok: false, info: 'qo‘llanmaydigan format' });
        }
      } catch (e) {
        report.push({ name: f.name, kind, role: 'unknown', roleTitle: ROLES.unknown.title, ok: false, info: e.message });
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

    // --- Geometriyani birlashtirish: DXF > IFC > AI ---
    // DXF birinchi bo'lib qoladi (hisob o'shanga kalibrlangan), lekin
    // endi DXF bo'lmasa IFC ishlaydi - ilgari bunday holatda model
    // butunlay chetda qolar va "chizma aniqlanmadi" deyilardi.
    let plan;
    if (dxfPlan) {
      plan = validatePlan(dxfPlan);
      plan.meta.analysis = dxfPlan.meta.analysis;
      plan.meta.source = 'dxf';
    } else if (ifcPlan) {
      plan = validatePlan(ifcPlan);
      plan.meta.analysis = ifcPlan.meta.analysis;
      plan.meta.source = 'ifc';
      plan.meta.name = ifcPlan.meta.name;
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
      etalon,
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
  const opts = {
    rates: p.rates || {},
    rent: p.opts?.rentMode === 'rent',
    rentMonths: p.opts?.rentMonths || 1,
    priceOverrides: p.priceOverrides || {}
  };
  // Ikkala tizim (мелкощитовая va крупнощитовая) TO'LIQ va alohida hisoblanadi
  const v = computeVariants(p.plan, opts);
  p.variants = { melki: v.melki, krupny: v.krupny };
  p.comparison = v.comparison;

  // Tanlangan variant — bosh ko'rsatkichlar, 5D va PDF shundan oladi
  const sel = VARIANTS[p.variant] ? p.variant : DEFAULT_VARIANT;
  p.variant = sel;
  const chosen = p.variants[sel];
  p.quantities = chosen.quantities;
  p.boq = chosen.boq;
  p.schedule = chosen.schedule;
  p.floorSummary = chosen.floorSummary;
  // Etalon spetsifikatsiya bo'lsa — hisobni u bilan solishtirish
  if (p.etalon?.sections?.length) {
    p.specCheck = {
      melki: compareToSpec(p.etalon, p.variants.melki.boq.rows),
      krupny: compareToSpec(p.etalon, p.variants.krupny.boq.rows)
    };
  } else {
    p.specCheck = null;
  }
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
      variant: VARIANTS[req.body?.variant] ? req.body.variant : DEFAULT_VARIANT,
      etalon: validateEtalon(req.body?.etalon),
      bim: { models: buildBimModels(req.body?.sourceFiles), issues: [], updatedAt: new Date().toISOString() },
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
    variant: p.variant,
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
    const { rates, opts, name, plan, priceOverrides, variant } = req.body || {};
    if (variant && VARIANTS[variant]) p.variant = variant;
    if (rates) p.rates = { ...p.rates, ...validateRates(rates) };
    if (opts) p.opts = { ...p.opts, ...validateOpts(opts) };
    if (name) p.name = String(name).slice(0, 80);
    if (plan) p.plan = validatePlan(plan);
    if (priceOverrides) p.priceOverrides = validatePriceOverrides(priceOverrides);
    if (req.body?.etalon !== undefined) p.etalon = validateEtalon(req.body.etalon);
    if (req.body?.bim !== undefined) p.bim = validateBim(req.body.bim);
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

// ---------- Haqiqiy binolar kutubxonasi ----------
// OpenStreetMap dan olingan O'zbekiston binolari. Chizma bo'lmasa ham
// tizimni haqiqiy bino ustida sinab ko'rish mumkin.
app.get('/api/library', (req, res) => {
  const num = (v) => (v === undefined ? undefined : Number(v));
  const results = library.search({
    kind: req.query.kind, q: req.query.q,
    minLevels: num(req.query.minLevels), maxLevels: num(req.query.maxLevels),
    minArea: num(req.query.minArea), maxArea: num(req.query.maxArea),
    limit: Math.min(Number(req.query.limit) || 50, 200)
  });
  res.json({ results, stats: library.stats() });
});

app.get('/api/library/:id', (req, res) => {
  const b = library.get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Bino topilmadi' });
  res.json({ building: b });
});

// Kutubxonadagi binodan hisob plani. Devor qalinligi va qavat balandligi
// OSM da YO'Q - ular parametr sifatida beriladi va javobda izoh qoladi.
app.post('/api/library/:id/plan', (req, res, next) => {
  try {
    const b = library.get(req.params.id);
    if (!b) return res.status(404).json({ error: 'Bino topilmadi' });
    const thickness = Math.min(Math.max(Number(req.body?.thickness) || 0.3, 0.1), 1.5);
    const height = Math.min(Math.max(Number(req.body?.height) || 3.0, 2.0), 8.0);
    const plan = validatePlan(library.toPlan(b, { thickness, height }));
    res.json({ plan });
  } catch (e) { next(e); }
});

app.get('/api/sample-plan', (req, res) => res.json({ plan: samplePlan() }));
app.get('/api/rates-defaults', (req, res) => res.json({ rates: DEFAULT_RATES }));
app.get('/api/variants', (req, res) => res.json({ variants: VARIANTS, default: DEFAULT_VARIANT }));
// `enabled` faqat «kalit bor» degani. Sozlama ziddiyatli bo'lsa buni
// AYTAMIZ: ilgari Anthropic kaliti OpenAI manziliga yuborilib, har
// chaqiruv 401 qaytarardi, ekranda esa «AI: ulangan» turardi.
app.get('/api/ai-status', (req, res) => res.json({
  enabled: aiEnabled(), provider: aiProvider(), warning: aiMisconfig()
}));

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
    if (p.quantities?.faces === 2 && p.variants) continue; // allaqachon yangi dvigatel
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
  console.log(`  AI: ${aiEnabled() ? `kalit bor (${aiProvider()})` : 'demo rejim'}`);
  const warn = aiMisconfig();
  if (warn) console.log(`  DIQQAT: ${warn}`);
  console.log(`  Kirish: ${authEnabled() ? 'parol bilan himoyalangan' : 'PAROLSIZ — faqat 127.0.0.1 (tarmoqqa ochish uchun .env da APP_PASSWORD bering)'}`);
});

export { app };
