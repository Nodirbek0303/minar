// ============================================================
//  MINAR qolip (opalubka) katalogi va devorga joylash algoritmi
//  Manba: MINAR UZB.pdf (Silk Stars Engineering) — MSHO, KSHO, TU,
//  zamoklar, tyaga, klin, gaykalar. Server (hisob) va 3D (joylash) ishlatadi.
//
//  MUHIM: qolip devorning IKKALA yuzasiga qo'yiladi. Shu sababli barcha
//  maydon va panel hisoblari ikki yuza bo'yicha yuritiladi, eshik/deraza
//  o'rinlari esa ikkala yuzadan ham chegiriladi (FORMWORK_FACES).
// ============================================================

export const MINAR = {
  brand: 'MINAR — Silk Stars Engineering',
  contact: { site: 'www.minar.uz', phone: '(88) 141-45-00', ig: 'minar.uzbekistan' },
  colors: [
    { id: 'RAL3020', name: 'Qizil', hex: '#c22a1e' },
    { id: 'RAL9005', name: 'Qora', hex: '#1c1c1e' },
    { id: 'RAL2004', name: "To'q sariq", hex: '#e25303' }
  ],
  // MSHO — mayda shtitli qolip: eni 200-600, balandlik 300-1500 mm (1 m² = 26 kg)
  msho: {
    name: 'MSHO — mayda shtitli qolip',
    desc: 'Po‘lat 1045 profil 65×4 mm, fanera 12 mm (laminat 220 g/m²), RAL3020 kukun bo‘yoq',
    widths: [600, 500, 450, 400, 350, 300, 250, 200],
    heights: [1500, 1200, 900, 600, 300],
    kgPerM2: 26,
    noCombo: [['1500', '500'], ['1500', '600']] // katalogda yo'q kombinatsiyalar
  },
  // KSHO — katta shtitli qolip: profil 120×60, ST3SP, 2 mm devor, 3.3 m gacha
  ksho: {
    name: 'KSHO — katta shtitli qolip',
    desc: 'Qolip profili 120×60 (ST3SP), qovurg‘a 2 mm, fanera 12 mm, konus vtulkalar',
    widths: [1200, 1000, 900, 750, 600, 500, 400, 300],
    heights: [3300, 3000, 2700, 1800, 1500, 1200, 900, 600],
    kgPerM2: 90
  },
  // TU — teleskopik ustunlar (p20 jadvali)
  tu: [
    { id: 'TU3.2',  name: 'Teleskopik ustun TU3,2',  range: [1.7, 2.0], weight: 9.84 },
    { id: 'TU3.2L', name: 'Teleskopik ustun TU3,2 (uzun)', range: [1.7, 2.5], weight: 10.79 },
    { id: 'TU3.7',  name: 'Teleskopik ustun TU3,7',  range: [2.0, 3.0], weight: 12.1 },
    { id: 'TU3.7L', name: 'Teleskopik ustun TU3,7 (uzun)', range: [2.0, 3.5], weight: 13.17 },
    { id: 'TU4.2',  name: 'Teleskopik ustun TU4,2',  range: [2.5, 4.2], weight: 14.57 },
    { id: 'TU4.6',  name: 'Teleskopik ustun TU4,6',  range: [2.6, 4.6], weight: 15.86 },
    { id: 'TU5.1',  name: 'Teleskopik ustun TU5,1',  range: [3.05, 5.1], weight: 17.26 }
  ],
  tuTripod: { name: 'Uch oyoq (stoyka triposer)', weight: 4.45 },
  tuUnivilka: { name: 'Univilka (vilka)', weight: 1.4 },
  zamok: {
    universal: { name: 'Universal zamok (240 mm, 50 kN)', weight: 4.6 },
    klinli: { name: 'Klinli zamok (120 mm, 45 kN)', weight: 2.25 },
    qulf: { name: 'Qulf zamok (cho‘yan, 120 mm, 45 kN)', weight: 2.5 },
    uzaytirilgan: { name: 'Uzaytirilgan zamok (375 mm, 45 kN)', weight: 5.0 }
  },
  tyaga: { name: 'Tyaga (tayrot) vint', lengths: [0.8, 1.0, 1.2, 1.5, 3.0], weight: 1.5, kN: 150 },
  gayka: { name: "Cho'yan gayka (150 kN)", weight: 0.52 },
  klin: { name: 'Klin (79×27)', weight: 0.15 },
  trubaVert: { name: 'Vertikal truba + ushlagich (100×75)' },
  trubaHoriz: { name: 'Gorizontal truba + ushlagich (148×73)' }
};

