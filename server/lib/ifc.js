// ============================================================
//  IFC (ISO-10303-21 / STEP) o'quvchisi — BIM modelidan GEOMETRIYA.
//
//  Ilgari IFC fayl faqat sarlavhasidan tanilardi: "FILE_SCHEMA bormi,
//  ISO-10303-21 bormi" — keyin fayl chetga qo'yilardi. Ya'ni Revit yoki
//  Tekla dan chiqqan model yuklansa ham undan bironta devor chiqmasdi va
//  hisob baribir DXF yoki AI rasm tahliliga tayanardi.
//
//  Bu modul o'sha bo'shliqni yopadi: IFC dan qavatlar, devorlar, ustunlar
//  va plitalar o'lchami bilan chiqariladi.
//
//  ISHONCH QOIDASI (butun loyihadagi kabi): o'lcham O'YLAB TOPILMAYDI.
//  Har element uchun manba ko'rsatiladi:
//    · 'profile'  — IfcExtrudedAreaSolid profilidan (eng ishonchli)
//    · 'quantity' — IfcElementQuantity dan (model muallifi yozgan)
//    · 'bbox'     — ko'pburchak chegarasidan (taxminiy)
//  Manbasi topilmagan o'lcham `null` bo'lib qoladi va hisobga kirmaydi.
// ============================================================

// ---------- 1. STEP faylni bo'laklarga ajratish ----------

// IFC qatori: #12=IFCWALL('1Ab$',#5,'Devor',$,...);
// Qiymatlar ichida qavs va vergul bo'lishi mumkin, shuning uchun oddiy
// split ishlamaydi — belgima-belgi yuriladi. Satr ichidagi ' ' juftligi
// (IFC da apostrof shunday qochiriladi) hisobga olinadi.
export function tokenizeParams(text) {
  const out = [];
  let depth = 0, cur = '', inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "'") {
        if (text[i + 1] === "'") { cur += "''"; i++; continue; }
        inStr = false;
      }
      cur += c;
      continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === '(') { depth++; cur += c; continue; }
    if (c === ')') { depth--; cur += c; continue; }
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '' || out.length) out.push(cur.trim());
  return out;
}

/** Butun faylni `#id -> { type, params }` jadvaliga aylantiradi. */
export function parseStep(raw) {
  const entities = new Map();
  const dataStart = raw.indexOf('DATA;');
  const body = dataStart >= 0 ? raw.slice(dataStart + 5) : raw;

  // Har yozuv nuqta-vergul bilan tugaydi, lekin nuqta-vergul satr ichida
  // ham uchraydi — shuning uchun qo'lda yuriladi.
  let i = 0, cur = '', inStr = false;
  while (i < body.length) {
    const c = body[i];
    // STEP izohi: /* ... */. Izohda nuqta-vergul bo'lmagani uchun u
    // keyingi yozuvga yopishib qolardi va o'sha yozuv butunlay
    // yo'qolardi. buildingSMART ning barcha etalon fayllarida izoh bor.
    if (!inStr && c === '/' && body[i + 1] === '*') {
      const end = body.indexOf('*/', i + 2);
      i = end < 0 ? body.length : end + 2;
      continue;
    }
    if (inStr) {
      if (c === "'" && body[i + 1] === "'") { cur += "''"; i += 2; continue; }
      if (c === "'") inStr = false;
      cur += c; i++; continue;
    }
    if (c === "'") { inStr = true; cur += c; i++; continue; }
    if (c === ';') {
      const line = cur.trim();
      cur = ''; i++;
      const m = /^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*)\)$/i.exec(line);
      if (m) {
        entities.set(+m[1], { id: +m[1], type: m[2].toUpperCase(), params: tokenizeParams(m[3]) });
      }
      continue;
    }
    cur += c; i++;
  }
  return entities;
}

// ---------- 2. Kichik yordamchilar ----------

const ref = (v) => (typeof v === 'string' && v.startsWith('#') ? +v.slice(1) : null);
const num = (v) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t === '$' || t === '*' || t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const str = (v) => {
  if (typeof v !== 'string') return '';
  const m = /^'([\s\S]*)'$/.exec(v.trim());
  return m ? m[1].replace(/''/g, "'") : '';
};
const list = (v) => {
  if (typeof v !== 'string') return [];
  const t = v.trim();
  if (!t.startsWith('(')) return [];
  return tokenizeParams(t.slice(1, -1));
};

// ---------- 3. Birlik ----------

// IFC ichida uzunlik metrda ham, millimetrda ham bo'lishi mumkin.
// Noto'g'ri birlik butun hisobni 1000 barobar buzadi, shuning uchun u
// taxmin qilinmaydi — IFCSIUNIT dan aniq o'qiladi.
const PREFIX = {
  MILLI: 0.001, CENTI: 0.01, DECI: 0.1, KILO: 1000,
  MICRO: 1e-6, DECA: 10, HECTO: 100
};

// Yuza va hajm birligi UZUNLIKDAN ALOHIDA beriladi: Revit uzunlikni
// millimetrda, yuzani esa kvadrat metrda yozadi. Yuzani uzunlik
// koeffitsiyentiga ko'paytirish - klassik xato, natija million marta
// kichrayadi. Shuning uchun har birining o'z koeffitsiyenti o'qiladi.
// Faylda IFCSIUNIT yozuvlari BIR NECHTA bo'ladi: loyihanikidan tashqari
// xossalar to'plamlari o'z birligini e'lon qiladi. BasicHouse.ifc da
// uchta LENGTHUNIT bor - MILLI, oddiy METRE va DECI. Birinchisini olsak
// tasodifan to'g'ri chiqishi mumkin, lekin boshqa faylda 10 barobar
// xato bo'ladi. Shuning uchun FAQAT loyihaning o'z birliklari o'qiladi.
function projectUnits(entities) {
  for (const e of entities.values()) {
    if (e.type !== 'IFCPROJECT') continue;
    const assignment = entities.get(ref(e.params[8]));
    if (!assignment || assignment.type !== 'IFCUNITASSIGNMENT') continue;
    return list(assignment.params[0]).map(ref).filter(Boolean);
  }
  return null;
}

