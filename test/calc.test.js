import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeQuantities, computeBOQ, computeSchedule, computeFloorSummary, normalizeFloors,
  applyFormworkScheme, buildFloors, computeVariants, DEFAULT_RATES
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
  assert.equal(q.floorCount, 3, 'podval + 2 qavat');
  assert.equal(q.totalHeight, 6, 'yer usti balandligi (podval kirmaydi)');
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
  assert.equal(summary.length, 3, 'podval + 2 qavat');
  // Qolip qo'yiladigan qavatlarda miqdor bo'ladi, qolganida nol
  for (const s of summary) {
    const expect = s.facade;
    assert.equal(s.rows > 0, expect, s.name + ': qatorlar');
    assert.equal(s.panelCount > 0, expect, s.name + ': panellar');
    assert.equal(s.total, boq.rows.filter((r) => r.floorId === s.id).reduce((x, r) => x + r.total, 0));
  }
  assert.deepEqual(summary.filter((s) => s.facade).map((s) => s.name), ['Podval', '1-qavat']);
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
  // Nomlar katalogdagidek: КМО (Щит) va ЩЛ
  assert.ok(msho.boq.rows.some((r) => r.name.startsWith('КМО (Щит)')), 'КМО nomi');
  assert.ok(ksho.boq.rows.some((r) => r.name.startsWith('ЩЛ')), 'ЩЛ nomi');
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