// ------------------------------------------------------------
//  ME'YORLAR — barcha aksessuar formulalari shu yerda, bir joyda.
//  Har birining izohi va kelib chiqishi ko'rsatilgan, shuning uchun
//  smetani tekshirayotgan muhandis raqamni qayerdan kelganini ko'radi.
// ------------------------------------------------------------
export const FORMWORK_NORMS = {
  // Qolip devorning ikkala yuzasiga qo'yiladi.
  FACES: 2,
  // Panel ostidagi texnologik bo'shliq (qolip poldan 2 sm yuqorida yig'iladi).
  GAP_M: 0.02,
  // Zamok: qo'shni panellar chokida, bir chokda 2 dona (yuqori va past).
  // Panellar soni × 2 — qatordagi chekka choklar hisobga olingan taxminiy me'yor.
  ZAMOK_PER_PANEL: 2,
  // Har zamokka bitta klin.
  KLIN_PER_ZAMOK: 1,
  // Tyaga (tayrot): devor bo'ylab 0.9 m qadam, balandlik bo'yicha har 1.2 m da bir qator.
  TYAGA_STEP_M: 0.9,
  TYAGA_ROW_STEP_M: 1.2,
  // Har tyaganing ikki uchida bittadan cho'yan gayka.
  GAYKA_PER_TYAGA: 2,
  // Vertikal truba: devor bo'ylab 1.2 m qadam + har devor uchida bittadan (2 yuza).
  TRUBA_V_STEP_M: 1.2,
  // Gorizontal truba: har 1.2 m balandlikda devor bo'ylab, 5% ulanish zaxirasi.
  TRUBA_H_ROW_STEP_M: 1.2,
  TRUBA_H_WASTE: 1.05,
  // Ikki shoxli tirgak (truba ushlagichi): har vertikal truba × har gorizontal truba kesishmasi.
  // Push-pull tirgak (qiyalik tayanch): devor bo'ylab 2.4 m qadam, 2 yuza.
  BRACE_STEP_M: 2.4,
  // Ustun qolipi: 40×40 sm ustun, perimetri 1.6 m (4 tomon × 0.4 m).
  COLUMN_SIZE_M: 0.4,
  // TU teleskopik ustun: pol (perekrytiye) qolipi uchun 1.5 m² ga 1 dona,
  // har ustunga bitta uch oyoq va bitta univilka.
  TU_AREA_PER_POST_M2: 1.5,
  // Bitta hisob chaqiruvida DP bilan yopiladigan maksimal uzunlik (m).
  // Undan uzun devor teng bo'laklarga bo'linadi — xotira chegarasi.
  DP_CHUNK_M: 20
};

export const COLUMN_SIZE = FORMWORK_NORMS.COLUMN_SIZE_M;

// Panel og'irligi va maydoni
export function panelSpec(type, wMm, hMm) {
  const def = MINAR[type];
  if (!def) return null;
  const banned = type === 'msho' ? MINAR.msho.noCombo : [];
  if (banned.some(([h, w]) => String(hMm) === h && String(wMm) === w)) return null;
  const area = (wMm * hMm) / 1e6;
  return { w: wMm, h: hMm, area: +area.toFixed(3), weight: +(area * def.kgPerM2).toFixed(2) };
}

// Qavat balandligiga mos teleskopik ustun modelini tanlash
export function pickTU(heightM) {
  const h = Number(heightM) || 3;
  return MINAR.tu.find((t) => h >= t.range[0] && h <= t.range[1]) || MINAR.tu[MINAR.tu.length - 1];
}

// Devor bog'lanish nuqtalari (burchak, T-qo'shilishlar) — shu yerlarda
// ustunlar (40×40) qo'yiladi. Nuqta kamida 2 devorga tegishli bo'lishi kerak.
export function columnJunctions(plan) {
  // Chizmadan aniqlangan ustunlar bo'lsa — ularni ishlatamiz
  if (plan.columns?.length) return plan.columns.map((c) => [c.x, c.y]);
  const walls = plan.walls || [];
  const distToSeg = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const raw = [];
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      let touching = 1; // o'z devori
      for (const w2 of walls) {
        if (w2 === w) continue;
        if (distToSeg(p, w2.a, w2.b) < 0.06) { touching++; break; }
      }
      if (touching >= 2) raw.push(p);
    }
  }
  // juda yaqin nuqtalarni birlashtirish (10 sm ichida)
  const merged = [];
  for (const p of raw) {
    const near = merged.find((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.1);
    if (!near) merged.push([p[0], p[1]]);
  }
  return merged;
}