function unitEntities(entities) {
  const ids = projectUnits(entities);
  if (ids && ids.length) return ids.map((id) => entities.get(id)).filter(Boolean);
  // IfcProject yo'q (bo'lak eksport) - hammasini ko'ramiz
  return [...entities.values()];
}

function siScale(entities, unitType, power) {
  for (const e of unitEntities(entities)) {
    if (e.type !== 'IFCSIUNIT') continue;
    if ((e.params[1] || '').replace(/[.\s]/g, '') !== unitType) continue;
    const prefix = (e.params[2] || '').replace(/[.$\s]/g, '');
    return (PREFIX[prefix] ?? 1) ** power;
  }
  return null;
}

export function areaScale(entities, lengthFactor) {
  // AREAUNIT ko'rsatilgan bo'lsa o'sha; bo'lmasa uzunlik birligidan chiqadi.
  return siScale(entities, 'AREAUNIT', 2) ?? lengthFactor ** 2;
}

export function volumeScale(entities, lengthFactor) {
  return siScale(entities, 'VOLUMEUNIT', 3) ?? lengthFactor ** 3;
}

export function lengthScale(entities) {
  for (const e of unitEntities(entities)) {
    if (e.type !== 'IFCSIUNIT') continue;
    const unitType = (e.params[1] || '').replace(/[.\s]/g, '');
    if (unitType !== 'LENGTHUNIT') continue;
    const prefix = (e.params[2] || '').replace(/[.$\s]/g, '');
    return { factor: PREFIX[prefix] ?? 1, unit: prefix ? prefix.toLowerCase() : 'metre' };
  }
  // Konvertatsiya qilingan birlik (fut va h.k.) — koeffitsiyent o'qiladi
  for (const e of unitEntities(entities)) {
    if (e.type !== 'IFCCONVERSIONBASEDUNIT') continue;
    const name = str(e.params[2] || '').toLowerCase();
    if (name.includes('foot') || name.includes('feet')) return { factor: 0.3048, unit: 'foot' };
    if (name.includes('inch')) return { factor: 0.0254, unit: 'inch' };
  }
  return { factor: 1, unit: 'metre' };
}

// ---------- 4. Joylashuv (IfcLocalPlacement zanjiri) ----------

// Element koordinatasi o'z qavatiga, qavat binoga, bino saytga nisbatan
// beriladi. Haqiqiy joyni bilish uchun zanjir bo'ylab qo'shib chiqiladi.
export function placementOf(entities, id, depth = 0) {
  const zero = { x: 0, y: 0, z: 0 };
  if (!id || depth > 30) return zero;      // 30 — halqadan himoya
  const e = entities.get(id);
  if (!e) return zero;

  if (e.type === 'IFCLOCALPLACEMENT') {
    const parent = placementOf(entities, ref(e.params[0]), depth + 1);
    const own = placementOf(entities, ref(e.params[1]), depth + 1);
    return { x: parent.x + own.x, y: parent.y + own.y, z: parent.z + own.z };
  }
  if (e.type === 'IFCAXIS2PLACEMENT3D' || e.type === 'IFCAXIS2PLACEMENT2D') {
    return pointOf(entities, ref(e.params[0]));
  }
  return zero;
}

// ---------- 4b. To'liq o'zgartirish (o'rin + burilish) ----------
//
// Faqat koordinata yetarli emas: devor qaysi TOMONGA qaraganini bilmasak
// uning uchlarini joyiga qo'ya olmaymiz va plan chizilmaydi. IFC da
// yo'nalish IfcAxis2Placement3D ning RefDirection (X o'qi) va Axis (Z o'qi)
// maydonlarida turadi. Zanjir bo'ylab ular ko'paytirilib boriladi.

const V = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  scale: (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k }),
  cross: (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  }),
  norm(a) {
    const n = Math.hypot(a.x, a.y, a.z);
    return n < 1e-12 ? { x: 0, y: 0, z: 0 } : { x: a.x / n, y: a.y / n, z: a.z / n };
  }
};

const IDENTITY = {
  o: { x: 0, y: 0, z: 0 },
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 }
};

function directionOf(entities, id) {
  const e = entities.get(id);
  if (!e || e.type !== 'IFCDIRECTION') return null;
  const c = list(e.params[0]).map(num);
  return V.norm({ x: c[0] ?? 0, y: c[1] ?? 0, z: c[2] ?? 0 });
}

/** IfcAxis2Placement2D/3D -> {o, x, y, z} */
export function axisPlacement(entities, id) {
  const e = entities.get(id);
  if (!e) return IDENTITY;
  const o = pointOf(entities, ref(e.params[0]));
  if (e.type === 'IFCAXIS2PLACEMENT2D') {
    const x = directionOf(entities, ref(e.params[1])) || IDENTITY.x;
    return { o, x, y: { x: -x.y, y: x.x, z: 0 }, z: IDENTITY.z };
  }
  if (e.type !== 'IFCAXIS2PLACEMENT3D') return IDENTITY;
  const z = directionOf(entities, ref(e.params[1])) || IDENTITY.z;
  let x = directionOf(entities, ref(e.params[2]));
  if (!x) {
    // RefDirection berilmagan: Z ga perpendikulyar ixtiyoriy X olinadi
    x = Math.abs(z.z) > 0.9 ? { x: 1, y: 0, z: 0 } : V.norm(V.cross({ x: 0, y: 0, z: 1 }, z));
  }
  // X ni Z ga perpendikulyar qilamiz (IFC buni talab qiladi, lekin
  // ba'zi eksportlar buzib yozadi)
  const xProj = V.norm(V.add(x, V.scale(z, -(x.x * z.x + x.y * z.y + x.z * z.z))));
  return { o, x: xProj, y: V.cross(z, xProj), z };
}

