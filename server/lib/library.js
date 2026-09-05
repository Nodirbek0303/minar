// ============================================================
//  Haqiqiy binolar kutubxonasi.
//
//  Manba: OpenStreetMap, O'zbekiston (Geofabrik, ODbL litsenziyasi).
//  1,63 million bino konturidan qolip hisobi uchun ma'nolilari
//  saralangan: 2 va undan ko'p qavatli, 200 m² dan katta — 41 755 ta.
//
//  Nima uchun kerak: foydalanuvchida chizma bo'lmasa ham tizimni
//  HAQIQIY bino ustida sinab ko'rishi mumkin. Demo uchun o'ylab
//  topilgan to'rtburchak emas, Toshkentdagi haqiqiy uy.
//
//  DIQQAT: OSM ma'lumoti mukammal emas — qavat soni 18% da, balandlik
//  atigi 0,6% da ko'rsatilgan, ba'zi yozuvlar esa ochiq xato
//  (100 000 m² li «2 qavatli uy»). Shuning uchun bu kutubxona
//  MANBA emas, NAMUNA: undan olingan kontur foydalanuvchi tomonidan
//  tasdiqlanishi kerak.
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'library', 'binolar.jsonl');

// Xotirada faqat YENGIL indeks turadi: konturlar fayldan o'qiladi.
// 41 755 kontur ~8 MB; hammasini xotiraga olsak 2 GB li serverda
// boshqa ishlarga joy qolmaydi.
let index = null;

export function load() {
  if (index) return index;
  if (!fs.existsSync(FILE)) { index = []; return index; }
  index = [];
  const lines = fs.readFileSync(FILE, 'utf8').split('\n');
  for (const line of lines) {
    if (!line) continue;
    try {
      const r = JSON.parse(line);
      index.push({ id: r.id, kind: r.kind, levels: r.levels,
                   name: r.name || null, areaM2: r.areaM2, poly: r.poly });
    } catch { /* buzuq qator tashlanadi */ }
  }
  return index;
}

/** Qidiruv: tur, qavat va maydon bo'yicha. */
export function search({ kind, minLevels, maxLevels, minArea, maxArea,
                         q, limit = 50 } = {}) {
  const all = load();
  const needle = (q || '').trim().toLowerCase();
  const out = [];
  for (const b of all) {
    if (kind && b.kind !== kind) continue;
    if (minLevels && b.levels < minLevels) continue;
    if (maxLevels && b.levels > maxLevels) continue;
    if (minArea && b.areaM2 < minArea) continue;
    if (maxArea && b.areaM2 > maxArea) continue;
    if (needle && !(b.name || '').toLowerCase().includes(needle)) continue;
    out.push({ id: b.id, kind: b.kind, levels: b.levels, name: b.name,
               areaM2: b.areaM2, points: b.poly.length });
    if (out.length >= limit) break;
  }
  return out;
}

/** Bitta binoning konturi — plan qurish uchun. */
export function get(id) {
  return load().find((b) => b.id === Number(id)) || null;
}

/**
 * Binoni hisob planiga aylantiradi.
 * Kontur tashqi devor bo'ladi; qalinlik va balandlik BERILADI, chunki
 * OSM da ular yo'q — o'ylab topilmasligi uchun standart qiymat aniq
 * ko'rsatiladi va foydalanuvchi uni o'zgartira oladi.
 */
export function toPlan(building, { thickness = 0.3, height = 3.0 } = {}) {
  if (!building) return null;
  const pts = building.poly;
  const walls = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.3) continue;          // OSM da mayda siniqlar ko'p
    walls.push({ id: `w${i}`, a, b, thickness, height, type: 'exterior' });
  }
  const floors = [];
  for (let i = 0; i < building.levels; i++) {
    floors.push({ id: `f${i}`, name: i === 0 ? '1-qavat' : `${i + 1}-qavat`,
                  height, facade: true });
  }
  return {
    meta: {
      name: building.name || `OSM bino ${building.id}`,
      source: 'osm',
      units: 'm',
      level: '1-qavat',
      note: 'Kontur OpenStreetMap dan (ODbL). Devor qalinligi va qavat '
          + 'balandligi OSM da yo\'q — standart qiymat qo\'yildi, tekshiring.',
      analysis: { walls: walls.length, areaM2: building.areaM2 }
    },
    floors, walls, openings: [], rooms: []
  };
}

export function stats() {
  const all = load();
  if (!all.length) return { total: 0 };
  const byKind = {}, byLevels = {};
  for (const b of all) {
    byKind[b.kind] = (byKind[b.kind] || 0) + 1;
    byLevels[b.levels] = (byLevels[b.levels] || 0) + 1;
  }
  return {
    total: all.length,
    source: 'OpenStreetMap / Geofabrik (ODbL)',
    region: "O'zbekiston",
    byKind, byLevels
  };
}
