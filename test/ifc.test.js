// IFC o'quvchisi — BIM modelidan haqiqiy geometriya.
//
// Ilgari IFC fayl faqat sarlavhasidan tanilardi va undan bironta devor
// chiqmasdi. Bu yerdagi asosiy talab: o'lcham TO'G'RI chiqsin yoki
// UMUMAN chiqmasin. Noto'g'ri o'lcham hisobga jimgina tushib ketadi va
// uni hech kim sezmaydi — o'lchamsiz element esa ko'rinib turadi.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  readIfc, parseStep, tokenizeParams, lengthScale, areaScale, placementOf, ifcToPlan
} from '../server/lib/ifc.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = fs.readFileSync(path.join(dir, 'fixtures/kichik-bino.ifc'), 'utf8');

// --- STEP formatini o'qish --------------------------------------------

test('qavslar ichidagi vergul bo\'linish nuqtasi bo\'lmaydi', () => {
  assert.deepEqual(tokenizeParams("'a',(1.,2.,3.),#5"), ["'a'", '(1.,2.,3.)', '#5']);
});

test('satr ichidagi vergul ham bo\'lmaydi', () => {
  assert.deepEqual(tokenizeParams("'Devor, tashqi',#5"), ["'Devor, tashqi'", '#5']);
});

test('IFC dagi qochirilgan apostrof matnni buzmaydi', () => {
  const e = parseStep("DATA;\n#1=IFCWALL('a''b',$);\nENDSEC;");
  assert.equal(e.get(1).type, 'IFCWALL');
});

test('yozuvlar jadvalga tushadi', () => {
  const e = parseStep(SAMPLE);
  assert.ok(e.size > 30);
  assert.equal(e.get(120).type, 'IFCWALLSTANDARDCASE');
});

// --- Birlik: eng xavfli joy -------------------------------------------

test('millimetr metrga o\'giriladi', () => {
  assert.equal(lengthScale(parseStep(SAMPLE)).factor, 0.001);
});

test('yuza birligi uzunlikdan ALOHIDA o\'qiladi', () => {
  // Revit uzunlikni mm da, yuzani m² da yozadi. Yuzani uzunlik
  // koeffitsiyentiga ko'paytirish natijani million marta kichraytiradi.
  const e = parseStep(SAMPLE);
  assert.equal(areaScale(e, 0.001), 1);
});

test('birlik e\'lon qilinmagan bo\'lsa metr deb olinadi', () => {
  const e = parseStep('DATA;\n#1=IFCWALL($,$);\nENDSEC;');
  assert.equal(lengthScale(e).factor, 1);
});

// --- Geometriya: asosiy natija ----------------------------------------

test('devor o\'lchami profildan chiqadi', () => {
  const w = readIfc(SAMPLE).elements.find((e) => e.kind === 'wall');
  assert.equal(w.lengthM, 6);
  assert.equal(w.widthM, 0.3);
  assert.equal(w.heightM, 2.8);
  assert.equal(w.source, 'profile');
});

test('ustun va plita ham o\'qiladi', () => {
  const r = readIfc(SAMPLE);
  const col = r.elements.find((e) => e.kind === 'column');
  const slab = r.elements.find((e) => e.kind === 'slab');
  assert.equal(col.lengthM, 0.4);
  assert.equal(col.widthM, 0.4);
  assert.equal(slab.lengthM, 12);
  assert.equal(slab.heightM, 0.2);
});

test('miqdorlardan yuza olinadi', () => {
  const w = readIfc(SAMPLE).elements.find((e) => e.kind === 'wall');
  assert.equal(w.areaM2, 16.8);
});

// --- Joylashuv zanjiri ------------------------------------------------

test('element koordinatasi qavatga nisbatan qo\'shiladi', () => {
  const w = readIfc(SAMPLE).elements.find((e) => e.kind === 'wall');
  assert.equal(w.x, 1);
  assert.equal(w.y, 2);
});

test('joylashuv halqasi cheksiz rekursiyaga olib bormaydi', () => {
  // Buzuq faylda A->B->A bo'lishi mumkin; o'quvchi qotib qolmasin.
  const e = parseStep(
    'DATA;\n#1=IFCLOCALPLACEMENT(#2,$);\n#2=IFCLOCALPLACEMENT(#1,$);\nENDSEC;'
  );
  const p = placementOf(e, 1);
  assert.deepEqual(p, { x: 0, y: 0, z: 0 });
});