/** Ikkita o'zgartirishni ketma-ket qo'llash: ota x bola. */
function compose(parent, child) {
  const map = (v) => ({
    x: parent.x.x * v.x + parent.y.x * v.y + parent.z.x * v.z,
    y: parent.x.y * v.x + parent.y.y * v.y + parent.z.y * v.z,
    z: parent.x.z * v.x + parent.y.z * v.y + parent.z.z * v.z
  });
  return {
    o: V.add(parent.o, map(child.o)),
    x: map(child.x), y: map(child.y), z: map(child.z)
  };
}

export function applyTransform(t, p) {
  return {
    x: t.o.x + t.x.x * p.x + t.y.x * p.y + t.z.x * p.z,
    y: t.o.y + t.x.y * p.x + t.y.y * p.y + t.z.y * p.z,
    z: t.o.z + t.x.z * p.x + t.y.z * p.y + t.z.z * p.z
  };
}

/** IfcLocalPlacement zanjiri -> to'liq o'zgartirish. */
export function transformOf(entities, id, depth = 0) {
  if (!id || depth > 30) return IDENTITY;
  const e = entities.get(id);
  if (!e) return IDENTITY;
  if (e.type === 'IFCLOCALPLACEMENT') {
    const parent = transformOf(entities, ref(e.params[0]), depth + 1);
    const own = axisPlacement(entities, ref(e.params[1]));
    return compose(parent, own);
  }
  if (e.type.startsWith('IFCAXIS2PLACEMENT')) return axisPlacement(entities, id);
  return IDENTITY;
}

export function pointOf(entities, id) {
  const e = entities.get(id);
  if (!e || e.type !== 'IFCCARTESIANPOINT') return { x: 0, y: 0, z: 0 };
  const c = list(e.params[0]).map(num);
  return { x: c[0] ?? 0, y: c[1] ?? 0, z: c[2] ?? 0 };
}

// ---------- 5. Element o'lchami ----------

// Uchta manba, ishonch tartibida. Birinchi topilgani olinadi va qaysi
// manbadan kelgani yozib qo'yiladi — muhandis raqamni tekshira olsin.

/** IfcExtrudedAreaSolid: profil + chiqarish balandligi. Eng ishonchli. */
function fromExtrusion(entities, repId) {
  const rep = entities.get(repId);
  if (!rep) return null;

  // IfcProductDefinitionShape -> IfcShapeRepresentation -> Items
  const collect = (id, depth = 0) => {
    if (depth > 8) return [];
    const e = entities.get(id);
    if (!e) return [];
    if (e.type === 'IFCEXTRUDEDAREASOLID') return [e];
    if (e.type === 'IFCPRODUCTDEFINITIONSHAPE') {
      return list(e.params[2]).flatMap((r) => collect(ref(r), depth + 1));
    }
    if (e.type === 'IFCSHAPEREPRESENTATION') {
      return list(e.params[3]).flatMap((r) => collect(ref(r), depth + 1));
    }
    if (e.type === 'IFCMAPPEDITEM') {
      const src = entities.get(ref(e.params[0]));
      return src ? collect(ref(src.params[1]), depth + 1) : [];
    }
    // Kesilgan solid (IfcBooleanClippingResult): asosi birinchi operand
    if (e.type === 'IFCBOOLEANCLIPPINGRESULT' || e.type === 'IFCBOOLEANRESULT') {
      return collect(ref(e.params[1]), depth + 1);
    }
    return [];
  };

  const solids = collect(repId);
  if (!solids.length) return boundingBoxOf(entities, repId);
  const solid = solids[0];
  const depthM = num(solid.params[3]);          // chiqarish uzunligi
  const profile = entities.get(ref(solid.params[0]));
  if (!profile) return null;

  const p = profileSize(entities, profile);
  if (!p) return null;
  return { ...p, extrusion: depthM, source: p.source };
}

// IFC da devorning O'Q CHIZIG'I alohida ko'rinish sifatida saqlanadi:
// RepresentationIdentifier = 'Axis'. Devor uchlarini aynan shundan olish
// kerak. Profil va joylashuvdan chiqarish noto'g'ri: Revit devorni
// boshlang'ich nuqtasiga joylashtiradi, profilning o'zi esa siljigan
// bo'ladi — natijada devorlar bir-biriga ulanmaydi va plan «sochilib»
// ketadi.
export function axisOf(entities, repId) {
  const shape = entities.get(repId);
  if (!shape || shape.type !== 'IFCPRODUCTDEFINITIONSHAPE') return null;
  for (const r of list(shape.params[2])) {
    const rep = entities.get(ref(r));
    if (!rep || rep.type !== 'IFCSHAPEREPRESENTATION') continue;
    if (str(rep.params[1]).toLowerCase() !== 'axis') continue;
    for (const item of list(rep.params[3])) {
      const pts = polygonOf(entities, ref(item));
      if (pts.length >= 2) return [pts[0], pts[pts.length - 1]];
    }
  }
  return null;
}

/** Profil o'lchami: to'rtburchak, aylana yoki ixtiyoriy kontur. */
function profileSize(entities, profile) {
  if (!profile) return null;
  switch (profile.type) {
    case 'IFCRECTANGLEPROFILEDEF':
    case 'IFCROUNDEDRECTANGLEPROFILEDEF':
      return { a: num(profile.params[3]), b: num(profile.params[4]), source: 'profile' };
    case 'IFCCIRCLEPROFILEDEF': {
      const r = num(profile.params[3]);
      return r == null ? null : { a: r * 2, b: r * 2, round: true, source: 'profile' };
    }
    case 'IFCARBITRARYCLOSEDPROFILEDEF': {
      const poly = polygonOf(entities, ref(profile.params[2]));
      if (!poly.length) return null;
      const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
      return {
        a: Math.max(...xs) - Math.min(...xs),
        b: Math.max(...ys) - Math.min(...ys),
        polygon: poly,
        source: 'bbox'
      };
    }
    default:
      return null;
  }
}