// Tashqi devorlarni aniqilash: 3 ta va undan kam "exterior" belgilangan bo'lsa
// (yuklangan chizmalarda ko'p uchraydi), umumiy konturga yopishgan devorlar
// avtomatik tashqi deb belgilanadi — qolip/apalka shunda ham to'g'ri joylashadi.
export function exteriorWallsOf(plan) {
  const walls = (plan.walls || []).map((w) => ({ ...w }));
  if (!walls.length) return walls;
  if (walls.filter((w) => w.type === 'exterior').length >= 3) return walls;
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const w of walls) for (const p of [w.a, w.b]) {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
  }
  const tol = 0.4;
  for (const w of walls) {
    const near = (p) => Math.min(Math.abs(p[0] - minX), Math.abs(p[0] - maxX), Math.abs(p[1] - minY), Math.abs(p[1] - maxY));
    if (near(w.a) < tol && near(w.b) < tol) w.type = 'exterior';
    else if (w.type !== 'exterior') w.type = w.type || 'interior';
  }
  return walls;
}

export function wallLengthOf(w) {
  return Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
}

// Devorga tegishli ochiqliklar (eshik/deraza), devor ichiga kesib olingan holda
export function openingsOfWall(plan, wall, wallH) {
  const L = wallLengthOf(wall);
  const out = [];
  for (const o of plan.openings || []) {
    if (o.wallId !== wall.id) continue;
    const x0 = Math.max(0, Number(o.offset) || 0);
    const x1 = Math.min(L, x0 + (Number(o.width) || 0));
    const y0 = Math.max(0, Number(o.sill) || 0);
    const y1 = Math.min(wallH, y0 + (Number(o.height) || 0));
    if (x1 - x0 > 0.01 && y1 - y0 > 0.01) out.push({ x0, x1, y0, y1, type: o.type || 'door' });
  }
  return out.sort((a, b) => a.x0 - b.x0);
}

// Uzunlikni panellar bilan ANIQ yopish (DP): minimal panel soni, minimal ortiqcha
function fillLinearDP(targetMm, sizes) {
  const maxSize = Math.max(...sizes);
  const maxLen = targetMm + maxSize;
  const best = new Array(maxLen + 1).fill(null);
  best[0] = { count: 0, last: 0, prev: -1 };
  for (let i = 0; i <= maxLen; i++) {
    if (!best[i]) continue;
    for (const s of sizes) {
      const j = i + s;
      if (j > maxLen) continue;
      const c = best[i].count + 1;
      if (!best[j] || c < best[j].count) best[j] = { count: c, last: s, prev: i };
    }
  }
  // aniq yoki eng kam ortiqcha bilan
  let pick = targetMm;
  for (let extra = 0; extra <= maxSize; extra++) {
    if (best[targetMm + extra]) { pick = targetMm + extra; break; }
  }
  if (!best[pick]) {
    for (let t = targetMm; t >= Math.min(...sizes); t--) if (best[t]) { pick = t; break; }
  }
  const counts = {};
  let cur = pick;
  while (cur > 0 && best[cur]) {
    const b = best[cur];
    counts[b.last] = (counts[b.last] || 0) + 1;
    cur = b.prev;
  }
  return { counts, covered: pick, waste: pick - targetMm };
}

// DP ni cheklangan bo'laklarda ishlatish: juda uzun devor (yoki masshtabi
// buzuq chizma) xotirani portlatmasligi uchun uzunlik bo'laklarga bo'linadi.
export function fillLinear(targetMm, sizes) {
  const t = Math.max(0, Math.round(Number(targetMm) || 0));
  if (!t || !sizes?.length) return { counts: {}, covered: 0, waste: 0 };
  const chunkMm = FORMWORK_NORMS.DP_CHUNK_M * 1000;
  if (t <= chunkMm) return fillLinearDP(t, sizes);
  const parts = Math.ceil(t / chunkMm);
  const per = Math.round(t / parts);
  const counts = {};
  let covered = 0;
  for (let i = 0; i < parts; i++) {
    const seg = i === parts - 1 ? t - per * (parts - 1) : per;
    const r = fillLinearDP(seg, sizes);
    for (const [k, v] of Object.entries(r.counts)) counts[k] = (counts[k] || 0) + v;
    covered += r.covered;
  }
  return { counts, covered, waste: covered - t };
}