// --- Qavatlar ---------------------------------------------------------

test('qavatlar balandligi bo\'yicha tartiblanadi', () => {
  const s = readIfc(SAMPLE).storeys;
  assert.deepEqual(s.map((x) => x.name), ['Podval', '1-qavat']);
  assert.equal(s[0].elevation, -3);
});

test('element qaysi qavatda ekani ko\'rsatiladi', () => {
  const w = readIfc(SAMPLE).elements.find((e) => e.kind === 'wall');
  assert.equal(w.storey, 'Podval');
});

// --- Rad etish --------------------------------------------------------

test('IFC bo\'lmagan fayl rad etiladi', () => {
  assert.throws(() => readIfc('bu oddiy matn'), /ISO-10303-21/);
});

test('bo\'sh IFC xato beradi', () => {
  assert.throws(() => readIfc('ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;'),
    /bironta yozuv/);
});

test('geometriyasiz model haqida ogohlantiriladi', () => {
  const raw = `ISO-10303-21;
DATA;
#1=IFCBUILDINGSTOREY('a',$,'Q1',$,$,$,$,$,.ELEMENT.,0.);
#2=IFCWALL('b',$,'Devor',$,$,$,$,$,$);
ENDSEC;`;
  const r = readIfc(raw);
  assert.equal(r.stats.measured, 0);
  assert.ok(r.problems.some((p) => /o'lcham yo'q/.test(p)));
});

test('o\'lchamsiz element null bo\'ladi, nol emas', () => {
  // Nol o'lcham hisobga tushsa "0 m² qolip" chiqadi va bu sezilmaydi.
  const raw = `ISO-10303-21;
DATA;
#2=IFCWALL('b',$,'Devor',$,$,$,$,$,$);
ENDSEC;`;
  const w = readIfc(raw).elements[0];
  assert.equal(w.lengthM, null);
  assert.equal(w.source, null);
});

// --- Xossalar ---------------------------------------------------------

test('devor tashqarimi — modelning o\'zidan so\'raladi', () => {
  // Taxmin qilish o'rniga Pset_WallCommon.IsExternal o'qiladi.
  const r = readIfc(SAMPLE);
  const w = r.elements.find((e) => e.kind === 'wall');
  assert.equal(r.properties[w.id].IsExternal, true);
  assert.equal(r.properties[w.id].LoadBearing, true);
});

// --- Devor yo'nalishi -------------------------------------------------

test('devor uchlari o\'z o\'qi bo\'ylab hisoblanadi', () => {
  // Markaz (1,2), uzunlik 6 -> uchlari (-2,2) va (4,2).
  const w = readIfc(SAMPLE).elements.find((e) => e.kind === 'wall');
  assert.deepEqual(w.ends.a, [-2, 2]);
  assert.deepEqual(w.ends.b, [4, 2]);
});

test('burilgan devor ham to\'g\'ri joylashadi', () => {
  // RefDirection (0,1,0) — devor Y o'qi bo'ylab cho'zilgan.
  const raw = `ISO-10303-21;
DATA;
#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#31=IFCCARTESIANPOINT((0.,0.,0.));
#30=IFCAXIS2PLACEMENT3D(#31,$,$);
#40=IFCLOCALPLACEMENT($,#30);
#50=IFCDIRECTION((0.,1.,0.));
#51=IFCCARTESIANPOINT((5.,5.,0.));
#52=IFCAXIS2PLACEMENT3D(#51,$,#50);
#53=IFCLOCALPLACEMENT(#40,#52);
#110=IFCCARTESIANPOINT((0.,0.));
#111=IFCAXIS2PLACEMENT2D(#110,$);
#112=IFCRECTANGLEPROFILEDEF(.AREA.,'W',#111,4.,0.2);
#114=IFCAXIS2PLACEMENT3D(#31,$,$);
#116=IFCDIRECTION((0.,0.,1.));
#115=IFCEXTRUDEDAREASOLID(#112,#114,#116,3.);
#117=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#115));
#118=IFCPRODUCTDEFINITIONSHAPE($,$,(#117));
#120=IFCWALL('w',$,'Burilgan',$,$,#53,#118,$,$);
ENDSEC;`;
  const w = readIfc(raw).elements[0];
  assert.deepEqual(w.ends.a, [5, 3]);
  assert.deepEqual(w.ends.b, [5, 7]);
});