// Chiqarilgan solid bo'lmasa - qo'pol chegara qutisi. Zinapoya, poydevor
// va murakkab shakllar Brep yoki Tessellation bilan yoziladi; ularning
// aniq profili yo'q, lekin gabaritini bilish hisob uchun baribir foydali.
// Manba 'bbox' deb belgilanadi - bu taxminiy o'lcham ekani ko'rinib tursin.
function boundingBoxOf(entities, repId) {
  const pts = [];
  const seen = new Set();
  const walk = (id, depth = 0) => {
    // Chegara qutisi uchun bir necha ming nuqta yetarli; undan ortig'i
    // natijani o'zgartirmaydi, lekin vaqt va xotirani yeydi.
    if (!id || depth > 14 || seen.has(id) || pts.length > 5000) return;
    seen.add(id);
    const e = entities.get(id);
    if (!e) return;
    if (e.type === 'IFCCARTESIANPOINT') {
      const c = list(e.params[0]).map(num);
      if (c.length >= 2) pts.push({ x: c[0] ?? 0, y: c[1] ?? 0, z: c[2] ?? 0 });
      return;
    }
    if (e.type === 'IFCCARTESIANPOINTLIST3D' || e.type === 'IFCCARTESIANPOINTLIST2D') {
      for (const row of list(e.params[0])) {
        const c = tokenizeParams(row.trim().replace(/^\(|\)$/g, '')).map(num);
        if (c.length >= 2) pts.push({ x: c[0] ?? 0, y: c[1] ?? 0, z: c[2] ?? 0 });
      }
      return;
    }
    for (const p of e.params) {
      const r = ref(p);
      if (r) { walk(r, depth + 1); continue; }
      // Ro'yxatni ochish qimmat: koordinata ro'yxatlari uzun bo'ladi va
      // ularni bo'lakchalarga ajratish vaqtning katta qismini yeydi.
      // Ichida `#` bo'lmasa - u sof raqamlar, havola yo'q.
      if (typeof p !== 'string' || !p.includes('#')) continue;
      for (const item of list(p)) {
        const r2 = ref(item);
        if (r2) walk(r2, depth + 1);
      }
    }
  };
  walk(repId);
  if (pts.length < 4) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), zs = pts.map((p) => p.z);
  const a = Math.max(...xs) - Math.min(...xs);
  const b = Math.max(...ys) - Math.min(...ys);
  const h = Math.max(...zs) - Math.min(...zs);
  if (!(a > 0) && !(b > 0) && !(h > 0)) return null;
  return { a, b, extrusion: h, source: 'bbox' };
}

function polygonOf(entities, id, depth = 0) {
  const e = entities.get(id);
  if (!e || depth > 6) return [];
  if (e.type === 'IFCPOLYLINE') return list(e.params[0]).map((r) => pointOf(entities, ref(r)));
  if (e.type === 'IFCCOMPOSITECURVE') {
    return list(e.params[0]).flatMap((r) => {
      const seg = entities.get(ref(r));
      return seg ? polygonOf(entities, ref(seg.params[0]), depth + 1) : [];
    });
  }
  return [];
}

// IfcRelDefinesByProperties bog'lanishlarini BIR MARTA indekslaymiz.
// Busiz har element uchun butun fayl aylanardi: 5000 elementli modelda
// bu 5000 x 200000 = milliard qadam, ya'ni dastur qotib qolardi.
export function propertyIndex(entities) {
  const index = new Map(); // elementId -> [definitionId]
  for (const e of entities.values()) {
    if (e.type !== 'IFCRELDEFINESBYPROPERTIES') continue;
    const def = ref(e.params[5]);
    if (!def) continue;
    for (const r of list(e.params[4])) {
      const id = ref(r);
      if (!id) continue;
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(def);
    }
  }
  return index;
}

// Har miqdor O'Z BIRLIGINI e'lon qilishi mumkin: IfcQuantityArea ning
// uchinchi maydoni - Unit. BasicHouse.ifc da loyiha m² deb e'lon qilgan,
// lekin ayrim miqdorlar mm² da yozilgan - 5,4 m² o'rniga 5 400 000
// chiqadi. Bu maydonni o'qimasak smeta million barobar buziladi.
function quantityScale(entities, unitRefParam, power, fallback) {
  const id = ref(unitRefParam);
  if (!id) return fallback;
  const u = entities.get(id);
  if (!u) return fallback;
  if (u.type === 'IFCSIUNIT') {
    const prefix = (u.params[2] || '').replace(/[.$\s]/g, '');
    return (PREFIX[prefix] ?? 1) ** power;
  }
  if (u.type === 'IFCCONVERSIONBASEDUNIT') {
    const name = str(u.params[2] || '').toLowerCase();
    if (name.includes('foot') || name.includes('feet')) return 0.3048 ** power;
    if (name.includes('inch')) return 0.0254 ** power;
  }
  return fallback;
}

