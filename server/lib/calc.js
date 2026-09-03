// ============================================================
//  Material hisob-kitob dvigateli (BOQ) + 5D jadval
//  KO'P QAVATLI: har qavat uchun alohida hisob — apalkani qavat bo'yicha
//  yoqish/o'chirish (facade: true/false) va har qavat kesimida ko'rish.
//  MINAR qoliplari: qavatga real mahsulot tanlansa (KSHO/MSHO) — aniq
//  panel kombinatsiyasi va aksessuarlar hisoblanadi (shared/formwork.js).
//
//  MAYDON TA'RIFI (bitta manba):
//   · MINAR qolip (msho/ksho) — IKKI yuza, eshik/deraza o'rinlari chegirilgan.
//     Raqam computeFormwork dan olinadi: aynan panel bilan yopilgan yuza.
//   · Klassik vent-fasad — faqat TASHQI yuza, ochiqliklar chegirilgan.
//  UI, spetsifikatsiya va 5D jadval shu bitta raqamdan foydalanadi.
// ============================================================
import {
  computeFormwork, exteriorWallsOf, openingsOfWall, wallLengthOf, FORMWORK_NORMS
} from '../../shared/formwork.js';

export const DEFAULT_RATES = {
  // materiallar (so'm)
  gips_mix_bosh: 45000,      // Shtukaturka smesi, 25kg qop
  tsement_bosh: 65000,       // Tsement 50kg
  qum_m3: 250000,            // Qum m3
  plitka_m2: 120000,         // Pol plitkasi m2
  plitka_qop: 55000,         // Plitka yelim / blok yelimi, 25kg qop
  grout_qop: 30000,          // Sutka (grout), 5kg
  boyoq_l: 40000,            // Bo'yoq litr
  gisht_dona: 1500,          // G'isht dona
  gazobeton_m3: 950000,      // Gazobeton blok m3
  apalka_m2: 350000,         // Apalka (fasad paneli/tosh) m2
  tirgak: 25000,             // Tirgak (bracket) dona
  anker: 8000,               // Anker bolt dona
  gayka: 1000,               // Gayka dona
  shayba: 500,               // Shayba dona
  profil_m: 30000,           // Vertikal yo'naltiruvchi profil m
  klemmer: 3000,             // Klemmer (qisqich) dona
  izolyatsiya_m2: 60000,     // Mineralvata m2
  // MINAR qolip tizimi — SOTIB OLISH narxlari (UI'da tahrirlanadi)
  minar_panel_kg: 18000,     // Qolip panelli po'lat konstruksiya kg
  minar_zamok: 180000,       // Universal zamok (240mm)
  minar_tyaga: 30000,        // Tyaga (tayrot) 150 kN
  minar_gayka: 12000,        // Cho'yan gayka
  minar_klin: 9000,          // Klin 79×27
  minar_truba_m: 45000,      // Truba (vert/goriz) m
  minar_ushlagich: 35000,    // Ikki shoxli tirgak (truba ushlagichi)
  qolip_brace: 180000,       // Push-pull tirgak (qiyalik tayanch, 2.5 m)
  qolip_ustun: 1620000,      // Ustun qolipi (universal, 40×40) m2 — ~90 kg/m²
  minar_tu: 480000,          // Teleskopik ustun (o'rtacha)
  minar_uchoyoq: 220000,     // Uch oyoq
  minar_univilka: 90000,     // Univilka
  minar_ish_m2: 45000,       // Qolip montaji/demontaji mehnat m2
  // MINAR ARENDA (ijara) — OYLIK tariflar (dona·oy / m·oy / m2·oy)
  qolip_panel_rent: 4000,    // panel kg/oy
  qolip_zamok_rent: 8000,
  qolip_klin_rent: 1000,
  qolip_tyaga_rent: 2500,
  qolip_gayka_rent: 800,
  qolip_ushlagich_rent: 4000,
  qolip_brace_rent: 15000,
  qolip_truba_rent: 3000,    // m/oy
  qolip_ustun_rent: 60000,   // m2/oy
  qolip_tu_rent: 25000,
  qolip_uchoyoq_rent: 12000,
  qolip_univilka_rent: 4000,
  // mehnat (so'm)
  ish_gisht_dona: 900,
  ish_gazobeton_m3: 180000,
  ish_shtukaturka_m2: 60000,
  ish_stjazhka_m2: 35000,
  ish_plitka_m2: 90000,
  ish_fasad_m2: 150000,
  ish_boyok_m2: 25000
};