// --- Planga o'girish --------------------------------------------------

test('IFC hisob planiga aylanadi', () => {
  const plan = ifcToPlan(readIfc(SAMPLE), { name: 'Sinov' });
  assert.equal(plan.meta.source, 'ifc');
  assert.equal(plan.walls.length, 1);
  assert.equal(plan.walls[0].thickness, 0.3);
  assert.equal(plan.walls[0].type, 'exterior');   // IsExternal dan
  assert.equal(plan.columns.length, 1);
});

test('qavat balandligi ketma-ket qavatlar farqidan chiqadi', () => {
  const plan = ifcToPlan(readIfc(SAMPLE));
  assert.equal(plan.floors[0].name, 'Podval');
  assert.equal(plan.floors[0].height, 3);         // -3 dan 0 gacha
  assert.equal(plan.floors[0].underground, true);
});

test('o\'lchamsiz devor planga TUSHMAYDI', () => {
  // Nol uzunlikli devor hisobda ko'rinmaydi va smetani jimgina buzadi.
  const raw = `ISO-10303-21;
DATA;
#1=IFCBUILDINGSTOREY('a',$,'Q1',$,$,$,$,$,.ELEMENT.,0.);
#2=IFCWALL('b',$,'Olchamsiz',$,$,$,$,$,$);
#3=IFCRELCONTAINEDINSPATIALSTRUCTURE('r',$,$,$,(#2),#1);
ENDSEC;`;
  const plan = ifcToPlan(readIfc(raw));
  assert.equal(plan.walls.length, 0);
  assert.equal(plan.meta.analysis.skipped.noSize, 1);
});

// --- Tezlik -----------------------------------------------------------

test('katta model muzlatib qo\'ymaydi', () => {
  // 5000 devor: xossalar indekssiz kvadratik bo'lib ketardi.
  let raw = `ISO-10303-21;\nDATA;\n#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);\n`;
  const ids = [];
  for (let i = 0; i < 800; i++) {
    const b = 1000 + i * 10;
    raw += `#${b}=IFCWALL('w${i}',$,'D${i}',$,$,$,$,$,$);\n`;
    ids.push(`#${b}`);
  }
  raw += `#99=IFCBUILDINGSTOREY('a',$,'Q1',$,$,$,$,$,.ELEMENT.,0.);\n`;
  raw += `#98=IFCRELCONTAINEDINSPATIALSTRUCTURE('r',$,$,$,(${ids.join(',')}),#99);\nENDSEC;`;
  const t0 = Date.now();
  const r = readIfc(raw);
  assert.equal(r.stats.total, 800);
  assert.ok(Date.now() - t0 < 3000, 'o\'qish 3 soniyadan oshdi');
});

// --- Haqiqiy fayllardan chiqqan xatolar --------------------------------
// Quyidagilarning har biri buildingSMART va bim-whale to'plamidagi
// HAQIQIY modellarda topilgan kamchiliklar. Sun'iy fikstura ularni
// ko'rsatmagan edi.

test('STEP izohi yozuvni yutib yubormaydi', () => {
  // buildingSMART etalon fayllarida /* ... */ izohlari bor. Izohda
  // nuqta-vergul yo'q, shuning uchun u keyingi yozuvga yopishib qolar
  // va o'sha yozuv butunlay yo'qolardi — devor topilmasdi.
  const raw = `ISO-10303-21;
DATA;
/* the wall itself ------------------------------------ */
#45 = IFCWALL('guid', #2, 'Devor', $, $, $, $, $, $);
ENDSEC;`;
  const r = readIfc(raw);
  assert.equal(r.stats.total, 1);
  assert.equal(r.elements[0].name, 'Devor');
});