/** IfcElementQuantity — model muallifi yozgan o'lchamlar. */
function fromQuantities(entities, elementId, index) {
  const out = {};
  for (const defId of index.get(elementId) || []) {
    const def = entities.get(defId);
    if (!def || def.type !== 'IFCELEMENTQUANTITY') continue;
    for (const qr of list(def.params[5])) {
      const q = entities.get(ref(qr));
      if (!q) continue;
      const name = str(q.params[0]).toLowerCase();
      let value = num(q.params[3]);
      if (value == null) continue;
      // Miqdorning o'z birligi bo'lsa - darhol metr tizimiga keltiramiz.
      // `power` turiga qarab: uzunlik 1, yuza 2, hajm 3.
      const power = q.type === 'IFCQUANTITYAREA' ? 2
                  : q.type === 'IFCQUANTITYVOLUME' ? 3 : 1;
      const own = quantityScale(entities, q.params[2], power, null);
      if (own != null) { value *= own; out.__scaled ??= new Set(); out.__scaled.add(name); }
      // Haqiqiy modellarda buzuq qiymat uchraydi: BasicHouse.ifc da
      // bitta devorning yuzasi 57 282 798 m² deb yozilgan. Uni qabul
      // qilsak butun smeta ma'nosini yo'qotadi.
      if (!Number.isFinite(value) || value < 0 || value > 1e7) continue;
      // Nomlar eksport qiluvchi dasturga qarab farq qiladi: Revit
      // "NetSideArea", ArchiCAD "Area", Tekla "GrossArea" deb yozadi.
      // Shuning uchun kalit so'z bo'yicha qidiriladi, aniq nom bo'yicha emas.
      if (/length/.test(name)) out.length ??= value;
      else if (/width|thickness/.test(name)) out.width ??= value;
      else if (/height|depth/.test(name)) out.height ??= value;
      else if (/volume/.test(name)) out.volume ??= value;
      // YUZA nomi muhim: devor qolipi uchun kerakli qiymat "SideArea"
      // (devor YUZASI), "FootprintArea" esa uning PLANDAGI izi. Ikkinchisi
      // birinchisidan bir necha barobar kichik va u tanlansa hisob
      // jimgina kamayib ketadi.
      else if (/sidearea/.test(name)) out.sideArea ??= value;
      else if (/footprint/.test(name)) out.footprintArea ??= value;
      else if (/area/.test(name)) out.area ??= value;
    }
  }
  // Ustuvorlik: devor yuzasi > umumiy yuza > plandagi iz
  out.area = out.sideArea ?? out.area ?? out.footprintArea;
  delete out.sideArea; delete out.footprintArea;
  if (out.area === undefined) delete out.area;
  return Object.keys(out).length ? { ...out, source: 'quantity' } : null;
}

// ---------- 6. Fazoviy tuzilma: qavatlar va ularning elementlari ----------

// IFC da element qaysi qavatda turgani IfcRelContainedInSpatialStructure
// bilan bog'lanadi. Bu bog'lanishsiz elementlar "qavatsiz" guruhga tushadi
// va yo'qolib ketmaydi.
export function storeysOf(entities, scale) {
  const storeys = [];
  for (const e of entities.values()) {
    if (e.type !== 'IFCBUILDINGSTOREY') continue;
    storeys.push({
      id: e.id,
      name: str(e.params[2]) || `#${e.id}`,
      elevation: (num(e.params[9]) ?? 0) * scale,
      elements: []
    });
  }
  storeys.sort((a, b) => a.elevation - b.elevation);
  return storeys;
}

function containment(entities) {
  const byElement = new Map(); // elementId -> storeyId
  for (const e of entities.values()) {
    if (e.type !== 'IFCRELCONTAINEDINSPATIALSTRUCTURE') continue;
    const storey = ref(e.params[5]);
    for (const r of list(e.params[4])) {
      const id = ref(r);
      if (id) byElement.set(id, storey);
    }
  }
  return byElement;
}

// Qaysi IFC turlari hisobga kiradi. Qolip hisobi uchun aynan shular kerak:
// devor, ustun, plita, to'sin va proyom.
const KINDS = {
  IFCWALL: 'wall', IFCWALLSTANDARDCASE: 'wall', IFCWALLELEMENTEDCASE: 'wall',
  IFCCOLUMN: 'column',
  IFCSLAB: 'slab', IFCSLABSTANDARDCASE: 'slab',
  IFCBEAM: 'beam',
  IFCOPENINGELEMENT: 'opening',
  IFCDOOR: 'door', IFCWINDOW: 'window',
  IFCMEMBER: 'member', IFCFOOTING: 'footing', IFCSTAIR: 'stair'
};

// Yuzani geometriya bilan solishtirib tekshiradi.
// Qaytadi: m² dagi qiymat yoki null.
export function saneArea(rawArea, aFactor, lengthM, heightM) {
  if (rawArea == null) return null;
  let area = rawArea * aFactor;
  if (!(area > 0)) return null;
  const expected = (lengthM && heightM) ? lengthM * heightM : null;
  if (!expected) {
    // Solishtirish uchun geometriya yo'q - faqat aql bovar qiladigan
    // oraliqni tekshiramiz (bitta devor yuzasi 100 000 m² bo'lmaydi)
    return area <= 1e5 ? +area.toFixed(3) : null;
  }
  const ratio = area / expected;
  if (ratio >= 0.3 && ratio <= 3) return +area.toFixed(3);
  // Birlik e'lon qilinmagan mm² - million barobar katta chiqadi
  if (ratio >= 3e5 && ratio <= 3e6) return +(area / 1e6).toFixed(3);
  return null;
}

// Devor uchlari: o'q chizig'idan yoki markazdan.
function wallEnds(entities, e, tf, factor, lengthM) {
  const axis = axisOf(entities, ref(e.params[6]));
  if (axis) {
    const A = applyTransform(tf, axis[0]);
    const B = applyTransform(tf, axis[1]);
    if (Math.hypot(B.x - A.x, B.y - A.y) > 1e-6) {
      return {
        a: [+(A.x * factor).toFixed(3), +(A.y * factor).toFixed(3)],
        b: [+(B.x * factor).toFixed(3), +(B.y * factor).toFixed(3)],
        from: 'axis'
      };
    }
  }
  if (!lengthM) return null;
  const half = lengthM / 2;
  return {
    a: [+(tf.o.x * factor - tf.x.x * half).toFixed(3),
        +(tf.o.y * factor - tf.x.y * half).toFixed(3)],
    b: [+(tf.o.x * factor + tf.x.x * half).toFixed(3),
        +(tf.o.y * factor + tf.x.y * half).toFixed(3)],
    from: 'placement'
  };
}