// Bitta TO'G'RI TO'RTBURCHAK yuzani qolip panellari bilan yopish.
// Qatorlar (balandlik kombinatsiyasi) va har qatorda eni kombinatsiyasi.
export function layoutWallFace({ type, lenM, hM, wallLenM, wallH, gapM = FORMWORK_NORMS.GAP_M }) {
  const def = MINAR[type];
  if (!def) return { type, rowPlans: [], panelCounts: {}, totalPanels: 0, coveredM: 0, wasteM: 0 };
  const L0 = Number(lenM ?? wallLenM) || 0;
  const H0 = Number(hM ?? wallH) || 0;
  const minH = Math.min(...def.heights) / 1000;
  const minW = Math.min(...def.widths) / 1000;
  if (L0 < minW * 0.5 || H0 < minH * 0.5) {
    return { type, rowPlans: [], panelCounts: {}, totalPanels: 0, coveredM: 0, wasteM: 0 };
  }
  const targetH = Math.max(minH, H0 - gapM);
  const hFill = fillLinear(Math.round(targetH * 1000), def.heights);
  const rows = [];
  for (const [hMm, cnt] of Object.entries(hFill.counts)) {
    for (let r = 0; r < cnt; r++) rows.push(+hMm);
  }
  rows.sort((a, b) => b - a);
  const L = Math.round(L0 * 1000);
  let totalPanels = 0, covered = 0;
  const panelCounts = {}; // "w x h" -> dona
  const rowPlans = [];
  for (const hMm of rows) {
    // katalogda yo'q kombinatsiyalar (masalan 1500x600) shu qatorda ishlatilmaydi
    const banned = type === 'msho' ? MINAR.msho.noCombo : [];
    const allowed = def.widths.filter((w) => !banned.some(([hh, ww]) => String(hMm) === hh && String(w) === ww));
    const f = fillLinear(L, allowed);
    for (const [wMm, cnt] of Object.entries(f.counts)) {
      const key = wMm + 'x' + hMm;
      panelCounts[key] = (panelCounts[key] || 0) + cnt;
      totalPanels += cnt;
    }
    covered += f.covered;
    rowPlans.push({ h: hMm, panels: Object.fromEntries(Object.entries(f.counts).map(([w, c]) => [+w, c])) });
  }
  return { type, rowPlans, panelCounts, totalPanels, coveredM: +(covered / 1000).toFixed(2), wasteM: +((covered - L) / 1000).toFixed(2) };
}

