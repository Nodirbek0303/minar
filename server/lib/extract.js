import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

// ============================================================
//  Yuklangan hujjatlardan ma'lumot ajratib olish.
//
//   · DXF          — geometriya (dxf.js da tahlil qilinadi)
//   · rasm         — AI vision uchun to'g'ridan-to'g'ri
//   · PDF          — sahifalar rasmga o'giriladi (pdftoppm) + matn (pdftotext)
//   · DOCX / XLSX  — ZIP ichidagi XML dan matn
//   · TXT / CSV    — to'g'ridan-to'g'ri matn
//
//  Matn AI ga kontekst sifatida beriladi: qavatlar soni, balandliklar,
//  o'lchamlar va texnik talablar ko'pincha aynan hujjatlarda yozilgan bo'ladi.
// ============================================================

export const SUPPORTED_EXT = new Set([
  '.dxf', '.png', '.jpg', '.jpeg', '.webp', '.pdf', '.docx', '.xlsx', '.txt', '.csv',
  // DWG binar format — o'qib bo'lmaydi, lekin qabul qilinadi: foydalanuvchiga
  // "DXF ga saqlang" degan aniq ko'rsatma beriladi (jim rad etishdan yaxshiroq)
  '.dwg'
]);

export function fileKind(nameOrExt) {
  const ext = (nameOrExt.startsWith('.') ? nameOrExt : path.extname(nameOrExt)).toLowerCase();
  if (ext === '.dxf') return 'dxf';
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext === '.xlsx') return 'xlsx';
  if (['.txt', '.csv'].includes(ext)) return 'text';
  if (ext === '.dwg') return 'cad';
  return 'other';
}

export const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'
};

// ------------------------------------------------------------
//  Minimal ZIP o'quvchi (DOCX va XLSX — bular ZIP arxivlar).
//  Tashqi kutubxonasiz: markaziy katalog o'qiladi, kerakli fayl
//  zlib bilan ochiladi.
// ------------------------------------------------------------
function zipEntries(buf) {
  // Markaziy katalog oxiri (EOCD): 0x06054b50
  let eocd = -1;
  const from = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP tuzilmasi topilmadi (fayl buzilgan bo‘lishi mumkin)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count && off + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.set(name, { method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function zipRead(buf, entry) {
  // Lokal sarlavha: 0x04034b50
  const lo = entry.localOff;
  if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error('ZIP yozuvi buzilgan');
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compSize);
  if (entry.method === 0) return data;                 // siqilmagan
  if (entry.method === 8) return zlib.inflateRawSync(data); // deflate
  throw new Error('ZIP siqish usuli qo‘llanmaydi: ' + entry.method);
}

// XML dan o'qiladigan matn
function xmlToText(xml, { paraTags = ['w:p'], tabTags = ['w:tab'] } = {}) {
  let s = String(xml);
  for (const t of paraTags) s = s.split('</' + t + '>').join('\n');
  for (const t of tabTags) s = s.split('<' + t + '/>').join('\t');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
       .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
       .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function docxText(buf) {
  const entries = zipEntries(buf);
  const parts = [];
  for (const name of ['word/document.xml', 'word/header1.xml', 'word/footer1.xml']) {
    const e = entries.get(name);
    if (!e) continue;
    parts.push(xmlToText(zipRead(buf, e).toString('utf8')));
  }
  if (!parts.length) throw new Error('DOCX ichida matn topilmadi');
  return parts.join('\n').trim();
}

export function xlsxText(buf) {
  const entries = zipEntries(buf);
  // Umumiy satrlar jadvali
  const shared = [];
  const ss = entries.get('xl/sharedStrings.xml');
  if (ss) {
    const xml = zipRead(buf, ss).toString('utf8');
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(xmlToText(m[1], { paraTags: [], tabTags: [] }).replace(/\s+/g, ' ').trim());
    }
  }
  const lines = [];
  for (const [name, e] of entries) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
    const xml = zipRead(buf, e).toString('utf8');
    for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      // MUHIM: o'z-o'zidan yopiladigan bo'sh kataklar (<c r="A5" s="7"/>) ham
      // to'g'ri ushlanishi kerak — aks holda keyingi katakning qiymati
      // bo'sh katakka yopishib, butun qator siljib ketadi.
      // Ikki ko'rinish: <c .../> (bo'sh) va <c ...>...</c>
      for (const c of row[1].matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g)) {
        const attrs = (c[1] ?? c[2]) || '', body = c[3] || '';
        const tm = /\bt="([^"]+)"/.exec(attrs);
        const type = tm ? tm[1] : '';
        const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
        let val = vm ? vm[1] : '';
        // t="s" — umumiy satrlar jadvalidagi indeks; t="inlineStr" — ichma-ich matn
        if (type === 's' && val !== '') val = shared[Number(val)] ?? '';
        else if (type === 'inlineStr' || (!val && /<is>/.test(body))) {
          val = xmlToText(body, { paraTags: [], tabTags: [] }).replace(/\s+/g, ' ').trim();
        }
        if (val !== '') cells.push(val);
      }
      if (cells.length) lines.push(cells.join(' | '));
    }
  }
  if (!lines.length) throw new Error('XLSX ichida matn topilmadi');
  return lines.join('\n');
}

