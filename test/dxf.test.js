import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDxf } from '../server/lib/dxf.js';
import { validatePlan, validateFloors, validateRates, ValidationError } from '../server/lib/validate.js';

// Kichik DXF yasash yordamchisi. pad=true bo'lsa guruh kodlari AutoCAD
// kabi o'ngga tekislanadi ("  0", " 10") — real eksportlar shunday bo'ladi.
function dxfFile({ lines = [], texts = [], polys = [], insunits = null, pad = false }) {
  const out = [];
  const push = (code, val) => {
    out.push(pad ? String(code).padStart(3, ' ') : String(code));
    out.push(String(val));
  };
  if (insunits !== null) {
    push(0, 'SECTION'); push(2, 'HEADER');
    push(9, '$INSUNITS'); push(70, insunits);
    push(0, 'ENDSEC');
  }
  push(0, 'SECTION'); push(2, 'ENTITIES');
  for (const [a, b] of lines) {
    push(0, 'LINE'); push(8, 'WALL');
    push(10, a[0]); push(20, a[1]); push(30, 0);
    push(11, b[0]); push(21, b[1]); push(31, 0);
  }
  for (const p of polys) {
    push(0, 'LWPOLYLINE'); push(8, 'ROOM'); push(90, p.length); push(70, 1);
    for (const v of p) { push(10, v[0]); push(20, v[1]); }
  }
  for (const t of texts) {
    push(0, 'TEXT'); push(8, 'TXT');
    push(10, t.x); push(20, t.y); push(30, 0);
    push(40, t.h ?? 0.3); push(1, t.text);
  }
  push(0, 'ENDSEC'); push(0, 'EOF');
  return out.join('\n') + '\n';
}

// To'g'ri to'rtburchak bino: ikki qatorli devor (qalinlik aniqlanishi uchun)
function boxLines(w, h, t = 0.3) {
  const o = [[[0, 0], [w, 0]], [[w, 0], [w, h]], [[w, h], [0, h]], [[0, h], [0, 0]]];
  const i = [[[t, t], [w - t, t]], [[w - t, t], [w - t, h - t]], [[w - t, h - t], [t, h - t]], [[t, h - t], [t, t]]];
  return [...o, ...i];
}

test('metrda chizilgan 60×30 m bino yo\'qolmaydi (K-1)', () => {
  const dxf = dxfFile({ lines: boxLines(60, 30), insunits: 6 });
  const plan = analyzeDxf(dxf);
  assert.ok(plan.walls.length >= 4, `devorlar: ${plan.walls.length}`);
  assert.equal(plan.meta.analysis.units.id, 'm');
  assert.equal(plan.meta.analysis.units.source, 'header');
  assert.ok(Math.abs(plan.meta.analysis.size.x - 60) < 1, `kenglik ${plan.meta.analysis.size.x}`);
});

test('millimetrda chizilgan bino metrga o\'giriladi', () => {
  const dxf = dxfFile({ lines: boxLines(12000, 8000, 300), insunits: 4 });
  const plan = analyzeDxf(dxf);
  assert.equal(plan.meta.analysis.units.id, 'mm');
  assert.ok(Math.abs(plan.meta.analysis.size.x - 12) < 0.5);
  const maxLen = Math.max(...plan.walls.map((w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])));
  assert.ok(maxLen > 8 && maxLen < 13, `devor uzunligi ${maxLen} m`);
});

test('birlikni qo\'lda ko\'rsatish sarlavhadan ustun', () => {
  const dxf = dxfFile({ lines: boxLines(12000, 8000, 300), insunits: 4 });
  const plan = analyzeDxf(dxf, { units: 'cm' });
  assert.equal(plan.meta.analysis.units.id, 'cm');
  assert.equal(plan.meta.analysis.units.source, 'user');
});

test('sarlavhasiz chizma gabarit bo\'yicha taxmin qilinadi', () => {
  const plan = analyzeDxf(dxfFile({ lines: boxLines(12000, 8000, 300) }));
  assert.equal(plan.meta.analysis.units.id, 'mm');
  assert.equal(plan.meta.analysis.units.source, 'auto');
  assert.equal(plan.meta.analysis.units.confidence, 'taxminiy');
});

test('AutoCAD uslubidagi tekislangan guruh kodlaridan matn o\'qiladi (K-7)', () => {
  const dxf = dxfFile({
    lines: boxLines(10, 8),
    polys: [[[1, 1], [4, 1], [4, 4], [1, 4]]],
    texts: [{ x: 2.5, y: 2.5, h: 0.3, text: 'OSHXONA' }],
    insunits: 6,
    pad: true
  });
  const plan = analyzeDxf(dxf);
  assert.ok(plan.meta.analysis.texts > 0, 'matn o\'qilishi kerak');
  assert.ok(plan.rooms.some((r) => r.name === 'OSHXONA'), 'xona nomi chizmadan olinishi kerak');
});

test('masshtab tufayli devor qolmasa tushunarli xato beriladi', () => {
  // 1 mm o'lchamli "bino": hech qanday birlikda devor chiqmaydi
  const dxf = dxfFile({ lines: [[[0, 0], [0.02, 0]], [[0.02, 0], [0.02, 0.02]]], insunits: 6 });
  assert.throws(() => analyzeDxf(dxf), (e) => {
    assert.equal(e.code, 'DXF_UNITS');
    assert.match(e.message, /birlik/i);
    return true;
  });
});

test('parallel devorlar bitta markaz chiziqqa birlashadi (O-5)', () => {
  const plan = analyzeDxf(dxfFile({ lines: boxLines(10, 8, 0.3), insunits: 6 }));
  assert.equal(plan.walls.length, 4, `kutilgan 4 devor, chiqdi ${plan.walls.length}`);
  for (const w of plan.walls) {
    assert.ok(Math.abs(w.thickness - 0.3) < 0.05, `qalinlik ${w.thickness}`);
  }
});

test('chiziqsiz DXF aniq xato beradi', () => {
  assert.throws(() => analyzeDxf(dxfFile({ lines: [] })), /chiziq/i);
});

// ---------- validate.js ----------

test('validatePlan: NaN koordinata rad etiladi', () => {
  assert.throws(() => validatePlan({
    walls: [{ id: 'w', a: [0, 0], b: ['x', 5], thickness: 0.3 }]
  }), ValidationError);
});

test('validatePlan: haddan tashqari uzun devor rad etiladi (Y-3)', () => {
  assert.throws(() => validatePlan({
    walls: [{ id: 'w', a: [0, 0], b: [4000, 0], thickness: 0.3 }]
  }), /masshtab|chegara/i);
});

test('validatePlan: yo\'q devorga bog\'langan ochiqlik tashlanadi', () => {
  const p = validatePlan({
    walls: [{ id: 'w1', a: [0, 0], b: [5, 0], thickness: 0.3 }],
    openings: [
      { id: 'o1', wallId: 'w1', type: 'door', offset: 1, width: 1, height: 2.1 },
      { id: 'o2', wallId: 'yoq', type: 'door', offset: 1, width: 1, height: 2.1 }
    ]
  });
  assert.equal(p.openings.length, 1);
});

test('validateFloors: 40 tadan ortiq qavat rad etiladi', () => {
  assert.throws(() => validateFloors(new Array(41).fill({ height: 3 })), ValidationError);
});

test('validateRates: faqat mantiqiy sonlar o\'tadi', () => {
  const r = validateRates({ minar_zamok: '150000', yomon: 'abc', manfiy: -5, 'BAD KEY': 10 });
  assert.deepEqual(r, { minar_zamok: 150000 });
});
