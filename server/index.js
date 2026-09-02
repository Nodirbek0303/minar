import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, UPLOAD_DIR, loadEnv } from './lib/db.js';
import { analyzeDxf, UNIT_FACTORS } from './lib/dxf.js';
import { samplePlan } from './lib/samplePlan.js';
import { computeQuantities, computeBOQ, computeSchedule, computeFloorSummary, DEFAULT_RATES } from './lib/calc.js';
import { analyzeImage, chatAssistant, aiEnabled } from './lib/ai.js';
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

const ALLOWED_EXT = new Set(['.dxf', '.png', '.jpg', '.jpeg', '.webp']);
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + path.basename(file.originalname).replace(/[^\w.\-]/g, '_'))
  }),
  limits: { fileSize: 30 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new ValidationError('Faqat DXF yoki rasm (PNG/JPG/WEBP) yuklash mumkin'));
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

// ---------- Upload ----------
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fayl yuklanmadi' });
  const id = 'f' + Date.now().toString(36);
  const ext = path.extname(req.file.originalname).toLowerCase();
  const type = ext === '.dxf' ? 'dxf' : 'image';
  db.saveFile(id, { id, name: req.file.originalname, path: req.file.filename, type, size: req.file.size });
  res.json({ fileId: id, name: req.file.originalname, type });
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
    const { name, plan, wallMaterial = 'brick' } = req.body || {};
    const validPlan = plan ? validatePlan(plan) : validatePlan(samplePlan());
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
      context = `Loyiha: ${p.name}; qavatlar ${q.floorCount}; bino balandligi ${q.totalHeight} m; ` +
        `qolip (apalka) yuzasi ${q.facadeArea} m2 (ikki yuza, ochiqliklar chegirilgan); ` +
        `panellar ${q.panelCount} dona; montaj muddati ${p.schedule?.totalDays} kun; ` +
        `smeta ${p.boq?.total} so'm (${q.rent ? 'arenda ' + q.rentMonths + ' oy' : 'sotib olish'}).`;
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