export const DEFAULT_K = {
  fasad_zaxira: 1.10,
  tirgak_m2: 4,
  anker_tirgakka: 2,
  gayka_ankerga: 1,
  shayba_ankerga: 1,
  profil_spet: 0.6,
  klemmer_m2: 4
};

export const PRODUCTIVITY = { // 1 ishchi kuniga, m2
  facade: 5
};
export const CREW = 4;

// ---------- Geometriya ----------
export function wallLength(w) { return wallLengthOf(w); }
export function polyArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    if (![x1, y1, x2, y2].every(Number.isFinite)) return 0;
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
}

// Qavatlar ro'yxatini normalizatsiya qilish (eski loyihalar uchun moslash)
// Standart: MINAR MSHO qizil (RAL3020) qolip — foydalanuvchi boshqacha tanlamaguncha
export function normalizeFloors(plan) {
  const clampH = (v) => Math.min(6, Math.max(0.5, Number(v) || 3));
  if (plan.floors?.length) {
    return plan.floors.slice(0, 40).map((f, i) => ({
      id: f.id || 'fl' + i,
      name: f.name || (i + 1) + '-qavat',
      height: clampH(f.height),
      facade: f.facade !== false,
      underground: !!f.underground,
      formwork: f.formwork && f.formwork.type
        ? { type: f.formwork.type, color: f.formwork.color || 'RAL3020' }
        : { type: 'msho', color: 'RAL3020' }
    }));
  }
  const h = plan.walls?.[0]?.height || 3;
  return [{ id: 'fl0', name: plan.meta?.level || '1-qavat', height: clampH(h), facade: true, underground: false, formwork: { type: 'msho', color: 'RAL3020' } }];
}

// ------------------------------------------------------------
//  Qavatlar ro'yxatini qurish va APALKA SXEMASINI qo'llash.
//
//  Standart sxema — 'podval-1': qolip faqat YER OSTI qavatlariga va
//  birinchi yer usti qavatiga qo'yiladi, qolganlariga qo'yilmaydi.
//  Bu MINAR amaliyotidagi eng ko'p uchraydigan holat: podval va
//  1-qavat monolit quyiladi, yuqorisi boshqa texnologiyada ketadi.
// ------------------------------------------------------------
export const FORMWORK_SCHEMES = {
  'podval-1': 'Faqat podval va 1-qavat',
  all: 'Barcha qavatlar'
};

export function applyFormworkScheme(floors, scheme = 'podval-1') {
  const list = Array.isArray(floors) ? floors : [];
  if (scheme === 'all') return list.map((f) => ({ ...f, facade: true }));
  // birinchi yer usti qavati indeksi
  const firstAbove = list.findIndex((f) => !f.underground);
  return list.map((f, i) => ({ ...f, facade: !!f.underground || i === firstAbove }));
}