// ------------------------------------------------------------
//  PDF — poppler (pdftotext / pdftoppm) orqali
// ------------------------------------------------------------
export async function popplerAvailable() {
  try {
    await run('pdftoppm', ['-v']);
    return true;
  } catch {
    return false;
  }
}

export async function pdfText(file) {
  try {
    const { stdout } = await run('pdftotext', ['-layout', '-q', file, '-'], { maxBuffer: 8 * 1024 * 1024 });
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function pdfPageCount(file) {
  try {
    const { stdout } = await run('pdfinfo', [file]);
    const m = /Pages:\s*(\d+)/.exec(stdout);
    return m ? Number(m[1]) : 1;
  } catch {
    return 1;
  }
}

// PDF sahifalarini PNG rasmga o'girish (AI vision uchun).
// Qaytadi: vaqtinchalik PNG fayllar ro'yxati — ishlatib bo'lgach o'chiriladi.
export async function pdfToImages(file, maxPages = 6, dpi = 130) {
  if (!(await popplerAvailable())) {
    throw new Error('PDF o‘qish uchun serverda poppler-utils o‘rnatilishi kerak (sudo apt install poppler-utils)');
  }
  const pages = Math.min(maxPages, await pdfPageCount(file));
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'arxai-pdf-'));
  const prefix = path.join(dir, 'p');
  await run('pdftoppm', ['-png', '-r', String(dpi), '-f', '1', '-l', String(pages), file, prefix], {
    maxBuffer: 64 * 1024 * 1024
  });
  const files = (await fs.promises.readdir(dir))
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => path.join(dir, f));
  return { dir, files };
}

export async function cleanupDir(dir) {
  if (!dir) return;
  try { await fs.promises.rm(dir, { recursive: true, force: true }); } catch { /* muhim emas */ }
}

// ------------------------------------------------------------
//  Bitta fayldan matn (kontekst uchun)
// ------------------------------------------------------------
export async function textOf(file, kind) {
  try {
    if (kind === 'pdf') return await pdfText(file);
    if (kind === 'docx') return docxText(await fs.promises.readFile(file));
    if (kind === 'xlsx') return xlsxText(await fs.promises.readFile(file));
    if (kind === 'text') return (await fs.promises.readFile(file, 'utf8')).slice(0, 100000);
  } catch (e) {
    return '[o‘qib bo‘lmadi: ' + e.message + ']';
  }
  return '';
}

// Rasmni data URI ga o'girish (AI vision uchun)
export async function imageDataUri(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] || 'image/png';
  const buf = await fs.promises.readFile(file);
  return `data:${mime};base64,` + buf.toString('base64');
}
