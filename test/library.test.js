// Haqiqiy binolar kutubxonasi (OpenStreetMap, ODbL).
//
// Asosiy talab: OSM ma'lumoti MUKAMMAL EMAS va buni yashirmaslik kerak.
// Qavat soni 18% da, balandlik 0,6% da ko'rsatilgan; ba'zi yozuvlar esa
// ochiq xato. Shuning uchun kutubxona MANBA emas, NAMUNA - undan
// olingan qiymatlar foydalanuvchi tomonidan tasdiqlanishi kerak.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as library from '../server/lib/library.js';

test('kutubxona yuklanadi', () => {
  const s = library.stats();
  assert.ok(s.total > 1000, `atigi ${s.total} bino`);
  assert.match(s.source, /OpenStreetMap/);
});

test('qavat bo\'yicha saralanadi', () => {
  const r = library.search({ minLevels: 5, limit: 20 });
  assert.ok(r.length > 0);
  for (const b of r) assert.ok(b.levels >= 5, `${b.levels} qavat chiqdi`);
});

test('maydon bo\'yicha saralanadi', () => {
  const r = library.search({ minArea: 2000, maxArea: 5000, limit: 20 });
  for (const b of r) assert.ok(b.areaM2 >= 2000 && b.areaM2 <= 5000);
});

test('nom bo\'yicha qidiriladi', () => {
  const r = library.search({ q: 'artel', limit: 5 });
  for (const b of r) assert.match((b.name || '').toLowerCase(), /artel/);
});

test('chegara hurmat qilinadi', () => {
  assert.ok(library.search({ limit: 7 }).length <= 7);
});

// --- Planga aylantirish ------------------------------------------------

test('bino hisob planiga aylanadi', () => {
  const b = library.search({ minLevels: 3, minArea: 500, limit: 1 })[0];
  const plan = library.toPlan(library.get(b.id));
  assert.equal(plan.meta.source, 'osm');
  assert.ok(plan.walls.length >= 3, `${plan.walls.length} devor`);
  assert.equal(plan.floors.length, b.levels);
  for (const w of plan.walls) assert.equal(w.type, 'exterior');
});

test('OSM da yo\'q qiymatlar berilishi kerak va izohda aytiladi', () => {
  // Devor qalinligi va qavat balandligi OSM da YO'Q. Ularni jimgina
  // o'ylab topsak, foydalanuvchi ular o'lchangan deb o'ylaydi.
  const b = library.get(library.search({ limit: 1 })[0].id);
  const plan = library.toPlan(b, { thickness: 0.4, height: 3.5 });
  assert.equal(plan.walls[0].thickness, 0.4);
  assert.equal(plan.floors[0].height, 3.5);
  assert.match(plan.meta.note, /standart qiymat/);
});

test('mayda siniqlar tashlanadi', () => {
  // OSM konturlarida 5-10 sm li siniqlar ko'p; ular devor emas.
  const plan = library.toPlan({
    id: 1, kind: 'yes', levels: 2, areaM2: 100,
    poly: [[0, 0], [10, 0], [10.05, 0.05], [10, 8], [0, 8]]
  });
  assert.equal(plan.walls.length, 4);
});

test('yo\'q bino null qaytaradi', () => {
  assert.equal(library.get(-1), null);
  assert.equal(library.toPlan(null), null);
});