test('bo\'sh joyli tenglik belgisi ham o\'qiladi', () => {
  // Ba'zi eksportlar `#45 = IFCWALL(...)` deb yozadi, ba'zilari `#45=...`
  const r = readIfc("ISO-10303-21;\nDATA;\n#1 = IFCWALL('g',$,'D',$,$,$,$,$,$);\nENDSEC;");
  assert.equal(r.stats.total, 1);
});

test('profil bo\'lmasa chegara qutisi ishlatiladi', () => {
  // Zinapoya va poydevor Brep/Tessellation bilan yoziladi — aniq profili
  // yo'q, lekin gabariti baribir foydali.
  const raw = `ISO-10303-21;
DATA;
#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCCARTESIANPOINT((4.,0.,0.));
#3=IFCCARTESIANPOINT((4.,2.,3.));
#4=IFCCARTESIANPOINT((0.,2.,3.));
#5=IFCPOLYLOOP((#1,#2,#3,#4));
#6=IFCFACEOUTERBOUND(#5,.T.);
#7=IFCFACE((#6));
#8=IFCCLOSEDSHELL((#7));
#9=IFCFACETEDBREP(#8);
#10=IFCSHAPEREPRESENTATION($,'Body','Brep',(#9));
#12=IFCPRODUCTDEFINITIONSHAPE($,$,(#10));
#20=IFCFOOTING('g',$,'Poydevor',$,$,$,#12,$,$);
ENDSEC;`;
  const el = readIfc(raw).elements[0];
  assert.equal(el.source, 'bbox');
  assert.equal(el.lengthM, 4);
  assert.equal(el.widthM, 2);
  assert.equal(el.heightM, 3);
});

test('chegara qutisi ANIQ o\'lchamni siqib chiqarmaydi', () => {
  // Eng muhim tartib: profil > miqdor > chegara. Zinapoyaning gabariti
  // uning qalinligi emas — taxmin aniq raqamni bosib ketmasligi kerak.
  const raw = `ISO-10303-21;
DATA;
#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCCARTESIANPOINT((9.,9.,9.));
#3=IFCCARTESIANPOINT((9.,0.,0.));
#4=IFCCARTESIANPOINT((0.,9.,0.));
#5=IFCPOLYLOOP((#1,#2,#3,#4));
#6=IFCFACEOUTERBOUND(#5,.T.);
#7=IFCFACE((#6));
#8=IFCCLOSEDSHELL((#7));
#9=IFCFACETEDBREP(#8);
#10=IFCSHAPEREPRESENTATION($,'Body','Brep',(#9));
#12=IFCPRODUCTDEFINITIONSHAPE($,$,(#10));
#20=IFCWALL('g',$,'Devor',$,$,$,#12,$,$);
#30=IFCQUANTITYLENGTH('Length',$,$,5.,$);
#31=IFCQUANTITYLENGTH('Width',$,$,0.25,$);
#32=IFCELEMENTQUANTITY('q',$,'Qty',$,$,(#30,#31));
#33=IFCRELDEFINESBYPROPERTIES('r',$,$,$,(#20),#32);
ENDSEC;`;
  const el = readIfc(raw).elements[0];
  assert.equal(el.lengthM, 5);      // miqdordan, 9 emas
  assert.equal(el.widthM, 0.25);    // miqdordan, 9 emas
  assert.equal(el.source, 'quantity');
});

test('kesilgan solid asosidan o\'qiladi', () => {
  // Revit tomga tegib turgan devorni IfcBooleanClippingResult qilib
  // yozadi; asosiy shakl birinchi operandda turadi.
  const raw = `ISO-10303-21;
DATA;
#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCAXIS2PLACEMENT2D(#1,$);
#3=IFCRECTANGLEPROFILEDEF(.AREA.,'W',#2,6.,0.3);
#4=IFCCARTESIANPOINT((0.,0.,0.));
#5=IFCAXIS2PLACEMENT3D(#4,$,$);
#6=IFCDIRECTION((0.,0.,1.));
#7=IFCEXTRUDEDAREASOLID(#3,#5,#6,3.);
#8=IFCBOOLEANCLIPPINGRESULT(.DIFFERENCE.,#7,#9);
#9=IFCHALFSPACESOLID($,.F.);
#10=IFCSHAPEREPRESENTATION($,'Body','Clipping',(#8));
#12=IFCPRODUCTDEFINITIONSHAPE($,$,(#10));
#20=IFCWALL('g',$,'Kesilgan devor',$,$,$,#12,$,$);
ENDSEC;`;
  const el = readIfc(raw).elements[0];
  assert.equal(el.lengthM, 6);
  assert.equal(el.widthM, 0.3);
  assert.equal(el.source, 'profile');
});

