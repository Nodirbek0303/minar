import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeQuantities, computeBOQ, computeSchedule, computeFloorSummary, normalizeFloors, DEFAULT_RATES
} from '../server/lib/calc.js';
import { samplePlan } from '../server/lib/samplePlan.js';

const calc = (plan, opts = {}) => {
  const q = computeQuantities(plan, opts);
  const boq = computeBOQ(q.items, opts.rates || {});
  return {
    q: q.quantities,
    boq,
    schedule: computeSchedule(q.quantities, boq),
    summary: computeFloorSummary(boq, q.quantities.perFloor)
  };
};

test('namuna loyiha: qavatlar, balandlik va panellar hisoblanadi', () => {
  const { q, boq } = calc(samplePlan());
  assert.equal(q.floorCount, 2);
  assert.equal(q.totalHeight, 6);
  assert.ok(q.facadeArea > 0);
  assert.ok(q.panelCount > 0);
  assert.ok(boq.rows.length > 0);
  assert.ok(boq.total > 0);
});

test('apalka maydoni IKKI yuzada va ochiqliklar chegirilgan', () => {
  const plan = samplePlan();
  const { q } = calc(plan);
  // tashqi perimetr 2×(10+8) = 36 m, balandlik 3 m, 2 qavat, 2 yuza
  const gross = 36 * 3 * 2 * 2;
  assert.ok(q.facadeArea < gross, 'ochiqliklar chegirilishi kerak');
  assert.ok(q.facadeArea > gross * 0.7, `yuza juda kichik: ${q.facadeArea} / ${gross}`);
  assert.equal(q.faces, 2);
});

test('ochiqliksiz reja ochiqlikli rejadan katta yuza beradi', () => {
  const withOps = calc(samplePlan()).q.facadeArea;
  const noOps = calc({ ...samplePlan(), openings: [] }).q.facadeArea;
  assert.ok(noOps > withOps, `${noOps} > ${withOps} bo'lishi kerak`);
});

test('UI maydoni va 5D jadval maydoni bir xil manbadan', () => {
  const { q, schedule } = calc(samplePlan());
  assert.equal(q.facadeArea, q.facadeAreaFw + q.facadeAreaClassic);
  const phase = schedule.phases.find((p) => p.key === 'walls');
  assert.equal(phase.qty, +q.facadeAreaFw.toFixed(1), 'jadval UI maydonidan boshqa raqam ishlatmasligi kerak');
});

test('qavat kesimi: qatorlar soni va panel soni qaytariladi', () => {
  const { summary, boq } = calc(samplePlan());
  assert.equal(summary.length, 2);
  for (const s of summary) {
    assert.ok(s.rows > 0, 'rows maydoni bo\'lishi kerak (UI shuni ko\'rsatadi)');
    assert.ok(s.panelCount > 0);
    assert.equal(s.total, boq.rows.filter((r) => r.floorId === s.id).reduce((x, r) => x + r.total, 0));
  }
});

test('apalkasi o\'chirilgan qavat hisobga kirmaydi', () => {
  const plan = samplePlan();
  plan.floors[1].facade = false;
  const { q, boq } = calc(plan);
  assert.equal(q.perFloor[1].facadeArea, 0);
  assert.equal(boq.rows.filter((r) => r.floorId === plan.floors[1].id).length, 0);
});

test('arenda rejimi sotib olishdan arzon va oylarga bog\'liq', () => {
  const plan = samplePlan();
  const buy = calc(plan, { rent: false }).boq.total;
  const rent1 = calc(plan, { rent: true, rentMonths: 1 }).boq.total;
  const rent6 = calc(plan, { rent: true, rentMonths: 6 }).boq.total;
  assert.ok(rent1 < buy, `1 oylik arenda (${rent1}) sotib olishdan (${buy}) arzon bo'lishi kerak`);
  assert.equal(rent6, rent1 * 6, 'arenda summasi oylarga proporsional');
});

test('KSHO va MSHO turli panel to\'plami beradi', () => {
  const mk = (type) => {
    const plan = samplePlan();
    for (const f of plan.floors) f.formwork = { type, color: 'RAL3020' };
    return calc(plan);
  };
  const msho = mk('msho'), ksho = mk('ksho');
  assert.ok(msho.q.panelCount > ksho.q.panelCount, 'mayda shtitli qolipda panel ko\'proq bo\'ladi');
  assert.ok(msho.boq.rows.some((r) => r.name.includes('MSHO')));
  assert.ok(ksho.boq.rows.some((r) => r.name.includes('KSHO')));
});

test('klassik qavat vent-fasad qatorlarini beradi va faqat tashqi yuza', () => {
  const plan = samplePlan();
  for (const f of plan.floors) f.formwork = { type: 'classic' };
  const { q, boq } = calc(plan);
  const keys = new Set(boq.rows.map((r) => r.baseKey));
  for (const k of ['apalka', 'tirgak', 'anker', 'klemmer', 'profil']) assert.ok(keys.has(k), k);
  assert.equal(q.facadeAreaFw, 0);
  assert.ok(q.facadeAreaClassic > 0);
  // klassik — bitta yuza, shu sababli qolipdan taxminan ikki barobar kichik
  const fw = calc(samplePlan()).q.facadeArea;
  assert.ok(q.facadeArea < fw * 0.7, 'klassik fasad faqat tashqi yuzada bo\'lishi kerak');
});

test('narx jadvalini o\'zgartirish summani o\'zgartiradi', () => {
  const plan = samplePlan();
  const base = calc(plan).boq.total;
  const pricey = calc(plan, { rates: { minar_zamok: DEFAULT_RATES.minar_zamok * 2 } }).boq.total;
  assert.ok(pricey > base);
});

test('normalizeFloors: balandlik 0.5..6 chegarasiga siqiladi', () => {
  const f = normalizeFloors({ floors: [{ id: 'a', height: 99 }, { id: 'b', height: -3 }] });
  assert.equal(f[0].height, 6);
  assert.equal(f[1].height, 0.5);
});

test('devorsiz reja xatosiz nol natija beradi', () => {
  const { q, boq, schedule } = calc({ meta: {}, walls: [], openings: [], rooms: [] });
  assert.equal(q.facadeArea, 0);
  assert.equal(boq.rows.length, 0);
  assert.equal(schedule.totalDays, 1);
});

test('barcha miqdorlar va summalar chekli son', () => {
  const { q, boq, schedule } = calc(samplePlan());
  for (const [k, v] of Object.entries(q)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} = ${v}`);
  }
  for (const r of boq.rows) {
    assert.ok(Number.isFinite(r.qty) && r.qty > 0, r.name);
    assert.ok(Number.isFinite(r.total) && r.total >= 0, r.name);
  }
  assert.ok(Number.isFinite(schedule.totalDays) && schedule.totalDays >= 1);
});