// ---------- 7. Asosiy funksiya ----------

/**
 * IFC matnidan model chiqaradi.
 * Qaytadi: { schema, unit, storeys[], elements[], stats, problems[] }
 */
// Xotira chegarasi. 51 MB li IFC dan 1 026 311 yozuv chiqadi va ~370 MB
// xotira yeydi. Serverda 2 GB RAM bor va unda boshqa foydalanuvchilar
// ham ishlaydi: chegarasiz katta fayl xizmatni OOM bilan o'ldiradi va
// dastur HAMMA uchun to'xtaydi. Shuning uchun aniq chegara qo'yiladi -
// tushunarli xato yiqilgan xizmatdan yaxshi.
export const MAX_BYTES = 40 * 1024 * 1024;

export function readIfc(raw, { maxElements = 200000, maxBytes = MAX_BYTES } = {}) {
  if (typeof raw !== 'string' || !/ISO-10303-21/i.test(raw.slice(0, 4000))) {
    throw new Error('IFC STEP sarlavhasi topilmadi (ISO-10303-21)');
  }
  if (raw.length > maxBytes) {
    throw new Error(
      `IFC juda katta: ${Math.round(raw.length / 1048576)} MB `
      + `(chegara ${Math.round(maxBytes / 1048576)} MB). `
      + "Bitta qavatni yoki bitta bo'limni alohida eksport qiling."
    );
  }
  const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(raw)?.[1] || 'IFC';
  const entities = parseStep(raw);
  if (!entities.size) throw new Error('IFC ichida bironta yozuv topilmadi');

  const { factor, unit } = lengthScale(entities);
  const aFactor = areaScale(entities, factor);
  const vFactor = volumeScale(entities, factor);
  const storeys = storeysOf(entities, factor);
  const inStorey = containment(entities);
  const byId = new Map(storeys.map((s) => [s.id, s]));

  const propIndex = propertyIndex(entities);
  const voids = voidsIndex(entities);
  const elements = [];
  const properties = {};
  const problems = [];
  let scanned = 0;

  for (const e of entities.values()) {
    const kind = KINDS[e.type];
    if (!kind) continue;
    if (++scanned > maxElements) {
      problems.push(`Model juda katta: ${maxElements} elementdan keyin to'xtatildi`);
      break;
    }

    const tf = transformOf(entities, ref(e.params[5]));
    const place = tf.o;
    const geom = fromExtrusion(entities, ref(e.params[6]));
    const qty = fromQuantities(entities, e.id, propIndex);
    if (kind === 'wall' || kind === 'slab') {
      const props = propertiesOf(entities, e.id, propIndex);
      if (Object.keys(props).length) properties[e.id] = props;
    }

    // ISHONCH TARTIBI: profil > miqdor > chegara qutisi.
    //
    // Profil - modelning aniq o'lchami. Miqdor - muallif yozgani, u ham
    // ishonchli. Chegara qutisi esa TAXMIN: zinapoyaning gabariti uning
    // qalinligi emas. Shuning uchun bbox faqat boshqasi yo'q bo'lgandagina
    // ishlatiladi - aks holda taxmin aniq o'lchamni siqib chiqarardi.
    let lengthM = null, widthM = null, heightM = null, source = null;
    const takeGeom = () => {
      if (!geom) return;
      if (lengthM == null && geom.a != null) { lengthM = geom.a * factor; source ??= geom.source; }
      if (widthM == null && geom.b != null) { widthM = geom.b * factor; source ??= geom.source; }
      if (heightM == null && geom.extrusion != null) { heightM = geom.extrusion * factor; source ??= geom.source; }
    };
    const takeQty = () => {
      if (!qty) return;
      if (lengthM == null && qty.length != null) { lengthM = qty.length * factor; source ??= 'quantity'; }
      if (widthM == null && qty.width != null) { widthM = qty.width * factor; source ??= 'quantity'; }
      if (heightM == null && qty.height != null) { heightM = qty.height * factor; source ??= 'quantity'; }
    };
    if (geom?.source === 'profile') { takeGeom(); takeQty(); }
    else { takeQty(); takeGeom(); }

    // Eshik va derazada IFC ning O'ZIDA maxsus maydon bor:
    // OverallHeight (8) va OverallWidth (9). Profil bilan chalkashmaydi -
    // proyomning profili «balandlik x eni», chiqarishi esa devor
    // qalinligi bo'ladi va uni devordagidek talqin qilsak o'lcham
    // ag'darilib ketadi.
    if (kind === 'door' || kind === 'window') {
      const oh = num(e.params[8]), ow = num(e.params[9]);
      if (ow != null) { lengthM = ow * factor; source = 'attribute'; }
      if (oh != null) { heightM = oh * factor; source = 'attribute'; }
    }

    const storeyId = inStorey.get(e.id) ?? null;
    const el = {
      id: e.id,
      kind,
      ifcType: e.type,
      name: str(e.params[2]),
      storey: byId.get(storeyId)?.name ?? null,
      x: +(place.x * factor).toFixed(4),
      y: +(place.y * factor).toFixed(4),
      z: +(place.z * factor).toFixed(4),
      lengthM: lengthM == null ? null : +lengthM.toFixed(4),
      widthM: widthM == null ? null : +widthM.toFixed(4),
      heightM: heightM == null ? null : +heightM.toFixed(4),
      // Devor uchlari. Birinchi manba - IFC ning O'Z o'q chizig'i
      // ('Axis'): u devorning haqiqiy boshi va oxirini beradi va
      // devorlar bir-biriga ulanadi. O'q berilmagan bo'lsagina
      // markazdan yarim uzunlikka chiqiladi (zaxira yo'l).
      ends: kind === 'wall' ? wallEnds(entities, e, tf, factor, lengthM) : null,
      // Yuza GEOMETRIYA bilan tekshiriladi. Haqiqiy modellarda buzuq
      // miqdor uchraydi: BasicHouse.ifc da bitta devorning yuzasi
      // 57 282 798 m² deb yozilgan, yonida esa to'g'ri qiymat 48,02.
      // Ba'zilari esa birlik e'lon qilmasdan mm² da yozilgan.
      // Shuning uchun L x H bilan solishtiriladi: mos kelmasa yuza
      // OLINMAYDI. Yo'q raqam noto'g'ri raqamdan yaxshi.
      areaM2: saneArea(qty?.area, aFactor, lengthM, heightM),
      volumeM3: qty?.volume != null ? +(qty.volume * vFactor).toFixed(3) : null,
      source                     // profile | quantity | bbox | null
    };
    elements.push(el);
    byId.get(storeyId)?.elements.push(el.id);
  }

  const counts = {};
  for (const el of elements) counts[el.kind] = (counts[el.kind] || 0) + 1;
  const measured = elements.filter((e) => e.source).length;

  if (!elements.length) problems.push('Modelda devor, ustun yoki plita topilmadi');
  if (!storeys.length) problems.push('Qavat (IfcBuildingStorey) topilmadi');
  if (elements.length && measured / elements.length < 0.5) {
    problems.push(
      `Elementlarning yarmidan ko'pida o'lcham yo'q (${measured}/${elements.length}) — ` +
      "model geometriyasiz eksport qilingan bo'lishi mumkin"
    );
  }

  return {
    schema, unit, unitFactor: factor,
    storeys: storeys.map((s) => ({ ...s, count: s.elements.length })),
    elements,
    properties,
    voids: {
      byWall: Object.fromEntries(voids.byWall),
      fill: Object.fromEntries(voids.fill)
    },
    stats: { total: elements.length, measured, counts, entities: entities.size },
    problems
  };
}