// --- Proyomlar: eshik va deraza ---------------------------------------
// Bularsiz qolip ORTIQCHA chiqadi. Haqiqiy modellarda o'lchangan farq:
// qolip yuzasi 5,5% dan 15,7% gacha kamayadi.

const WALL_WITH_OPENING = `ISO-10303-21;
DATA;
#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCAXIS2PLACEMENT2D(#1,$);
#3=IFCRECTANGLEPROFILEDEF(.AREA.,'W',#2,6.,0.3);
#4=IFCCARTESIANPOINT((3.,0.,0.));
#5=IFCAXIS2PLACEMENT3D(#4,$,$);
#6=IFCDIRECTION((0.,0.,1.));
#7=IFCEXTRUDEDAREASOLID(#3,#5,#6,3.);
#8=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#7));
#9=IFCPRODUCTDEFINITIONSHAPE($,$,(#8));
#12=IFCCARTESIANPOINT((0.,0.,0.));
#13=IFCAXIS2PLACEMENT3D(#12,$,$);
#14=IFCLOCALPLACEMENT($,#13);
#15=IFCCARTESIANPOINT((3.,0.,0.));
#16=IFCAXIS2PLACEMENT3D(#15,$,$);
#17=IFCLOCALPLACEMENT(#14,#16);
#20=IFCWALL('gw',$,'Devor',$,$,#17,#9,$,$);
#30=IFCCARTESIANPOINT((2.,0.,0.));
#31=IFCAXIS2PLACEMENT3D(#30,$,$);
#32=IFCLOCALPLACEMENT(#14,#31);
#33=IFCOPENINGELEMENT('go',$,'Proyom',$,$,#32,$,$,$);
#34=IFCRELVOIDSELEMENT('gv',$,$,$,#20,#33);
#40=IFCCARTESIANPOINT((2.,0.,0.));
#41=IFCAXIS2PLACEMENT3D(#40,$,$);
#42=IFCLOCALPLACEMENT(#14,#41);
#43=IFCDOOR('gd',$,'Eshik',$,$,#42,$,$,2.1,0.9);
#44=IFCRELFILLSELEMENT('gf',$,$,$,#33,#43);
#50=IFCBUILDINGSTOREY('gs',$,'1-qavat',$,$,#14,$,$,.ELEMENT.,0.);
#51=IFCRELCONTAINEDINSPATIALSTRUCTURE('gr',$,$,$,(#20,#33,#43),#50);
ENDSEC;`;

test('eshik o\'z o\'lchamini IFC maydonidan beradi', () => {
  // IfcDoor da OverallHeight (8) va OverallWidth (9) maxsus maydon.
  const d = readIfc(WALL_WITH_OPENING).elements.find((e) => e.kind === 'door');
  assert.equal(d.lengthM, 0.9);
  assert.equal(d.heightM, 2.1);
  assert.equal(d.source, 'attribute');
});

test('proyom devorga bog\'lanadi va joyi topiladi', () => {
  const plan = ifcToPlan(readIfc(WALL_WITH_OPENING));
  assert.equal(plan.openings.length, 1);
  const o = plan.openings[0];
  assert.equal(o.wallId, plan.walls[0].id);
  assert.equal(o.type, 'door');
  assert.equal(o.width, 0.9);
  assert.equal(o.height, 2.1);
});

test('proyom o\'lchami eshikdan olinadi, proyom profilidan emas', () => {
  // Proyomning profili «balandlik x eni» bo'lgani uchun uni devordagidek
  // talqin qilsak o'lcham AG'DARILIB ketadi: 2,1 m enli eshik chiqadi.
  const o = ifcToPlan(readIfc(WALL_WITH_OPENING)).openings[0];
  assert.ok(o.width < o.height, `eni ${o.width} balandlikdan ${o.height} katta - ag'darilgan`);
});

