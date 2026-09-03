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

test('layoutWallFace: faqat KATALOGDA MAVJUD o\'lchamlar ishlatiladi', () => {
  const f = layoutWallFace({ type: 'msho', lenM: 6, hM: 3 });
  assert.ok(f.totalPanels > 0);
  for (const key of Object.keys(f.panelCounts)) {
    const [w, h] = key.split('x').map(Number);
    assert.ok(MINAR.msho.byKey.has(w + 'x' + h), 'katalogda yo\'q o\'lcham: ' + key);
    assert.ok(panelSpec('msho', w, h), 'panelSpec topmadi: ' + key);
  }
});

test('katalog to\'liq yuklangan (Excel dagi barcha pozitsiyalar)', () => {
  assert.ok(MINAR.catalogTotal >= 700, 'pozitsiyalar soni: ' + MINAR.catalogTotal);
  assert.equal(MINAR.msho.items.length, 45, 'КМО panellari: 9 eni × 5 balandlik');
  assert.deepEqual([...MINAR.msho.widths].sort((a, b) => a - b), [200, 250, 300, 350, 400, 450, 500, 550, 600]);
  assert.deepEqual([...MINAR.msho.heights].sort((a, b) => a - b), [300, 600, 900, 1200, 1500]);
  assert.ok(MINAR.ksho.items.length >= 80, 'ЩЛ panellari');
  assert.ok(MINAR.columns.length >= 8 && MINAR.angles.length >= 30 && MINAR.braces.length >= 10);
});

test('panel og\'irligi katalogdan olinadi (hisoblanmaydi)', () => {
  // Excel: КМО (Щит) 600х1500 = 23.4 kg, 200х300 = 1.56 kg
  assert.equal(panelSpec('msho', 600, 1500).weight, 23.4);
  assert.equal(panelSpec('msho', 200, 300).weight, 1.56);
  assert.equal(panelSpec('msho', 550, 900).weight, 12.87);
  assert.equal(panelSpec('msho', 600, 1500).name, 'КМО (Щит) 600х1500');
  // katalogda yo'q o'lcham qabul qilinmaydi
  assert.equal(panelSpec('msho', 610, 1500), null);
  assert.equal(panelSpec('msho', 600, 1800), null);
});

test('spetsifikatsiya nomlari katalogdagidek', () => {
  const plan = boxPlan();
  const { rows } = computeFormwork({ plan, floors: [FL()], rates: {} });
  const names = rows.map((r) => r.name);
  assert.ok(names.some((n) => n.startsWith('КМО (Щит)')), 'panel nomi katalogdan');
  assert.ok(names.some((n) => n.startsWith('Замок универсальный')), 'zamok');
  assert.ok(names.some((n) => n.startsWith('Клин')), 'klin');
  assert.ok(names.some((n) => n.startsWith('Винт стяжной')), 'tyaga');
  assert.ok(names.some((n) => n.startsWith('Гайка D90')), 'gayka');
  assert.ok(names.some((n) => n.startsWith('Подкос винтовой')), 'podkos');
  assert.ok(names.some((n) => n.startsWith('ЩУР')), 'ustun qolipi');
  assert.ok(names.some((n) => n.startsWith('Угол')), 'burchak elementi');
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
  assert.ok(withDoor.totalPanels <= full.totalPanels, 'panel soni oshib ketmasligi kerak');
  // eshik yuzasi (1 × 2.1 = 2.1 m²) chegirilgan bo'lishi kerak
  assert.ok(full.areaM2 - withDoor.areaM2 >= 1.5, 'eshik yuzasi chegirilmadi');
  // eshik oralig'ida pastki qismda panel bo'lmasligi kerak
  for (const s of withDoor.segments.filter((g) => g.x >= 1.99 && g.x + g.lenM <= 3.01)) {
    assert.ok(s.y >= 2.09, `eshik o'rniga panel tushib qolgan: y=${s.y}`);
  }
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

test('panelSpec: maydon o\'lchamdan, og\'irlik katalogdan', () => {
  const s = panelSpec('msho', 600, 1200);
  assert.equal(s.area, 0.72);
  assert.equal(s.weight, 18.72); // Excel dagi qiymat
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

test('computeFormwork: barcha guruhlar spetsifikatsiyada bor', () => {
  const { rows } = computeFormwork({ plan: boxPlan(), floors: [FL()], rates: {} });
  const keys = new Set(rows.map((r) => r.baseKey));
  for (const k of ['qolip_panel', 'qolip_zamok', 'qolip_klin', 'qolip_tyaga', 'qolip_gayka',
    'qolip_shayba', 'qolip_brace', 'qolip_balka', 'qolip_ugol_out', 'qolip_ustun',
    'qolip_tu', 'qolip_uchoyoq', 'qolip_univilka']) {
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

  // Замок универсальный = 4.5 kg (katalogdan); narx og'irlik × kg tarifi
  assert.equal(zamokBuy.matRateOverride, Math.round(4.5 * 18000), 'sotib olish: 4.5 kg × 18000');
  assert.equal(zamok1.matRateOverride, Math.round(4.5 * 4000), 'arenda 1 oy: 4.5 kg × 4000');
  assert.equal(zamok3.matRateOverride, Math.round(4.5 * 4000 * 3), '3 oy = 3 × oylik');
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
