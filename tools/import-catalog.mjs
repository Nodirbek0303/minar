#!/usr/bin/env node
// ============================================================
//  MINAR katalogini XLSX dan shared/catalog.json ga o'tkazish.
//
//  Foydalanish:  node tools/import-catalog.mjs "<katalog.xlsx>"
//
//  Nomlar fayldagidek AYNAN saqlanadi (rus tilida) — spetsifikatsiya
//  mijozga shu nomlar bilan chiqadi. O'lchamlar va og'irliklar ham
//  faqat fayldan olinadi, hech qanday taxminiy qiymat qo'shilmaydi.
// ============================================================
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- minimal ZIP o'quvchi (extract.js dagi bilan bir xil mantiq) ----------
function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP tuzilmasi topilmadi');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < count && off + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    out.set(buf.toString('utf8', off + 46, off + 46 + nameLen), { method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
function zipRead(buf, e) {
  const nameLen = buf.readUInt16LE(e.localOff + 26);
  const extraLen = buf.readUInt16LE(e.localOff + 28);
  const start = e.localOff + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + e.compSize);
  return e.method === 8 ? zlib.inflateRawSync(data) : data;
}

const unesc = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&amp;/g, '&');

// ---------- varaqni katak-katak o'qish ----------
function readSheet(buf) {
  const entries = zipEntries(buf);
  const shared = [];
  const ss = entries.get('xl/sharedStrings.xml');
  if (ss) {
    const xml = zipRead(buf, ss).toString('utf8');
    for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const t = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('');
      shared.push(unesc(t).replace(/\s+/g, ' ').trim());
    }
  }
  const sheetName = [...entries.keys()].find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n));
  const xml = zipRead(buf, entries.get(sheetName)).toString('utf8');
  // O'z-o'zidan yopiladigan kataklarni ham to'g'ri ushlaydi: <c r="A5" s="7"/>
  const CELL = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const rows = new Map();
  for (const m of xml.matchAll(CELL)) {
    const [, col, rn, attrs, body = ''] = m;
    const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
    let val = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
    if (t === 's' && val !== '') val = shared[Number(val)] ?? '';
    else if (t === 'inlineStr') val = unesc((/<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? '')).trim();
    if (val === '') continue;
    if (!rows.has(+rn)) rows.set(+rn, {});
    rows.get(+rn)[col] = val;
  }
  return rows;
}

// ---------- nomdan o'lchamlarni ajratish ----------
const num = (s) => Number(String(s).replace(',', '.'));
// "0,2" (metr) yoki "200" (millimetr) → millimetr
const toMm = (s) => {
  const v = num(s);
  if (!Number.isFinite(v)) return null;
  return String(s).includes(',') || v < 10 ? Math.round(v * 1000) : Math.round(v);
};