// ---------- 8. Xossalar (Pset) ----------

// Devor tashqarimi yoki ichkarimi — buni taxmin qilish o'rniga modelning
// o'zidan so'raymiz: Revit va ArchiCAD `Pset_WallCommon.IsExternal` ni
// yozadi. Yozilmagan bo'lsagina geometrik taxminga o'tiladi.
export function propertiesOf(entities, elementId, index) {
  const out = {};
  const defs = index ? (index.get(elementId) || []) : [];
  for (const defId of defs) {
    const set = entities.get(defId);
    if (!set || set.type !== 'IFCPROPERTYSET') continue;
    for (const pr of list(set.params[4])) {
      const prop = entities.get(ref(pr));
      if (!prop || prop.type !== 'IFCPROPERTYSINGLEVALUE') continue;
      const name = str(prop.params[0]);
      // Qiymat ikki xil keladi: `.T.` yoki `IFCBOOLEAN(.T.)`. Ikkalasi ham
      // qabul qilinadi, aks holda IsExternal hech qachon o'qilmaydi.
      const rawVal = (prop.params[2] || '').trim();
      const inner = /^[A-Z0-9_]+\(([\s\S]*)\)$/i.exec(rawVal)?.[1] ?? rawVal;
      let value = null;
      if (/^\.T\.$/i.test(inner)) value = true;
      else if (/^\.F\.$/i.test(inner)) value = false;
      else value = num(inner) ?? (str(inner) || null);
      if (name) out[name] = value;
    }
  }
  return out;
}

// ---------- 8b. Proyomlar: eshik va deraza ----------
//
// IFC da proyom devorga IfcRelVoidsElement bilan bog'lanadi, eshik yoki
// deraza esa proyomga IfcRelFillsElement bilan. Bu bog'lanishlarsiz
// devor yuzasidan eshik-deraza chegirilmaydi va QOLIP ORTIQCHA chiqadi -
// 3 x 2,1 m li eshik bitta devorda 6 m² ortiqcha qolip degani.

export function voidsIndex(entities) {
  const byWall = new Map();     // devor id -> [proyom id]
  const fill = new Map();       // proyom id -> to'ldiruvchi element id
  for (const e of entities.values()) {
    if (e.type === 'IFCRELVOIDSELEMENT') {
      const wall = ref(e.params[4]);
      const opening = ref(e.params[5]);
      if (!wall || !opening) continue;
      if (!byWall.has(wall)) byWall.set(wall, []);
      byWall.get(wall).push(opening);
    } else if (e.type === 'IFCRELFILLSELEMENT') {
      const opening = ref(e.params[4]);
      const filler = ref(e.params[5]);
      if (opening && filler) fill.set(opening, filler);
    }
  }
  return { byWall, fill };
}

/**
 * Proyomni devor bo'ylab joylashtiradi.
 * `offset` - devor boshidan (a nuqtasidan) masofa, `sill` - poldan balandlik.
 */
export function placeOpening(wall, opening) {
  if (!wall.ends || !opening.lengthM) return null;
  const [ax, ay] = wall.ends.a;
  const [bx, by] = wall.ends.b;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  // Proyom markazini devor o'qiga proyeksiya qilamiz
  const t = ((opening.x - ax) * dx + (opening.y - ay) * dy) / (len * len);
  const centre = t * len;
  const width = opening.lengthM;
  const offset = centre - width / 2;
  // Devordan tashqarida qolgan proyom - model xatosi, olinmaydi
  if (offset < -0.5 || offset > len + 0.5) return null;
  const sill = Math.max(0, +(opening.z - wall.z).toFixed(3));
  return {
    offset: +Math.max(0, offset).toFixed(3),
    width: +width.toFixed(3),
    height: opening.heightM ? +opening.heightM.toFixed(3) : null,
    sill
  };
}

// ---------- 9. IFC -> hisob plani ----------

