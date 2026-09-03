import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// ============================================================
//  JSON-fayl baza. Ma'lumot xotirada saqlanadi (har so'rovda fayl
//  qayta o'qilmaydi), yozuv esa NAVBAT bilan va ATOMIK bajariladi:
//  vaqtinchalik faylga yoziladi, keyin rename qilinadi. Shu sababli
//  parallel so'rovlar bir-birining yozuvini yo'qotmaydi va jarayon
//  yozuv o'rtasida to'xtasa ham db.json buzilmaydi.
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readDbFile() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return {
      projects: Array.isArray(data.projects) ? data.projects : [],
      files: data.files && typeof data.files === 'object' ? data.files : {}
    };
  } catch {
    return { projects: [], files: {} };
  }
}

// Yagona xotiradagi holat
const state = readDbFile();

// ------------------------------------------------------------
//  Zaxira nusxa. Server har ishga tushganda joriy db.json ning
//  nusxasi saqlanadi. Deploy, qo'lda tahrir yoki xato yozuv
//  ma'lumotni yo'qotsa, nusxadan tiklash mumkin.
// ------------------------------------------------------------
const BACKUP_KEEP = 10;

function makeBackup() {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    if (!state.projects.length && !Object.keys(state.files).length) return;
    const dir = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(DB_FILE, path.join(dir, `db-${stamp}.json`));
    // eskilarini tozalash
    const files = fs.readdirSync(dir).filter((f) => f.startsWith('db-')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - BACKUP_KEEP))) {
      fs.unlinkSync(path.join(dir, f));
    }
    console.log(`  Zaxira: ${state.projects.length} loyiha saqlandi (data/backups/)`);
  } catch (e) {
    console.warn('[zaxira] nusxa olinmadi:', e.message);
  }
}
makeBackup();

// Yozuv navbati: bir vaqtda faqat bitta yozuv, keyingisi kutadi
let writing = null;
let pending = false;

function flush() {
  if (writing) { pending = true; return writing; }
  writing = (async () => {
    do {
      pending = false;
      const tmp = DB_FILE + '.' + process.pid + '.tmp';
      const payload = JSON.stringify(state, null, 2);
      await fs.promises.writeFile(tmp, payload);
      await fs.promises.rename(tmp, DB_FILE); // atomik almashtirish
    } while (pending);
    writing = null;
  })();
  return writing;
}

export const db = {
  listProjects: () => state.projects,
  getProject: (id) => state.projects.find((p) => p.id === id) || null,
  saveProject(project) {
    const i = state.projects.findIndex((p) => p.id === project.id);
    if (i >= 0) state.projects[i] = project;
    else state.projects.unshift(project);
    flush();
    return project;
  },
  deleteProject(id) {
    const i = state.projects.findIndex((p) => p.id === id);
    if (i < 0) return false;
    state.projects.splice(i, 1);
    flush();
    return true;
  },
  getFile(id) {
    return state.files[id] || null;
  },
  saveFile(id, meta) {
    state.files[id] = meta;
    flush();
  },
  deleteFile(id) {
    delete state.files[id];
    flush();
  },
  // Yozuvlar diskka tushishini kutish (test va to'g'ri o'chirish uchun)
  flush: () => flush() || Promise.resolve(),
  newId: () => 'p' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex')
};

export function loadEnv() {
  const envFile = path.join(__dirname, '..', '..', '.env');
  const legacy = path.join(__dirname, '..', '.env'); // eski joylashuv
  for (const f of [envFile, legacy]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