// AI/hujjatlardan olingan qavatlarni to'liq qavat obyektiga aylantirish
export function buildFloors(detected, { scheme = 'podval-1', type = 'msho', color = 'RAL3020', ensurePodval = true } = {}) {
  let list = Array.isArray(detected) && detected.length ? detected : [
    { name: 'Podval', height: 2.8, underground: true },
    { name: '1-qavat', height: 3.0, underground: false }
  ];
  // 'podval-1' sxemasida podval qoidaning bir qismi. Hujjatlarda yer osti
  // qavati topilmagan bo'lsa ham u qo'shiladi (tahlil hisobotida ko'rsatiladi
  // va kerak bo'lmasa "Qavatlar" bo'limida o'chiriladi).
  if (ensurePodval && scheme === 'podval-1' && !list.some((f) => f.underground)) {
    list = [{ name: 'Podval', height: 2.8, underground: true, addedByRule: true }, ...list];
  }
  const built = list.slice(0, 40).map((f, i) => ({
    id: 'fl' + i,
    name: String(f.name || (i + 1) + '-qavat').slice(0, 40),
    height: Math.min(6, Math.max(0.5, Number(f.height) || 3)),
    underground: !!f.underground,
    facade: true,
    formwork: { type, color },
    ...(f.addedByRule ? { addedByRule: true } : {})
  }));
  list = built;
  // yer osti qavatlari doim boshida tursin
  list.sort((a, b) => (b.underground ? 1 : 0) - (a.underground ? 1 : 0) === 0 ? 0 : (a.underground ? -1 : 1));
  return applyFormworkScheme(list, scheme);
}

// Klassik vent-fasad maydoni: faqat TASHQI yuza, ochiqliklar chegirilgan
function classicFacadeArea(plan, extWalls, H) {
  let area = 0;
  for (const w of extWalls) {
    const L = wallLengthOf(w);
    if (L < 0.5) continue;
    let open = 0;
    for (const o of openingsOfWall(plan, w, H)) open += (o.x1 - o.x0) * (o.y1 - o.y0);
    area += Math.max(0, L * H - open);
  }
  return area;
}