function parseItem(name, unit, kg) {
  const n = name.trim();
  const w = Number.isFinite(kg) ? +Number(kg).toFixed(3) : null;
  const base = { name: n, unit: unit || 'шт', kg: w };

  // КМО (Щит) 200х300  — mayda shtitli panel, o'lcham millimetrda
  let m = /^КМО\s*\(\s*щит\s*\)\s*(\d+)\s*[хx×]\s*(\d+)/i.exec(n);
  if (m) return { ...base, kind: 'panel', family: 'kmo', w: +m[1], h: +m[2] };

  // ЩЛ (3,0) 0,2х3,0  — katta linear panel, o'lcham metrda
  m = /^ЩЛ\s*\([^)]*\)\s*([\d,.]+)\s*[хx×]\s*([\d,.]+)/i.exec(n);
  if (m) return { ...base, kind: 'panel', family: 'shl', w: toMm(m[1]), h: toMm(m[2]) };

  // ЩУ (3,0) 0,6х1,5 — universal katta panel
  m = /^ЩУ\s*\([^)]*\)\s*([\d,.]+)\s*[хx×]\s*([\d,.]+)/i.exec(n);
  if (m) return { ...base, kind: 'panel', family: 'shu', w: toMm(m[1]), h: toMm(m[2]) };

  // ЩУР 0,3х0,3х0,6 — ustun qolipi (uch o'lchov)
  m = /^ЩУР\s+([\d,.]+)\s*[хx×]\s*([\d,.]+)\s*[хx×]\s*([\d,.]+)/i.exec(n);
  if (m) return { ...base, kind: 'column', family: 'shur', a: toMm(m[1]), b: toMm(m[2]), h: toMm(m[3]) };

  // ЩУВ / ЩУВУ / ЩШ / ЩУН — burchak va ustun elementlari (a×b×h)
  m = /^(ЩУВУ левый и правый|ЩУВУ левый|ЩУВУ правый|ЩУВ|ЩШ|ЩУН)\s*\([^)]*\)\s*([\d,.]+)\s*[хx×]\s*([\d,.]+)\s*[хx×]\s*([\d,.]+)/i.exec(n);
  if (m) {
    const fam = m[1].toLowerCase().replace(/\s+/g, '_');
    return { ...base, kind: 'corner', family: fam, a: toMm(m[2]), b: toMm(m[3]), h: toMm(m[4]) };
  }

  // Угол внутренний 100/100х1500 / Угол наружний 63/63х3800
  m = /^Угол\s+(внутренний|наружний)\s+(?:П\.М\.\s*)?(\d+)\s*\/\s*(\d+)(?:\s*[хx×]\s*(\d+))?/i.exec(n);
  if (m) {
    return {
      ...base, kind: 'angle', family: m[1].toLowerCase() === 'внутренний' ? 'angle_in' : 'angle_out',
      a: +m[2], b: +m[3], h: m[4] ? +m[4] : null
    };
  }

  // УЭ 0,60 — uzaytirish elementi
  m = /^УЭ\s+([\d,.]+)/i.exec(n);
  if (m) return { ...base, kind: 'extension', family: 'ue', len: toMm(m[1]) };

  // Балка выравнивающая(, угловая), 1,2
  m = /^Балка выравнивающая(\s+угловая)?,\s*([\d,.]+)/i.exec(n);
  if (m) return { ...base, kind: 'beam', family: m[1] ? 'beam_corner' : 'beam', len: toMm(m[2]) };

  // Винт стяжной (заготовка) БМ/16/, 1м (Тайрот) — tyaga/tayrot
  m = /^Винт стяжной(\s+заготовка)?\s+БМ\/(\d+)\/,\s*([\d,.]+)\s*м/i.exec(n);
  if (m) return { ...base, kind: 'tie', family: m[1] ? 'tie_blank' : 'tie', d: +m[2], len: toMm(m[3]) };

  // Тяга 200
  m = /^Тяга\s+(\d+)/i.exec(n);
  if (m) return { ...base, kind: 'pull', family: 'pull', len: +m[1] };

  // Подкос винтовой одноуровневый/двухуровневый, 2,9
  m = /^Подкос винтовой (одноуровневый|двухуровневый),?\s*([\d,.]+)?/i.exec(n);
  if (m) {
    return {
      ...base, kind: 'brace',
      family: m[1].toLowerCase() === 'одноуровневый' ? 'brace_1' : 'brace_2',
      len: m[2] ? toMm(m[2]) : null
    };
  }

  // Qolgan hammasi — nomli aksessuar
  return { ...base, kind: 'accessory', family: null };
}

// ---------- asosiy ----------
const src = process.argv[2];
if (!src) {
  console.error('Foydalanish: node tools/import-catalog.mjs "<katalog.xlsx>"');
  process.exit(1);
}
const buf = fs.readFileSync(src);
const rows = readSheet(buf);

const items = [];
const skipped = [];
for (const rn of [...rows.keys()].sort((a, b) => a - b)) {
  const c = rows.get(rn);
  const name = (c.B || '').trim();
  if (!name || /^наименование$/i.test(name)) continue;
  const kg = c.E !== undefined && c.E !== '' ? Number(c.E) : null;
  const it = parseItem(name, c.D, kg);
  it.row = rn;
  if (c.C) it.thickness = Number(c.C);
  items.push(it);
  if (it.kind === 'accessory' && !/^[А-ЯЁA-Z]/.test(name)) skipped.push(name);
}