/**
 * O'qilgan modelni platformaning plan formatiga o'giradi — shundan keyin
 * qolip hisobi, 5D va ishchi chizmalar IFC dan ham ishlaydi.
 *
 * Faqat O'LCHAMI BOR elementlar o'tadi: o'lchamsizini plana qo'shsak
 * hisobda nol uzunlikli devor paydo bo'ladi va uni hech kim sezmaydi.
 */
export function ifcToPlan(model, { name = 'IFC model' } = {}) {
  const skipped = { noSize: 0, noEnds: 0 };
  // Devorlar bir necha marta ko'rib chiqiladi (asosiy sath uchun va har
  // qavat uchun alohida). Tashlangan elementni ikki marta sanamaslik
  // uchun ular ro'yxatda belgilanadi - aks holda hisobot yolg'on
  // gapiradi va odam nechta element yo'qolganini bilmaydi.
  const seenSkips = new Set();
  const noteSkip = (id, why) => {
    if (seenSkips.has(id)) return;
    seenSkips.add(id);
    skipped[why]++;
  };
  const byStorey = new Map();
  for (const el of model.elements) {
    const key = el.storey || '(qavatsiz)';
    if (!byStorey.has(key)) byStorey.set(key, []);
    byStorey.get(key).push(el);
  }

  // Qavatlar: balandlik ketma-ket qavatlar farqidan, oxirgisiniki esa
  // o'z devorlarining balandligidan olinadi.
  const src = model.storeys.length
    ? model.storeys
    : [{ name: '(qavatsiz)', elevation: 0 }];
  const floors = src.map((s, i) => {
    const next = src[i + 1];
    const walls = (byStorey.get(s.name) || []).filter((e) => e.kind === 'wall' && e.heightM);
    const fromWalls = walls.length
      ? +(walls.reduce((a, w) => a + w.heightM, 0) / walls.length).toFixed(2)
      : null;
    const height = next ? +(next.elevation - s.elevation).toFixed(2) : (fromWalls ?? 3);
    return {
      id: `s${i}`,
      name: s.name,
      height: height > 0 ? height : (fromWalls ?? 3),
      underground: s.elevation < -0.5,
      facade: true
    };
  });

  // Qaysi qavatdan plan quriladi. Eng pastki qavat DEVORSIZ bo'lishi
  // mumkin (masalan «Site» yoki bo'sh texnik qavat) - u holda plan bo'sh
  // chiqadi va model bekorga rad etiladi. Shuning uchun devori BOR eng
  // pastki qavat olinadi.
  const wallCount = (name) =>
    (byStorey.get(name) || []).filter((e) => e.kind === 'wall' && e.lengthM).length;
  const level = floors.find((f) => wallCount(f.name) > 0)?.name
             || floors[0]?.name || '(qavatsiz)';

  const wallsOf = (name) => {
    const out = [];
    for (const el of byStorey.get(name) || []) {
      if (el.kind !== 'wall') continue;
      if (!el.lengthM || !el.widthM) { noteSkip(el.id, 'noSize'); continue; }
      if (!el.ends) { noteSkip(el.id, 'noEnds'); continue; }
      const props = model.properties?.[el.id] || {};
      out.push({
        id: `w${el.id}`,
        a: el.ends.a,
        b: el.ends.b,
        thickness: el.widthM,
        height: el.heightM ?? floors[0]?.height ?? 3,
        type: props.IsExternal === true ? 'exterior'
            : props.IsExternal === false ? 'interior' : undefined,
        ifcId: el.id,
        name: el.name
      });
    }
    return out;
  };

  const walls = wallsOf(level);

  // Har qavatga O'Z devorlari biriktiriladi: podvalda 90, 1-qavatda 183
  // devor bo'lishi mumkin va ularni bitta to'plam bilan hisoblash xato.
  for (const f of floors) {
    const own = wallsOf(f.name);
    if (own.length) f.walls = own;
  }

  const columns = (byStorey.get(level) || [])
    .filter((e) => e.kind === 'column' && e.lengthM && e.widthM)
    .map((e) => ({ id: `c${e.id}`, x: e.x, y: e.y, a: e.lengthM, b: e.widthM }));

  // --- Proyomlar: devor yuzasidan chegiriladi ---
  // Bularsiz qolip ortiqcha chiqadi: 3 x 2,1 m li eshik bitta devorda
  // 6 m² ortiqcha panel degani, ikki yuzada esa 12 m².
  const openings = [];
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const wallById = new Map(walls.map((w) => [w.ifcId, w]));
  for (const [wallId, list] of Object.entries(model.voids?.byWall || {})) {
    const wallEl = byId.get(+wallId);
    const planWall = wallById.get(+wallId);
    if (!wallEl || !planWall) continue;
    for (const openingId of list) {
      const op = byId.get(openingId);
      if (!op) continue;
      // O'lcham manbai: eshik/derazaning O'ZI eng ishonchli (IFC da
      // OverallWidth/OverallHeight aynan shu uchun). Proyomning profili
      // «balandlik x eni» bo'lgani uchun undan olsak o'lcham ag'dariladi.
      const filler = byId.get(model.voids.fill[openingId]);
      const size = (filler && filler.lengthM && filler.heightM) ? filler : op;
      const placed = placeOpening(wallEl, { ...op, lengthM: size.lengthM, heightM: size.heightM });
      if (!placed || !placed.height) { skipped.opening = (skipped.opening || 0) + 1; continue; }
      const type = filler?.kind === 'door' ? 'door'
                 : filler?.kind === 'window' ? 'window'
                 : placed.sill < 0.3 ? 'door' : 'window';
      openings.push({ id: `o${openingId}`, wallId: planWall.id, type, ...placed });
    }
  }

  return {
    meta: {
      name,
      source: 'ifc',
      units: 'm',
      level,
      schema: model.schema,
      analysis: {
        walls: walls.length,
        columns: columns.length,
        openings: openings.length,
        storeys: floors.length,
        skipped
      }
    },
    floors,
    walls,
    openings,
    rooms: [],
    columns
  };
}