// ---------- Miqdorlar (qavat-qavat) ----------
export function computeQuantities(plan, opts = {}) {
  const k = { ...DEFAULT_K, ...(opts.k || {}) };

  const wallsAll = exteriorWallsOf(plan); // tashqi devorlar avtomatik aniqlangan
  const extWalls = wallsAll.filter((w) => w.type === 'exterior');
  const rooms = plan.rooms || [];
  const floors = normalizeFloors(plan);

  // MINAR qolip qatorlari va HAR QAVAT uchun aynan yopilgan yuza
  const fw = computeFormwork({
    plan, floors,
    rates: opts.rates || {},
    rent: !!opts.rent,
    months: Number(opts.rentMonths) || 1
  });

  const items = [];
  const add = (floor, baseKey, name, unit, qty, matKey, ishKey, phase) => {
    if (!(qty > 0)) return;
    items.push({
      key: baseKey + '@' + floor.id, baseKey,
      floorId: floor.id, floorName: floor.name,
      name, unit, qty: +qty.toFixed(2),
      matKey: matKey || null, ishKey: ishKey || null, phase
    });
  };

  const floorArea = rooms.reduce((s, r) => s + polyArea(r.polygon || []), 0);
  let elev = floors[0]?.underground ? -floors[0].height : 0; // podval yer ostidan boshlanadi
  const perFloor = [];

  for (const [fi, fl] of floors.entries()) {
    const H = fl.height;
    const isFw = fl.formwork.type === 'ksho' || fl.formwork.type === 'msho';

    // Qavat devor hajmi (AI chat konteksti va umumiy ma'lumot uchun)
    let wallVol = 0;
    for (const w of wallsAll) wallVol += wallLengthOf(w) * H * (Number(w.thickness) || 0.2);

    // Apalka maydoni — bitta ta'rif, rejimga qarab
    const fwInfo = fw.byFloor[fl.id];
    const facadeArea = !fl.facade ? 0
      : isFw ? (fwInfo?.area || 0)
      : classicFacadeArea(plan, extWalls, H);

    perFloor.push({
      id: fl.id, name: fl.name, index: fi, height: H, elevation: +elev.toFixed(2),
      wallVol: +wallVol.toFixed(2),
      floorArea: +floorArea.toFixed(2),
      facadeArea: +facadeArea.toFixed(2),
      // panelга kichik qolgan yuza (proyom qutisi bilan yopiladi)
      skippedArea: fwInfo?.skipped || 0,
      panelCount: fwInfo?.panels || 0,
      facade: !!fl.facade, fwType: fl.formwork.type
    });

    // Klassik vent-fasad apalka (faqat 'classic' tanlangan qavatlar uchun)
    if (fl.facade && facadeArea > 0 && !isFw) {
      const apalkaM2 = facadeArea * k.fasad_zaxira;
      const tirgakCnt = facadeArea * k.tirgak_m2;
      const ankerCnt = tirgakCnt * k.anker_tirgakka;
      const nutCnt = ankerCnt * k.gayka_ankerga + tirgakCnt;
      add(fl, 'apalka', 'Apalka (fasad paneli/tosh)', 'm2', apalkaM2, 'apalka_m2', null, 'facade');
      add(fl, 'fasad_ish', 'Fasad montaji ishi (mehnat)', 'm2', facadeArea, null, 'ish_fasad_m2', 'facade');
      add(fl, 'izolyatsiya', 'Mineralvata izolyatsiya', 'm2', facadeArea, 'izolyatsiya_m2', null, 'facade');
      add(fl, 'tirgak', 'Tirgak (bracket, galvanik)', 'dona', tirgakCnt, 'tirgak', null, 'facade');
      add(fl, 'anker', 'Anker bolt (kengaytiruvchi)', 'dona', ankerCnt, 'anker', null, 'facade');
      add(fl, 'gayka', 'Gayka (M8/M10)', 'dona', nutCnt, 'gayka', null, 'facade');
      add(fl, 'shayba', 'Shayba', 'dona', nutCnt, 'shayba', null, 'facade');
      add(fl, 'profil', 'Vertikal profil (aluminiy)', 'm', facadeArea / k.profil_spet, 'profil_m', null, 'facade');
      add(fl, 'klemmer', 'Klemmer (panel qisqichi)', 'dona', facadeArea * k.klemmer_m2, 'klemmer', null, 'facade');
    }

    elev += H;
  }

  // Qolip qatorlari (computeFormwork apalkasi o'chirilgan qavatlarni o'tkazib yuboradi)
  items.push(...fw.rows);

  const sum = (key) => +perFloor.reduce((s, f) => s + (f[key] || 0), 0).toFixed(2);
  const quantities = {
    floorCount: floors.length,
    totalHeight: +elev.toFixed(2),
    wallVol: sum('wallVol'),
    floorArea: sum('floorArea'),
    facadeArea: sum('facadeArea'),
    skippedArea: sum('skippedArea'),
    panelCount: perFloor.reduce((s, f) => s + (f.panelCount || 0), 0),
    // apalka tizimi bo'yicha bo'linish (5D jadval uchun)
    facadeAreaFw: +perFloor.filter((f) => f.fwType !== 'classic').reduce((s, f) => s + f.facadeArea, 0).toFixed(2),
    facadeAreaClassic: +perFloor.filter((f) => f.fwType === 'classic').reduce((s, f) => s + f.facadeArea, 0).toFixed(2),
    extWallLen: +extWalls.reduce((s, w) => s + wallLengthOf(w), 0).toFixed(2),
    openingCount: (plan.openings || []).length * floors.length,
    faces: FORMWORK_NORMS.FACES,
    rent: !!opts.rent,
    rentMonths: opts.rent ? Math.max(1, Number(opts.rentMonths) || 1) : 0,
    perFloor
  };

  return { quantities, items, floors };
}

// ============================================================
//  IKKI VARIANT: мелкощитовая va крупнощитовая
//
//  Bitta loyiha uchun ikkala tizim TO'LIQ va ALOHIDA hisoblanadi —
//  mijoz taqqoslab tanlaydi. Tanlangan variant bosh ko'rsatkichlarga,
//  5D ko'rinishga va PDF ga tushadi.
// ============================================================
export const VARIANTS = {
  melki: {
    id: 'melki',
    fwType: 'msho',
    title: 'Мелкощитовая',
    subtitle: 'КМО (Щит) — mayda shtitli qolip',
    hint: 'Kichik panellar: 200–600 × 300–1500 mm. Qo‘lda ko‘tariladi, murakkab shakllarga mos, lekin pozitsiya va zamok ko‘p.',
    color: '#f5a623'
  },
  krupny: {
    id: 'krupny',
    fwType: 'ksho',
    title: 'Крупнощитовая',
    subtitle: 'ЩЛ — katta shtitli qolip',
    hint: 'Katta panellar: 200–1200 × 1200–3300 mm. Kran bilan o‘rnatiladi, montaj tez, chok kam.',
    color: '#2f81f7'
  }
};