test('devordan tashqaridagi proyom olinmaydi', () => {
  // Model xatosi: proyom devor chegarasidan uzoqda. Uni qo'shsak
  // devor yuzasidan mavjud bo'lmagan teshik chegiriladi.
  const raw = WALL_WITH_OPENING.replace('#30=IFCCARTESIANPOINT((2.,0.,0.));',
                                        '#30=IFCCARTESIANPOINT((90.,0.,0.));');
  const plan = ifcToPlan(readIfc(raw));
  assert.equal(plan.openings.length, 0);
  // Jimgina tashlanmaydi - nechtasi o'tmagani hisobotda ko'rinadi
  assert.equal(plan.meta.analysis.skipped.opening, 1);
});

test('to\'ldiruvchisiz proyom poldan balandligiga qarab ajratiladi', () => {
  // Eshik polda turadi, deraza yuqorida - IfcDoor/IfcWindow bo'lmasa
  // shu farqdan foydalaniladi.
  // Proyomga o'z geometriyasi beriladi: 1,0 m enli, 2,0 m balandlikda
  const raw = WALL_WITH_OPENING
    .replace("#43=IFCDOOR('gd',$,'Eshik',$,$,#42,$,$,2.1,0.9);", '')
    .replace("#44=IFCRELFILLSELEMENT('gf',$,$,$,#33,#43);", '')
    .replace("#33=IFCOPENINGELEMENT('go',$,'Proyom',$,$,#32,$,$,$);",
      "#60=IFCRECTANGLEPROFILEDEF(.AREA.,'O',#2,1.,0.4);\n" +
      "#61=IFCEXTRUDEDAREASOLID(#60,#5,#6,2.);\n" +
      "#62=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#61));\n" +
      "#63=IFCPRODUCTDEFINITIONSHAPE($,$,(#62));\n" +
      "#33=IFCOPENINGELEMENT('go',$,'Proyom',$,$,#32,#63,$,$);");
  const plan = ifcToPlan(readIfc(raw));
  assert.equal(plan.openings.length, 1);
  assert.equal(plan.openings[0].type, 'door');   // sill = 0, ya'ni polda
});

test('juda katta fayl aniq xato beradi, xizmatni yiqitmaydi', () => {
  // 51 MB li IFC dan 1 026 311 yozuv chiqadi va ~370 MB xotira yeydi.
  // Serverda 2 GB RAM: chegarasiz katta fayl xizmatni OOM bilan
  // o'ldiradi va dastur HAMMA uchun to'xtaydi.
  const raw = 'ISO-10303-21;\nDATA;\n' + 'x'.repeat(2000);
  assert.throws(() => readIfc(raw, { maxBytes: 500 }), /juda katta/);
});

// --- Har qavatning O'Z devorlari ---------------------------------------
// AdvancedProject.ifc da podvalda 90, 1-qavatda 183 devor bor. Bitta
// to'plamni hamma qavatga qo'llash 64,8% xatoga olib kelardi.

const TWO_STOREYS = `ISO-10303-21;
DATA;
#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCAXIS2PLACEMENT2D(#1,$);
#4=IFCCARTESIANPOINT((0.,0.,0.));
#5=IFCAXIS2PLACEMENT3D(#4,$,$);
#6=IFCDIRECTION((0.,0.,1.));
#14=IFCLOCALPLACEMENT($,#5);
#20=IFCRECTANGLEPROFILEDEF(.AREA.,'W',#2,6.,0.3);
#21=IFCEXTRUDEDAREASOLID(#20,#5,#6,3.);
#22=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#21));
#23=IFCPRODUCTDEFINITIONSHAPE($,$,(#22));
#30=IFCWALL('p1',$,'Podval devori',$,$,#14,#23,$,$);
#40=IFCWALL('g1',$,'1-qavat devori A',$,$,#14,#23,$,$);
#41=IFCWALL('g2',$,'1-qavat devori B',$,$,#14,#23,$,$);
#42=IFCWALL('g3',$,'1-qavat devori C',$,$,#14,#23,$,$);
#50=IFCBUILDINGSTOREY('s0',$,'Podval',$,$,#14,$,$,.ELEMENT.,-3.);
#51=IFCBUILDINGSTOREY('s1',$,'1-qavat',$,$,#14,$,$,.ELEMENT.,0.);
#60=IFCRELCONTAINEDINSPATIALSTRUCTURE('r0',$,$,$,(#30),#50);
#61=IFCRELCONTAINEDINSPATIALSTRUCTURE('r1',$,$,$,(#40,#41,#42),#51);
ENDSEC;`;