test('po\'lat kg tarifini o\'zgartirish summani o\'zgartiradi', () => {
  const plan = samplePlan();
  const base = calc(plan).boq.total;
  // Katalogda narx yo'q — pozitsiyalar og'irlik × kg tarifi bo'yicha narxlanadi
  const pricey = calc(plan, { rates: { minar_panel_kg: DEFAULT_RATES.minar_panel_kg * 2 } }).boq.total;
  assert.ok(pricey > base * 1.9, `${pricey} ≈ 2 × ${base} bo'lishi kerak`);
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

test('apalkasi o\'chirilgan qavatda panel soni ham nol bo\'ladi', () => {
  const plan = samplePlan();
  plan.floors = [
    { id: 'pod', name: 'Podval', height: 2.8, facade: true, underground: true, formwork: { type: 'msho', color: 'RAL3020' } },
    { id: 'f1', name: '1-qavat', height: 3, facade: true, formwork: { type: 'msho', color: 'RAL3020' } },
    { id: 'f2', name: '2-qavat', height: 3, facade: false, formwork: { type: 'msho', color: 'RAL3020' } }
  ];
  const { q, boq, summary } = calc(plan);
  const off = q.perFloor.find((f) => f.id === 'f2');
  assert.equal(off.facadeArea, 0, 'yuza nol bo\'lishi kerak');
  assert.equal(off.panelCount, 0, 'panel soni ham nol bo\'lishi kerak');
  assert.equal(off.skippedArea, 0);
  const offSum = summary.find((s) => s.id === 'f2');
  assert.equal(offSum.panelCount, 0);
  assert.equal(offSum.rows, 0);
  assert.equal(offSum.total, 0);
  assert.equal(boq.rows.filter((r) => r.floorId === 'f2').length, 0);
  // yoqilgan qavatlar o'z hisobini yo'qotmasligi kerak
  for (const id of ['pod', 'f1']) {
    const on = q.perFloor.find((f) => f.id === id);
    assert.ok(on.facadeArea > 0 && on.panelCount > 0, id + ' hisoblanmadi');
  }
  // jami — faqat yoqilgan ikki qavat
  assert.equal(q.panelCount, q.perFloor.filter((f) => f.facade).reduce((s, f) => s + f.panelCount, 0));
});

test('podval yer ostida joylashadi va balandlikka qo\'shiladi', () => {
  const plan = samplePlan();
  plan.floors = [
    { id: 'pod', name: 'Podval', height: 2.8, facade: true, underground: true, formwork: { type: 'msho' } },
    { id: 'f1', name: '1-qavat', height: 3, facade: true, formwork: { type: 'msho' } }
  ];
  const { q } = calc(plan);
  assert.equal(q.perFloor[0].elevation, -2.8, 'podval sathi manfiy bo\'lishi kerak');
  assert.equal(q.perFloor[1].elevation, 0, '1-qavat yer sathidan boshlanadi');
  assert.equal(q.totalHeight, 3, 'yer ustidagi balandlik');
});

test('QOIDA: qavat soni qancha bo\'lsa ham qolip faqat podval va 1-qavatga', () => {
  const mk = (n, withPodval) => {
    const floors = [];
    if (withPodval) floors.push({ id: 'pod', name: 'Podval', height: 2.8, underground: true });
    for (let i = 1; i <= n; i++) floors.push({ id: 'f' + i, name: i + '-qavat', height: 3, underground: false });
    return applyFormworkScheme(floors.map((f) => ({ ...f, facade: true, formwork: { type: 'msho' } })), 'podval-1');
  };
  // 1 dan 20 gacha qavat — natija doim bir xil qoidaga bo'ysunadi
  for (const n of [1, 2, 3, 5, 9, 20]) {
    for (const withPodval of [true, false]) {
      const floors = mk(n, withPodval);
      const on = floors.filter((f) => f.facade);
      const off = floors.filter((f) => !f.facade);
      assert.equal(on.length, withPodval ? 2 : 1, `${n} qavat, podval=${withPodval}: qolipli qavatlar soni`);
      if (withPodval) {
        assert.equal(on[0].name, 'Podval');
        assert.equal(on[1].name, '1-qavat');
      } else {
        assert.equal(on[0].name, '1-qavat');
      }
      // 2-qavatdan yuqorisi hech qachon kirmaydi
      assert.ok(off.every((f) => /^([2-9]|1\d|20)-qavat$/.test(f.name)), 'faqat yuqori qavatlar o\'chirilishi kerak');
    }
  }
});

test('QOIDA: ko\'p qavatli binoda smeta faqat ikki qavatdan iborat', () => {
  const plan = samplePlan();
  plan.floors = applyFormworkScheme([
    { id: 'pod', name: 'Podval', height: 2.8, underground: true, facade: true, formwork: { type: 'msho' } },
    { id: 'f1', name: '1-qavat', height: 3, facade: true, formwork: { type: 'msho' } },
    { id: 'f2', name: '2-qavat', height: 3, facade: true, formwork: { type: 'msho' } },
    { id: 'f3', name: '3-qavat', height: 3, facade: true, formwork: { type: 'msho' } },
    { id: 'f4', name: '4-qavat', height: 3, facade: true, formwork: { type: 'msho' } }
  ], 'podval-1');
  const { q, boq, summary } = calc(plan);
  const withRows = summary.filter((s) => s.rows > 0).map((s) => s.name);
  assert.deepEqual(withRows, ['Podval', '1-qavat'], 'smetada faqat shu ikki qavat bo\'lishi kerak');
  assert.equal(boq.rows.filter((r) => ['f2', 'f3', 'f4'].includes(r.floorId)).length, 0);
  assert.equal(q.perFloor.filter((f) => f.panelCount > 0).length, 2);
});

test('namuna loyihada PODVAL bor va apalka podval + 1-qavatda', () => {
  const plan = samplePlan();
  const pod = plan.floors.find((f) => f.underground);
  assert.ok(pod, 'namuna loyihada podval bo\'lishi kerak');
  assert.equal(pod.name, 'Podval');
  const { summary, q } = calc(plan);
  const withRows = summary.filter((s) => s.rows > 0).map((s) => s.name);
  assert.deepEqual(withRows, ['Podval', '1-qavat']);
  assert.equal(q.perFloor[0].elevation, -2.8, 'podval yer ostida');
});

test('hujjatda podval topilmasa qoida bo\'yicha qo\'shiladi va belgilanadi', () => {
  const f = buildFloors([{ name: '1-qavat', height: 3 }, { name: '2-qavat', height: 3 }]);
  assert.equal(f[0].name, 'Podval');
  assert.equal(f[0].underground, true);
  assert.equal(f[0].addedByRule, true, 'qo\'shilgani belgilanishi kerak');
  assert.equal(f[0].facade, true);
  assert.equal(f[1].facade, true, '1-qavat');
  assert.equal(f[2].facade, false, '2-qavat');
  // hujjatda podval bo'lsa — qo'shilmaydi va belgilanmaydi
  const g = buildFloors([{ name: 'Podval', height: 2.5, underground: true }, { name: '1-qavat', height: 3 }]);
  assert.equal(g.filter((x) => x.underground).length, 1);
  assert.equal(g[0].addedByRule, undefined);
  assert.equal(g[0].height, 2.5, 'hujjatdagi balandlik saqlanadi');
});

test('IKKI VARIANT: melki va krupny alohida to\'liq hisoblanadi', () => {
  const v = computeVariants(samplePlan(), {});
  for (const id of ['melki', 'krupny']) {
    assert.ok(v[id], id + ' varianti bo\'lishi kerak');
    assert.ok(v[id].boq.rows.length > 10, id + ': pozitsiyalar');
    assert.ok(v[id].quantities.panelCount > 0, id + ': panellar');
    assert.ok(v[id].boq.total > 0, id + ': summa');
    assert.equal(v[id].schedule.totalDays >= 1, true);
  }
  // Panel nomlari tizimga mos
  assert.ok(v.melki.boq.rows.some((r) => r.name.startsWith('КМО (Щит)')), 'melki → КМО');
  assert.ok(v.krupny.boq.rows.some((r) => r.name.startsWith('ЩЛ')), 'krupny → ЩЛ');
  assert.ok(!v.melki.boq.rows.some((r) => r.name.startsWith('ЩЛ')), 'melki da ЩЛ bo\'lmasligi kerak');
  assert.ok(!v.krupny.boq.rows.some((r) => r.name.startsWith('КМО')), 'krupny da КМО bo\'lmasligi kerak');
  // Devor yuzasi bir xil, lekin PANEL BILAN YOPILGAN yuza farq qilishi mumkin:
  // katta panellar tor joylarga sig'maydi, u yerlar proyom qutisi bilan yopiladi
  const diff = Math.abs(v.melki.quantities.facadeArea - v.krupny.quantities.facadeArea);
  assert.ok(diff / v.melki.quantities.facadeArea < 0.1, `yuza farqi juda katta: ${diff} m2`);
  assert.ok(v.krupny.quantities.skippedArea >= v.melki.quantities.skippedArea,
    'katta panellarda yopilmagan yuza kamaymasligi kerak');
  // Kichik panellar bilan panel soni ko'proq bo'ladi
  assert.ok(v.melki.quantities.panelCount > v.krupny.quantities.panelCount,
    `melki ${v.melki.quantities.panelCount} > krupny ${v.krupny.quantities.panelCount}`);
});

test('IKKI VARIANT: taqqoslash jadvali to\'g\'ri', () => {
  const v = computeVariants(samplePlan(), {});
  const c = v.comparison;
  assert.equal(c.panels.melki, v.melki.quantities.panelCount);
  assert.equal(c.panels.krupny, v.krupny.quantities.panelCount);
  assert.equal(c.total.melki, v.melki.boq.total);
  assert.equal(c.total.krupny, v.krupny.boq.total);
  assert.ok(['melki', 'krupny'].includes(c.total.cheaper));
  assert.equal(c.total.cheaper, c.total.melki <= c.total.krupny ? 'melki' : 'krupny');
  assert.ok(c.weight.melki > 0 && c.weight.krupny > 0, 'og\'irlik hisoblanishi kerak');
});

test('IKKI VARIANT: qavat qoidasi ikkalasida ham amal qiladi', () => {
  const v = computeVariants(samplePlan(), {});
  for (const id of ['melki', 'krupny']) {
    const on = v[id].floorSummary.filter((f) => f.rows > 0).map((f) => f.name);
    assert.deepEqual(on, ['Podval', '1-qavat'], id + ': faqat podval va 1-qavat');
  }
});

test('IKKI VARIANT: arenda rejimi ikkalasiga ham qo\'llanadi', () => {
  const buy = computeVariants(samplePlan(), { rent: false });
  const rent = computeVariants(samplePlan(), { rent: true, rentMonths: 2 });
  for (const id of ['melki', 'krupny']) {
    assert.ok(rent[id].boq.total < buy[id].boq.total, id + ': arenda arzonroq');
  }
});