export const DEFAULT_VARIANT = 'melki';

// Rejadagi barcha qavatlarni bitta panel tizimiga o'tkazish
function planWithType(plan, fwType) {
  const floors = normalizeFloors(plan).map((f) => ({
    ...f,
    formwork: { type: fwType, color: f.formwork?.color || 'RAL3020' }
  }));
  return { ...plan, floors };
}

// Bitta variantni to'liq hisoblash
export function computeVariant(plan, variantId, opts = {}) {
  const v = VARIANTS[variantId] || VARIANTS[DEFAULT_VARIANT];
  const q = computeQuantities(planWithType(plan, v.fwType), opts);
  const boq = computeBOQ(q.items, opts.rates || {});
  applyPriceOverrides(boq, opts.priceOverrides);
  return {
    id: v.id,
    fwType: v.fwType,   // 3D shu panel oilasini chizadi (msho=КМО, ksho=ЩЛ)
    title: v.title,
    subtitle: v.subtitle,
    hint: v.hint,
    color: v.color,
    quantities: q.quantities,
    boq,
    schedule: computeSchedule(q.quantities, boq),
    floorSummary: computeFloorSummary(boq, q.quantities.perFloor)
  };
}

// Ikkala variant + taqqoslash
export function computeVariants(plan, opts = {}) {
  const melki = computeVariant(plan, 'melki', opts);
  const krupny = computeVariant(plan, 'krupny', opts);
  const cmp = (a, b, key) => {
    const x = a, y = b;
    return { melki: x, krupny: y, diff: +(y - x).toFixed(2), cheaper: x <= y ? 'melki' : 'krupny', key };
  };
  return {
    melki,
    krupny,
    comparison: {
      panels: cmp(melki.quantities.panelCount, krupny.quantities.panelCount, 'panel'),
      rows: cmp(melki.boq.rows.length, krupny.boq.rows.length, 'pozitsiya'),
      total: cmp(melki.boq.total, krupny.boq.total, "so'm"),
      days: cmp(melki.schedule.totalDays, krupny.schedule.totalDays, 'kun'),
      weight: cmp(totalWeight(melki.boq), totalWeight(krupny.boq), 'kg'),
      area: melki.quantities.facadeArea
    }
  };
}

// Spetsifikatsiyadagi umumiy og'irlik (nomdagi "— N kg" dan)
function totalWeight(boq) {
  let sum = 0;
  for (const r of boq.rows) {
    const m = /—\s*([\d.]+)\s*kg/.exec(r.name);
    if (m) sum += Number(m[1]) * r.qty;
  }
  return +sum.toFixed(1);
}

// Qo'lda kiritilgan narxlarni qo'llash
export function applyPriceOverrides(boq, overrides) {
  if (!overrides || !Object.keys(overrides).length) return boq;
  for (const row of boq.rows) {
    const ov = overrides[row.key];
    if (ov === undefined || ov === null) continue;
    const n = Number(ov);
    if (!Number.isFinite(n)) continue;
    row.matRate = n;
    row.matCost = Math.round(row.qty * n);
    row.total = row.matCost + row.laborCost;
  }
  boq.total = boq.rows.reduce((s, x) => s + x.total, 0);
  boq.totalMat = boq.rows.reduce((s, x) => s + x.matCost, 0);
  boq.totalLabor = boq.rows.reduce((s, x) => s + x.laborCost, 0);
  return boq;
}

