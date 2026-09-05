// Aniqlikni o'lchash. «Yaxshi ishlayapti» degan gap raqam emas.
//
// Bu modulning o'zi ham xato qilishi mumkin, shuning uchun uning
// hisob-kitobi alohida tekshiriladi: noto'g'ri o'lchov noto'g'ri
// qarorga olib keladi.

import test from 'node:test';
import assert from 'node:assert/strict';
import { compareToModel, comparePlans, describe } from '../server/lib/accuracy.js';

const model = (walls) => ({ elements: walls });
const wall = (id, lengthM, heightM, areaM2) =>
  ({ id, kind: 'wall', name: 'D' + id, lengthM, heightM, areaM2, source: 'profile' });

// --- Model bilan solishtirish ------------------------------------------

test('mos kelgan yuza nol farq beradi', () => {
  const c = compareToModel(model([wall(1, 6, 3, 18)]));
  assert.equal(c.comparable, 1);
  assert.equal(c.medianDiffPct, 0);
  assert.equal(c.within2pct, 1);
});

test('farq foizda ko\'rsatiladi', () => {
  const c = compareToModel(model([wall(1, 6, 3, 20)]));   // 18 vs 20
  assert.equal(c.medianDiffPct, 10);        // median MUTLAQ farq
  assert.equal(c.worst[0].diffPct, -10);    // ishorasi qatorda saqlanadi
});

test('yuzasiz model solishtirilmaydi', () => {
  const c = compareToModel(model([wall(1, 6, 3, null)]));
  assert.equal(c.comparable, 0);
  assert.match(c.note, /yo'q/);
});

test('ikkala yuzani yozgan model aniqlanadi', () => {
  // LargeBuilding va TallBuilding shunday eksport qilingan. Buni
  // jimgina ikkiga bo'lish xato bo'lardi - o'lchov uni AYTISHI kerak.
  const c = compareToModel(model([
    wall(1, 6, 3, 36), wall(2, 4, 3, 24), wall(3, 5, 3, 30)
  ]));
  assert.equal(c.bothFacesInModel, true);
  assert.equal(c.medianDiffPct, 0);
  assert.match(describe(c), /ikkala yuzani/);
});

test('bitta yuzani yozgan model o\'zgartirilmaydi', () => {
  const c = compareToModel(model([
    wall(1, 6, 3, 18), wall(2, 4, 3, 12), wall(3, 5, 3, 15)
  ]));
  assert.equal(c.bothFacesInModel, false);
});

// --- Ikkita planni solishtirish ----------------------------------------

const plan = (walls) => ({ walls });
const w = (id, ax, ay, bx, by) => ({ id, a: [ax, ay], b: [bx, by] });

test('bir xil plan to\'liq mos keladi', () => {
  const p = plan([w('1', 0, 0, 10, 0), w('2', 10, 0, 10, 8)]);
  const c = comparePlans(p, p);
  assert.equal(c.recallPct, 100);
  assert.equal(c.precisionPct, 100);
  assert.equal(c.lengthDiffPct, 0);
});

test('topilmagan devor hisoblanadi', () => {
  const truth = plan([w('1', 0, 0, 10, 0), w('2', 10, 0, 10, 8)]);
  const got = plan([w('a', 0, 0, 10, 0)]);
  const c = comparePlans(truth, got);
  assert.equal(c.matched, 1);
  assert.equal(c.missed, 1);
  assert.equal(c.recallPct, 50);
});

test('ortiqcha devor ham hisoblanadi', () => {
  const truth = plan([w('1', 0, 0, 10, 0)]);
  const got = plan([w('a', 0, 0, 10, 0), w('b', 50, 50, 60, 50)]);
  const c = comparePlans(truth, got);
  assert.equal(c.extra, 1);
  assert.equal(c.precisionPct, 50);
});

test('teskari yo\'nalishdagi devor ham topiladi', () => {
  // AI devorni b->a tartibida o'qishi mumkin; bu xato emas.
  const truth = plan([w('1', 0, 0, 10, 0)]);
  const got = plan([w('a', 10, 0, 0, 0)]);
  assert.equal(comparePlans(truth, got).matched, 1);
});

test('uzunlik xatosi o\'lchanadi', () => {
  const truth = plan([w('1', 0, 0, 10, 0)]);
  const got = plan([w('a', 0, 0, 10.5, 0)]);
  const c = comparePlans(truth, got);
  assert.equal(c.matched, 1);
  assert.equal(c.meanLengthErrorM, 0.5);
  assert.equal(c.lengthDiffPct, 5);
});

test('bo\'sh plan yiqilmaydi', () => {
  const c = comparePlans(plan([]), plan([]));
  assert.equal(c.recallPct, 0);
  assert.equal(c.matched, 0);
});