// Devor yuzasini OCHIQLIKLARNI HISOBGA OLIB yopish.
// Eshik va derazalar o'rniga panel qo'yilmaydi — u yerlar alohida qolip
// (proyom qutisi) bilan yopiladi. Yuzasi vertikal bo'laklarga bo'linadi,
// har bo'lakda ochiqlik ustidagi/ostidagi bo'sh to'rtburchaklar yopiladi.
// Qaytadi: har biri {x, y, lenM, hM, rowPlans} bo'lgan segmentlar —
// server ham (miqdor), 3D ham (joylash) shu bitta natijadan foydalanadi.
export function layoutWallFaceWithOpenings({ type, lenM, hM, openings = [] }) {
  const def = MINAR[type];
  const empty = { type, segments: [], panelCounts: {}, totalPanels: 0, areaM2: 0, skippedAreaM2: 0 };
  if (!def) return empty;
  const L = Number(lenM) || 0;
  const H = Number(hM) || 0;
  if (L <= 0 || H <= 0) return empty;
  const minH = Math.min(...def.heights) / 1000;
  const minW = Math.min(...def.widths) / 1000;

  const ops = (openings || []).filter((o) => o.x1 > o.x0 && o.y1 > o.y0);
  // vertikal bo'lak chegaralari
  const cuts = new Set([0, L]);
  for (const o of ops) {
    cuts.add(Math.max(0, Math.min(L, o.x0)));
    cuts.add(Math.max(0, Math.min(L, o.x1)));
  }
  const xs = [...cuts].sort((a, b) => a - b);

  const segments = [];
  const panelCounts = {};
  let totalPanels = 0, areaM2 = 0, skippedAreaM2 = 0;

  const addRect = (x, y, w, h, gapM) => {
    if (w < minW * 0.5 || h < minH * 0.5) { skippedAreaM2 += Math.max(0, w * h); return; }
    const f = layoutWallFace({ type, lenM: w, hM: h, gapM });
    if (!f.rowPlans.length) { skippedAreaM2 += w * h; return; }
    segments.push({ x: +x.toFixed(3), y: +y.toFixed(3), lenM: +w.toFixed(3), hM: +h.toFixed(3), rowPlans: f.rowPlans });
    for (const [k, c] of Object.entries(f.panelCounts)) panelCounts[k] = (panelCounts[k] || 0) + c;
    totalPanels += f.totalPanels;
    areaM2 += w * h;
  };

  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    const bw = x1 - x0;
    if (bw <= 0.001) continue;
    // shu bo'lakni to'sadigan ochiqliklar
    const blocking = ops
      .filter((o) => o.x0 <= x0 + 0.001 && o.x1 >= x1 - 0.001)
      .map((o) => [Math.max(0, o.y0), Math.min(H, o.y1)])
      .sort((a, b) => a[0] - b[0]);
    // bo'sh vertikal oraliqlar
    const free = [];
    let cur = 0;
    for (const [b0, b1] of blocking) {
      if (b0 > cur) free.push([cur, b0]);
      cur = Math.max(cur, b1);
    }
    if (cur < H) free.push([cur, H]);
    for (const [y0, y1] of free) {
      // faqat poldan boshlanadigan bo'lakda texnologik bo'shliq qoldiriladi
      addRect(x0, y0, bw, y1 - y0, y0 <= 0.001 ? FORMWORK_NORMS.GAP_M : 0);
    }
  }

  return {
    type, segments, panelCounts, totalPanels,
    areaM2: +areaM2.toFixed(2),
    skippedAreaM2: +skippedAreaM2.toFixed(2)
  };
}

// Arenda (ijara) narxlari — 1 dona/m uchun OYLIK (so'm). Sotib olish narxlaridan alohida.
export const MINAR_RENT = {
  qolip_panel: 4000,    // panel kg/oy
  qolip_zamok: 8000,    // zamok dona/oy
  qolip_klin: 1000,
  qolip_tyaga: 2500,
  qolip_gayka: 800,
  qolip_ushlagich: 4000,
  qolip_brace: 15000,
  qolip_ustun: 60000,   // m2/oy
  qolip_truba: 3000,    // truba m/oy
  qolip_tu: 25000,
  qolip_uchoyoq: 12000,
  qolip_univilka: 4000
};

// Sotib olish va arenda uchun narx kalitlari (DEFAULT_RATES ichidagi nomlar)
const RATE_KEYS = {
  qolip_zamok:     { buy: 'minar_zamok',     rent: 'qolip_zamok_rent' },
  qolip_klin:      { buy: 'minar_klin',      rent: 'qolip_klin_rent' },
  qolip_tyaga:     { buy: 'minar_tyaga',     rent: 'qolip_tyaga_rent' },
  qolip_gayka:     { buy: 'minar_gayka',     rent: 'qolip_gayka_rent' },
  qolip_ushlagich: { buy: 'minar_ushlagich', rent: 'qolip_ushlagich_rent' },
  qolip_brace:     { buy: 'qolip_brace',     rent: 'qolip_brace_rent' },
  qolip_truba_v:   { buy: 'minar_truba_m',   rent: 'qolip_truba_rent' },
  qolip_truba_h:   { buy: 'minar_truba_m',   rent: 'qolip_truba_rent' },
  qolip_ustun:     { buy: 'qolip_ustun',     rent: 'qolip_ustun_rent' },
  qolip_tu:        { buy: 'minar_tu',        rent: 'qolip_tu_rent' },
  qolip_uchoyoq:   { buy: 'minar_uchoyoq',   rent: 'qolip_uchoyoq_rent' },
  qolip_univilka:  { buy: 'minar_univilka',  rent: 'qolip_univilka_rent' }
};