// ---------- Smetа ----------
export function computeBOQ(items, userRates = {}) {
  const r = { ...DEFAULT_RATES, ...userRates };
  const rows = items.map((it) => {
    const matRate = it.matRateOverride != null ? it.matRateOverride : (it.matKey ? (r[it.matKey] || 0) : 0);
    const ishRate = it.ishRateOverride != null ? it.ishRateOverride : (it.ishKey ? (r[it.ishKey] || 0) : 0);
    const mat = it.qty * matRate, ish = it.qty * ishRate;
    return { ...it, matRate, ishRate, matCost: Math.round(mat), laborCost: Math.round(ish), total: Math.round(mat + ish) };
  });
  return {
    rows,
    total: rows.reduce((s, x) => s + x.total, 0),
    totalMat: rows.reduce((s, x) => s + x.matCost, 0),
    totalLabor: rows.reduce((s, x) => s + x.laborCost, 0)
  };
}

// ---------- Qavat kesimi (miqdor va xarajat) ----------
export function computeFloorSummary(boq, perFloor) {
  const FACADE_KEYS = new Set([
    'apalka', 'fasad_ish', 'izolyatsiya', 'tirgak', 'anker', 'gayka', 'shayba', 'profil', 'klemmer',
    'qolip_panel', 'qolip_zamok', 'qolip_klin', 'qolip_shkvoren', 'qolip_tyaga', 'qolip_gayka',
    'qolip_shayba', 'qolip_brace', 'qolip_ogolovnik', 'qolip_zahvat', 'qolip_balka',
    'qolip_ugol_out', 'qolip_ugol_in', 'qolip_ustun', 'qolip_ustun_gayka',
    'qolip_anker', 'qolip_kronshteyn', 'qolip_shuv',
    'qolip_stoyka', 'qolip_univilka', 'qolip_trenoga', 'qolip_balka_dv', 'qolip_fanera'
  ]);
  return (perFloor || []).map((f) => {
    const rows = boq.rows.filter((r) => r.floorId === f.id);
    return {
      id: f.id, name: f.name, index: f.index, height: f.height, facade: f.facade,
      facadeArea: f.facadeArea, floorArea: f.floorArea,
      panelCount: f.panelCount || 0,
      rows: rows.length,
      total: rows.reduce((s, r) => s + r.total, 0),
      totalMat: rows.reduce((s, r) => s + r.matCost, 0),
      totalLabor: rows.reduce((s, r) => s + r.laborCost, 0),
      facadeTotal: rows.filter((r) => FACADE_KEYS.has(r.baseKey)).reduce((s, r) => s + r.total, 0)
    };
  });
}

// ---------- 5D jadval (faqat apalka/qolip ishlari) ----------
export function computeSchedule(quantities, boq) {
  const q = quantities || {};
  const rows = boq.rows || [];
  const phases = [];
  let day = 1;
  const push = (key, name, qty, prod, unit) => {
    const q2 = qty > 0 ? qty : 5;
    const days = Math.max(1, Math.ceil(q2 / (prod * CREW)));
    const cost = rows.filter((r) => r.phase === key).reduce((s, r) => s + r.total, 0);
    phases.push({ key, name, startDay: day, endDay: day + days - 1, days, qty: +q2.toFixed(1), unit, cost });
    day += days;
  };
  // MINAR qolip montaji (msho/ksho qavatlar) — ikki yuzali sof yuza bo'yicha
  if (rows.some((r) => r.phase === 'walls')) {
    push('walls', 'MINAR qolip (apalka) montaji', q.facadeAreaFw, PRODUCTIVITY.facade, 'm2');
  }
  // Klassik apalka montaji (classic qavatlar bo'lsa)
  if (rows.some((r) => r.phase === 'facade')) {
    push('facade', 'Klassik apalka (vent-fasad) montaji', q.facadeAreaClassic, PRODUCTIVITY.facade, 'm2');
  }
  return { phases, totalDays: Math.max(1, day - 1) };
}
