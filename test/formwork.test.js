import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MINAR, FORMWORK_NORMS, fillLinear, layoutWallFace, layoutWallFaceWithOpenings,
  computeFormwork, panelSpec, pickTU, exteriorWallsOf, openingsOfWall, deckAreaOf
} from '../shared/formwork.js';

const FL = (over = {}) => ({
  id: 'f1', name: '1-qavat', height: 3, facade: true,
  formwork: { type: 'msho', color: 'RAL3020' }, ...over
});

// 4×4 m kvadrat bino, bitta tashqi devorda eshik
const boxPlan = (over = {}) => ({
  meta: { name: 'test' },
  walls: [
    { id: 'w1', a: [0, 0], b: [4, 0], thickness: 0.3, height: 3, type: 'exterior' },
    { id: 'w2', a: [4, 0], b: [4, 4], thickness: 0.3, height: 3, type: 'exterior' },
    { id: 'w3', a: [4, 4], b: [0, 4], thickness: 0.3, height: 3, type: 'exterior' },
    { id: 'w4', a: [0, 4], b: [0, 0], thickness: 0.3, height: 3, type: 'exterior' }
  ],
  openings: [],
  rooms: [{ id: 'r1', name: 'Zal', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
  ...over
});

test('fillLinear: uzunlikni aniq yoki minimal ortiqcha bilan yopadi', () => {
  const r = fillLinear(3000, [600, 500, 400, 300]);
  const covered = Object.entries(r.counts).reduce((s, [w, c]) => s + Number(w) * c, 0);
  assert.equal(covered, r.covered);
  assert.equal(r.covered, 3000, 'yaxlit uzunlik aniq yopilishi kerak');
  assert.equal(r.waste, 0);
});

test('fillLinear: yopib bo\'lmaydigan uzunlikda ortiqcha minimal bo\'ladi', () => {
  const r = fillLinear(1010, [600, 400]);
  assert.ok(r.covered >= 1010, 'yopilgan uzunlik talabdan kam bo\'lmasligi kerak');
  assert.ok(r.waste <= 600, 'ortiqcha eng katta paneldan oshmasligi kerak');
});

test('fillLinear: juda uzun devor bo\'laklarga bo\'linadi (xotira chegarasi)', () => {
  const long = FORMWORK_NORMS.DP_CHUNK_M * 1000 * 3 + 1234;
  const r = fillLinear(long, MINAR.msho.widths);
  assert.ok(r.covered >= long);
  assert.ok(r.covered - long < 5000, 'bo\'laklarga bo\'linganda ham ortiqcha kichik qolishi kerak');
});

test('layoutWallFace: katalogda yo\'q kombinatsiya (1500×500, 1500×600) ishlatilmaydi', () => {
  const f = layoutWallFace({ type: 'msho', lenM: 6, hM: 3 });
  for (const key of Object.keys(f.panelCounts)) {
    assert.ok(key !== '500x1500' && key !== '600x1500', 'taqiqlangan kombinatsiya: ' + key);
  }
  assert.ok(f.totalPanels > 0);
});

test('layoutWallFace: panellar yig\'indisi devor balandligini qoplaydi', () => {
  const H = 3;
  const f = layoutWallFace({ type: 'msho', lenM: 5, hM: H });
  const rowsH = f.rowPlans.reduce((s, r) => s + r.h, 0) / 1000;
  assert.ok(rowsH >= H - FORMWORK_NORMS.GAP_M - 0.001, `qatorlar balandligi ${rowsH} < ${H}`);
});

test('layoutWallFaceWithOpenings: eshik o\'rniga panel qo\'yilmaydi', () => {
  const full = layoutWallFaceWithOpenings({ type: 'msho', lenM: 6, hM: 3, openings: [] });
  const withDoor = layoutWallFaceWithOpenings({
    type: 'msho', lenM: 6, hM: 3,
    openings: [{ x0: 2, x1: 3, y0: 0, y1: 2.1 }]
  });
  assert.ok(withDoor.areaM2 < full.areaM2, 'ochiqlikli devor yuzasi kichikroq bo\'lishi kerak');
  assert.ok(withDoor.totalPanels < full.totalPanels, 'ochiqlikli devorda panel kamroq bo\'lishi kerak');
  // eshik yuzasi (1 × 2.1 = 2.1 m²) taxminan chegirilgan bo'lishi kerak
  assert.ok(full.areaM2 - withDoor.areaM2 >= 1.5, 'eshik yuzasi chegirilmadi');
});

test('layoutWallFaceWithOpenings: deraza ustidagi va ostidagi bo\'lak yopiladi', () => {
  const r = layoutWallFaceWithOpenings({
    type: 'msho', lenM: 4, hM: 3,
    openings: [{ x0: 1, x1: 2.5, y0: 0.9, y1: 2.3 }]
  });
  const inWindowBand = r.segments.filter((s) => s.x >= 0.99 && s.x + s.lenM <= 2.51);
  assert.ok(inWindowBand.length >= 1, 'deraza tepasi/ostida panel segmenti bo\'lishi kerak');
  for (const s of inWindowBand) {
    const overlaps = s.y < 2.3 - 0.001 && s.y + s.hM > 0.9 + 0.001;
    assert.ok(!overlaps, `segment deraza o'rniga tushib qolgan: y=${s.y} h=${s.hM}`);
  }
});

test('panelSpec: og\'irlik katalog kg/m² ga mos', () => {
  const s = panelSpec('msho', 600, 1200);
  assert.equal(s.area, 0.72);
  assert.equal(s.weight, +(0.72 * 26).toFixed(2));
  assert.equal(panelSpec('msho', 600, 1500), null, 'taqiqlangan kombinatsiya null qaytarishi kerak');
});

test('pickTU: qavat balandligiga mos model tanlanadi', () => {
  assert.equal(pickTU(1.8).id, 'TU3.2');
  assert.equal(pickTU(2.8).id, 'TU3.7');
  assert.equal(pickTU(4.0).id, 'TU4.2');
});

test('computeFormwork: IKKI yuza hisoblanadi', () => {
  const plan = boxPlan();
  const floors = [FL()];
  const { byFloor } = computeFormwork({ plan, floors, rates: {} });
  // 4 ta 4 m devor × 3 m balandlik × 2 yuza = 96 m²
  assert.ok(Math.abs(byFloor.f1.area - 96) < 3, `yuza ${byFloor.f1.area}, kutilgan ~96`);
});

test('computeFormwork: TU, uch oyoq va univilka spetsifikatsiyada bor', () => {
  const { rows } = computeFormwork({ plan: boxPlan(), floors: [FL()], rates: {} });
  const keys = new Set(rows.map((r) => r.baseKey));
  for (const k of ['qolip_panel', 'qolip_zamok', 'qolip_klin', 'qolip_tyaga', 'qolip_gayka',
    'qolip_ushlagich', 'qolip_brace', 'qolip_truba_v', 'qolip_truba_h', 'qolip_tu',
    'qolip_uchoyoq', 'qolip_univilka']) {
    assert.ok(keys.has(k), 'yetishmayapti: ' + k);
  }
  const tu = rows.find((r) => r.baseKey === 'qolip_tu');
  // 16 m² pol / 1.5 = 11 dona
  assert.equal(tu.qty, Math.ceil(16 / FORMWORK_NORMS.TU_AREA_PER_POST_M2));
  const tripod = rows.find((r) => r.baseKey === 'qolip_uchoyoq');
  assert.equal(tripod.qty, tu.qty, 'har ustunga bitta uch oyoq');
});

test('computeFormwork: arenda rejimi oylik tarif × oylar bo\'yicha narxlaydi', () => {
  const plan = boxPlan();
  const buy = computeFormwork({ plan, floors: [FL()], rates: {}, rent: false });
  const rent1 = computeFormwork({ plan, floors: [FL()], rates: {}, rent: true, months: 1 });
  const rent3 = computeFormwork({ plan, floors: [FL()], rates: {}, rent: true, months: 3 });

  const zamokBuy = buy.rows.find((r) => r.baseKey === 'qolip_zamok');
  const zamok1 = rent1.rows.find((r) => r.baseKey === 'qolip_zamok');
  const zamok3 = rent3.rows.find((r) => r.baseKey === 'qolip_zamok');

  assert.equal(zamokBuy.matKey, 'minar_zamok', 'sotib olishda katalog narx kaliti');
  assert.equal(zamokBuy.matRateOverride, null);
  assert.equal(zamok1.matRateOverride, 8000, 'arendada oylik tarif');
  assert.equal(zamok3.matRateOverride, 24000, '3 oy = 3 × oylik tarif');
  assert.equal(zamok1.qty, zamok3.qty, 'miqdor oylardan o\'zgarmasligi kerak');
});

test('computeFormwork: klassik qavat qolip qatorlarini bermaydi', () => {
  const { rows } = computeFormwork({
    plan: boxPlan(), floors: [FL({ formwork: { type: 'classic' } })], rates: {}
  });
  assert.equal(rows.length, 0);
});

test('exteriorWallsOf: belgilanmagan chizmada kontur devorlari tashqi bo\'ladi', () => {
  const plan = boxPlan();
  for (const w of plan.walls) w.type = 'interior';
  const walls = exteriorWallsOf(plan);
  assert.equal(walls.filter((w) => w.type === 'exterior').length, 4);
});

test('openingsOfWall: ochiqlik devor chegarasiga kesiladi', () => {
  const plan = boxPlan({
    openings: [{ id: 'o1', wallId: 'w1', type: 'door', offset: 3.5, width: 2, height: 2.1, sill: 0 }]
  });
  const ops = openingsOfWall(plan, plan.walls[0], 3);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].x1, 4, 'ochiqlik devor uzunligidan oshmasligi kerak');
});

test('deckAreaOf: xonalar bo\'lmasa gabarit bo\'yicha hisoblanadi', () => {
  const plan = boxPlan({ rooms: [] });
  assert.equal(deckAreaOf(plan, plan.walls), 16);
});