test('har qavat o\'z devorlarini oladi', () => {
  const plan = ifcToPlan(readIfc(TWO_STOREYS));
  const podval = plan.floors.find((f) => f.name === 'Podval');
  const birinchi = plan.floors.find((f) => f.name === '1-qavat');
  assert.equal(podval.walls.length, 1);
  assert.equal(birinchi.walls.length, 3);
});

test('devori bor eng pastki qavat asos qilib olinadi', () => {
  // Eng pastki qavat DEVORSIZ bo'lishi mumkin (masalan «Site» yoki
  // bo'sh texnik qavat) - u holda plan bo'sh chiqib, model bekorga
  // rad etilardi.
  const raw = TWO_STOREYS.replace(
    "#60=IFCRELCONTAINEDINSPATIALSTRUCTURE('r0',$,$,$,(#30),#50);", '');
  const plan = ifcToPlan(readIfc(raw));
  assert.equal(plan.meta.level, '1-qavat');
  assert.equal(plan.walls.length, 3);
});

test('tashlangan element ikki marta sanalmaydi', () => {
  // Devorlar bir necha marta ko'rib chiqiladi; hisobot yolg'on
  // gapirmasligi kerak.
  const raw = `ISO-10303-21;
DATA;
#1=IFCBUILDINGSTOREY('a',$,'Q1',$,$,$,$,$,.ELEMENT.,0.);
#2=IFCWALL('b',$,'Olchamsiz',$,$,$,$,$,$);
#3=IFCRELCONTAINEDINSPATIALSTRUCTURE('r',$,$,$,(#2),#1);
ENDSEC;`;
  assert.equal(ifcToPlan(readIfc(raw)).meta.analysis.skipped.noSize, 1);
});

test('devor uchlari IFC ning O\'Q CHIZIG\'idan olinadi', () => {
  // Eng muhim tuzatish: Revit devorni boshlang'ich nuqtasiga
  // joylashtiradi, profil esa siljigan bo'ladi. Uchlarni profildan
  // chiqarsak devorlar bir-biriga ULANMAYDI va plan sochilib ketadi —
  // uzunlik va yuza to'g'ri bo'lsa ham chizma bino bo'lmaydi.
  const raw = `ISO-10303-21;
DATA;
#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCCARTESIANPOINT((8.,0.));
#3=IFCPOLYLINE((#1,#2));
#4=IFCSHAPEREPRESENTATION($,'Axis','Curve2D',(#3));
#5=IFCCARTESIANPOINT((0.,0.,0.));
#6=IFCAXIS2PLACEMENT3D(#5,$,$);
#7=IFCLOCALPLACEMENT($,#6);
#8=IFCAXIS2PLACEMENT2D(#1,$);
#9=IFCRECTANGLEPROFILEDEF(.AREA.,'W',#8,8.,0.3);
#10=IFCDIRECTION((0.,0.,1.));
#12=IFCEXTRUDEDAREASOLID(#9,#6,#10,3.);
#13=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#12));
#14=IFCPRODUCTDEFINITIONSHAPE($,$,(#4,#13));
#20=IFCWALL('g',$,'Devor',$,$,#7,#14,$,$);
ENDSEC;`;
  const w = readIfc(raw).elements[0];
  assert.equal(w.ends.from, 'axis');
  assert.deepEqual(w.ends.a, [0, 0]);
  assert.deepEqual(w.ends.b, [8, 0]);
});

test('o\'q chizig\'i yo\'q bo\'lsa markazdan chiqariladi', () => {
  const w = readIfc(WALL_WITH_OPENING).elements.find((e) => e.kind === 'wall');
  assert.equal(w.ends.from, 'placement');
  assert.ok(w.ends.a && w.ends.b);
});