// O'lchamlari to'liq bo'lmagan panellarni ajratib olamiz (hisobga kirmaydi)
const usablePanels = items.filter((i) => i.kind === 'panel' && i.w > 0 && i.h > 0 && i.kg > 0);

const byFamily = (kind, family) => items.filter((i) => i.kind === kind && (!family || i.family === family));

const catalog = {
  source: path.basename(src),
  importedAt: new Date().toISOString(),
  total: items.length,
  // Devor qolipi panellari — hisob-kitob AYNAN shu o'lchamlar bilan yuritiladi
  panels: {
    kmo: { title: 'КМО (Щит) — mayda shtitli panel', items: usablePanels.filter((i) => i.family === 'kmo').map(({ name, w, h, kg }) => ({ name, w, h, kg })) },
    shl: { title: 'ЩЛ — katta linear panel', items: usablePanels.filter((i) => i.family === 'shl').map(({ name, w, h, kg }) => ({ name, w, h, kg })) },
    shu: { title: 'ЩУ — universal katta panel', items: usablePanels.filter((i) => i.family === 'shu').map(({ name, w, h, kg }) => ({ name, w, h, kg })) }
  },
  columns: byFamily('column').map(({ name, a, b, h, kg, unit }) => ({ name, a, b, h, kg, unit })),
  corners: byFamily('corner').map(({ name, family, a, b, h, kg, unit }) => ({ name, family, a, b, h, kg, unit })),
  angles: byFamily('angle').map(({ name, family, a, b, h, kg, unit }) => ({ name, family, a, b, h, kg, unit })),
  extensions: byFamily('extension').map(({ name, len, kg, unit }) => ({ name, len, kg, unit })),
  beams: byFamily('beam').map(({ name, family, len, kg, unit }) => ({ name, family, len, kg, unit })),
  ties: byFamily('tie').map(({ name, family, d, len, kg, unit }) => ({ name, family, d, len, kg, unit })),
  pulls: byFamily('pull').map(({ name, len, kg, unit }) => ({ name, len, kg, unit })),
  braces: byFamily('brace').map(({ name, family, len, kg, unit }) => ({ name, family, len, kg, unit })),
  accessories: byFamily('accessory').map(({ name, kg, unit }) => ({ name, kg, unit }))
};

// ES modul sifatida yoziladi — Node ham, Vite ham import atributlarisiz o'qiydi
const out = path.join(__dirname, '..', 'shared', 'catalog.js');
fs.writeFileSync(out,
  '// AVTOMATIK YARATILGAN — QO\'LDA TAHRIRLAMANG.\n' +
  '// Manba: ' + path.basename(src) + '\n' +
  '// Qayta yaratish: node tools/import-catalog.mjs "<katalog.xlsx>"\n' +
  '// Nomlar, o\'lchamlar va og\'irliklar fayldan AYNAN olingan.\n\n' +
  'export const CATALOG = ' + JSON.stringify(catalog, null, 1) + ';\n');

console.log(`Katalog o'qildi: ${items.length} pozitsiya → ${path.relative(process.cwd(), out)}`);
for (const [k, v] of Object.entries(catalog.panels)) {
  const ws = [...new Set(v.items.map((i) => i.w))].sort((a, b) => a - b);
  const hs = [...new Set(v.items.map((i) => i.h))].sort((a, b) => a - b);
  console.log(`  ${k.toUpperCase().padEnd(4)} ${String(v.items.length).padStart(3)} panel | eni: ${ws.join(', ')} | balandligi: ${hs.join(', ')}`);
}
for (const k of ['columns', 'corners', 'angles', 'extensions', 'beams', 'ties', 'pulls', 'braces', 'accessories']) {
  console.log(`  ${k.padEnd(12)} ${String(catalog[k].length).padStart(3)}`);
}