// Butun loyiha qolipi: tashqi devorlar, IKKI yuza, aksessuarlar, TU ustunlari.
// rent=true bo'lsa — arenda narxlarida (oylik tarif × months).
export function computeFormwork({ plan, floors, rates, rent = false, months = 1 }) {
  const R = rates || {};
  const N = FORMWORK_NORMS;
  const rentMonths = rent ? Math.max(1, Math.round(Number(months) || 1)) : 1;
  const extWalls = exteriorWallsOf(plan).filter((w) => w.type === 'exterior');
  const out = [];      // BOQ qatorlari
  const byFloor = {};  // qavat bo'yicha yopilgan yuza — UI va jadval shu raqamdan foydalanadi

  // Narx kalitini rejimga qarab tanlash. Arendada oylik tarif × oylar soni.
  const priced = (baseKey) => {
    const k = RATE_KEYS[baseKey];
    if (!k) return { matKey: null, matRateOverride: null };
    if (!rent) return { matKey: k.buy, matRateOverride: null };
    const monthly = Number(R[k.rent] ?? MINAR_RENT[baseKey.replace(/_[vh]$/, '')] ?? 0);
    return { matKey: null, matRateOverride: Math.round(monthly * rentMonths) };
  };

  const add = (fl, baseKey, name, unit, qty, opts = {}) => {
    if (!(qty > 0)) return;
    const p = opts.matKey !== undefined || opts.matRateOverride !== undefined ? opts : priced(baseKey);
    out.push({
      key: baseKey + '@' + fl.id, baseKey, floorId: fl.id, floorName: fl.name,
      name, unit, qty: +qty.toFixed(2),
      matKey: p.matKey ?? null, ishKey: opts.ishKey || null, phase: 'walls',
      matRateOverride: p.matRateOverride ?? null
    });
  };

  for (const fl of floors) {
    // Apalka o'chirilgan qavat uchun umuman hisob yuritilmaydi —
    // aks holda qavat kartochkasida panel soni ko'rinib qolardi.
    if (fl.facade === false) continue;
    const fw = fl.formwork;
    if (!fw || !fw.type || fw.type === 'classic') continue;
    const type = fw.type === 'ksho' ? 'ksho' : 'msho';
    const color = fw.color || 'RAL3020';
    const H = Math.max(0.5, Number(fl.height) || 3);
    const agg = {};            // "w x h" -> dona (ikki yuza bilan)
    let extLenTotal = 0;       // tashqi devor uzunligi
    let panelAreaM2 = 0;       // panel bilan yopilgan sof yuza (2 yuza)
    let skippedAreaM2 = 0;     // panelга kichik qolgan (proyom qutisi bilan yopiladi)

    for (const w of extWalls) {
      const L = wallLengthOf(w);
      if (L < 0.5) continue;
      extLenTotal += L;
      const ops = openingsOfWall(plan, w, H);
      const face = layoutWallFaceWithOpenings({ type, lenM: L, hM: H, openings: ops });
      for (const [k, c] of Object.entries(face.panelCounts)) agg[k] = (agg[k] || 0) + c * N.FACES;
      panelAreaM2 += face.areaM2 * N.FACES;
      skippedAreaM2 += face.skippedAreaM2 * N.FACES;
    }
    if (!extLenTotal) continue;

    // --- Panellar (o'lchamlar bo'yicha, dona) ---
    const sizes = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    for (const [k, cnt] of sizes) {
      const [w, h] = k.split('x').map(Number);
      const spec = panelSpec(type, w, h);
      if (!spec) continue;
      const kgRate = rent
        ? Number(R.qolip_panel_rent ?? MINAR_RENT.qolip_panel) * rentMonths
        : Number(R.minar_panel_kg ?? 18000);
      add(fl, 'qolip_panel',
        `MINAR ${type.toUpperCase()} panel ${w}×${h} mm (${spec.weight} kg/dona, ${color})`,
        'dona', cnt, { matKey: null, matRateOverride: Math.round(spec.weight * kgRate) });
    }

    // --- Aksessuarlar (FORMWORK_NORMS bo'yicha) ---
    const panels = Object.values(agg).reduce((s, x) => s + x, 0);
    const tyagaRows = Math.max(1, Math.round(H / N.TYAGA_ROW_STEP_M));
    const zamok = Math.ceil(panels * N.ZAMOK_PER_PANEL);
    const klin = Math.ceil(zamok * N.KLIN_PER_ZAMOK);
    const tyagaCnt = Math.ceil(extLenTotal / N.TYAGA_STEP_M) * tyagaRows;
    const gayka = tyagaCnt * N.GAYKA_PER_TYAGA;
    const vertTubesPerFace = Math.ceil(extLenTotal / N.TRUBA_V_STEP_M) + extWalls.length;
    const trubaVertM = vertTubesPerFace * H * N.FACES;
    const horizRows = Math.max(1, Math.round(H / N.TRUBA_H_ROW_STEP_M));
    const trubaHorizM = horizRows * extLenTotal * N.FACES * N.TRUBA_H_WASTE;
    // Ikki shoxli tirgak: har vertikal truba har gorizontal truba bilan kesishgan joyda
    const ushlagichCnt = vertTubesPerFace * N.FACES * horizRows;
    const braceCnt = Math.ceil(extLenTotal / N.BRACE_STEP_M) * N.FACES;

    add(fl, 'qolip_zamok', 'Universal zamok (240 mm, 50 kN)', 'dona', zamok);
    add(fl, 'qolip_klin', 'Klin (79×27)', 'dona', klin);
    add(fl, 'qolip_tyaga', 'Tyaga (tayrot) 150 kN', 'dona', tyagaCnt);
    add(fl, 'qolip_gayka', "Cho'yan gayka (150 kN)", 'dona', gayka);
    add(fl, 'qolip_ushlagich', 'Ikki shoxli tirgak (truba ushlagichi 100×75)', 'dona', ushlagichCnt);
    add(fl, 'qolip_brace', 'Push-pull tirgak (qiyalik tayanch, 2.5 m)', 'dona', braceCnt);
    add(fl, 'qolip_truba_v', 'Vertikal truba (48 mm) + ushlagich', 'm', trubaVertM);
    add(fl, 'qolip_truba_h', 'Gorizontal truba (48 mm) + ushlagich (148×73)', 'm', trubaHorizM);

    // --- Ustunlar (40×40) — devor bog'lanish nuqtalarida ---
    const cols = columnJunctions(plan);
    const colArea = cols.length * (N.COLUMN_SIZE_M * 4) * H;
    if (colArea > 0) {
      add(fl, 'qolip_ustun', `Ustun qolipi — universal (40×40 sm, ${cols.length} dona)`, 'm2', colArea);
    }

    // --- TU teleskopik ustunlar (pol/perekrytiye qolipi) ---
    const deckArea = deckAreaOf(plan, extWalls);
    if (deckArea > 0) {
      const tu = pickTU(H);
      const tuCnt = Math.ceil(deckArea / N.TU_AREA_PER_POST_M2);
      add(fl, 'qolip_tu', `${tu.name} (${tu.range[0]}–${tu.range[1]} m, ${tu.weight} kg)`, 'dona', tuCnt);
      add(fl, 'qolip_uchoyoq', MINAR.tuTripod.name, 'dona', tuCnt);
      add(fl, 'qolip_univilka', MINAR.tuUnivilka.name, 'dona', tuCnt);
    }

    // qavat bo'yicha yopilgan yuza — UI, spetsifikatsiya va 5D jadval shu raqamni ishlatadi
    byFloor[fl.id] = {
      area: +panelAreaM2.toFixed(2),
      skipped: +skippedAreaM2.toFixed(2),
      panels,
      extLen: +extLenTotal.toFixed(2),
      type
    };
  }
  return { rows: out, byFloor };
}

// Pol (perekrytiye) maydoni: xonalar yig'indisi, bo'lmasa tashqi kontur gabariti
export function deckAreaOf(plan, extWalls) {
  const rooms = plan.rooms || [];
  const polyArea = (poly) => {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      if (![x1, y1, x2, y2].every(Number.isFinite)) return 0;
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s / 2);
  };
  const roomArea = rooms.reduce((s, r) => s + polyArea(r.polygon || []), 0);
  if (roomArea > 0.5) return roomArea;
  const walls = extWalls?.length ? extWalls : exteriorWallsOf(plan).filter((w) => w.type === 'exterior');
  if (!walls.length) return 0;
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const w of walls) for (const p of [w.a, w.b]) {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
  }
  const a = (maxX - minX) * (maxY - minY);
  return Number.isFinite(a) && a > 0 ? a : 0;
}
