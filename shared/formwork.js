// ============================================================
//  MINAR qolip (opalubka) katalogi va devorga joylash algoritmi
//  Manba: MINAR UZB.pdf (Silk Stars Engineering) — MSHO, KSHO, TU,
//  zamoklar, tyaga, klin, gaykalar. Server (hisob) va 3D (joylash) ishlatadi.
//
//  MUHIM: qolip devorning IKKALA yuzasiga qo'yiladi. Shu sababli barcha
//  maydon va panel hisoblari ikki yuza bo'yicha yuritiladi, eshik/deraza
//  o'rinlari esa ikkala yuzadan ham chegiriladi (FORMWORK_FACES).
// ============================================================

import { CATALOG } from './catalog.js';

// Panel oilasidan o'lchamlar ro'yxatini olish (faqat katalogda BOR bo'lganlari)
function panelFamily(key, title, desc) {
  const items = CATALOG.panels[key]?.items || [];
  const widths = [...new Set(items.map((i) => i.w))].sort((a, b) => b - a);
  const heights = [...new Set(items.map((i) => i.h))].sort((a, b) => b - a);
  const byKey = new Map(items.map((i) => [i.w + 'x' + i.h, i]));
  return { key, name: title, desc, items, widths, heights, byKey };
}

export const MINAR = {
  brand: 'MINAR — Silk Stars Engineering',
  contact: { site: 'www.minar.uz', phone: '(88) 141-45-00', ig: 'minar.uzbekistan' },
  catalogSource: CATALOG.source,
  catalogTotal: CATALOG.total,
  colors: [
    { id: 'RAL3020', name: 'Qizil', hex: '#c22a1e' },
    { id: 'RAL9005', name: 'Qora', hex: '#1c1c1e' },
    { id: 'RAL2004', name: "To'q sariq", hex: '#e25303' }
  ],

  // ---- Devor qolipi panellari — o'lchamlar va og'irliklar KATALOGDAN ----
  // msho: КМО (Щит) 200-600 × 300-1500 mm
  msho: panelFamily('kmo', 'КМО (Щит) — mayda shtitli qolip',
    'Katalogdagi 45 o\'lcham: eni 200-600 mm (50 mm qadam), balandligi 300-1500 mm (300 mm qadam)'),
  // ksho: ЩЛ 200-1200 × 1200-3300 mm
  ksho: panelFamily('shl', 'ЩЛ — katta shtitli qolip',
    'Katalogdagi 88 o\'lcham: eni 200-1200 mm, balandligi 1200-3300 mm'),
  // shu: ЩУ universal katta panel
  shu: panelFamily('shu', 'ЩУ — universal katta panel',
    'Katalogdagi 54 o\'lcham: eni 500-1200 mm, balandligi 1200-3300 mm'),

  // ---- Katalogdan olingan boshqa guruhlar ----
  columns: CATALOG.columns,       // ЩУР ustun qolipi
  corners: CATALOG.corners,       // ЩУВ / ЩУВУ / ЩШ / ЩУН burchak elementlari
  angles: CATALOG.angles,         // Угол внутренний / наружний
  extensions: CATALOG.extensions, // УЭ
  beams: CATALOG.beams,           // Балка выравнивающая
  ties: CATALOG.ties,             // Винт стяжной (Тайрот)
  braces: CATALOG.braces,         // Подкос винтовой
  accessories: CATALOG.accessories,

  // Katalogdan nom bo'yicha topish (aniq nom bilan)
  item(name) {
    return CATALOG.accessories.find((a) => a.name === name) || null;
  },

  // ---- POL (perekrytiye) qolipi ----
  // DIQQAT: bu guruh yuklangan Excel katalogida YO'Q — u faqat devor va ustun
  // qolipini qamraydi. Nomlar va me'yorlar TZ-13 loyihasining haqiqiy
  // spetsifikatsiyasidan olingan (450 m² pol uchun).
  deck: {
    stoyka: [
      { id: 'ST3.2', name: 'Телескопическая стойка СТ3,2', range: [1.7, 2.5], weight: 10.79 },
      { id: 'ST3.7', name: 'Телескопическая стойка СТ3,7', range: [2.0, 3.5], weight: 13.17 },
      { id: 'ST4.2', name: 'Телескопическая стойка СТ4,2', range: [2.5, 4.2], weight: 14.57 },
      { id: 'ST4.6', name: 'Телескопическая стойка СТ4,6', range: [2.6, 4.6], weight: 15.86 },
      { id: 'ST5.1', name: 'Телескопическая стойка СТ5,1', range: [3.05, 5.1], weight: 17.26 }
    ],
    univilka: { name: 'Унивилка', weight: 1.4 },
    trenoga: { name: 'Тренога', weight: 4.45 },
    balka: { name: 'Двутавровая балка 3 м', weight: 5.2 },
    fanera: { name: 'Фанера ламинированная 2440*1220*18м', weight: 22.5 }
  },
  deckSource: 'TZ-13 spetsifikatsiyasi (Excel katalogida pol qolipi yo\'q)'
};

// Katalogdagi eng yaqin (kerakligidan kichik bo'lmagan) o'lchamni tanlash
export function pickByLength(list, needMm, field = 'len') {
  const ok = list.filter((i) => Number.isFinite(i[field]));
  if (!ok.length) return null;
  const fit = ok.filter((i) => i[field] >= needMm).sort((a, b) => a[field] - b[field]);
  return fit[0] || ok.sort((a, b) => b[field] - a[field])[0];
}

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
  // Zamok (Замок клиновой): qo'shni panellar chokida, bir chokda 2 dona.
  ZAMOK_PER_PANEL: 2,
  // Anker torsevoy: panel chetlarini mahkamlash.
  ANKER_PER_PANEL: 2,
  // Tyaga (tayrot): devor bo'ylab 0.9 m qadam, balandlik bo'yicha har 1.2 m da bir qator.
  TYAGA_STEP_M: 0.9,
  TYAGA_ROW_STEP_M: 1.2,
  // Har tyaganing ikki uchida bittadan cho'yan gayka.
  GAYKA_PER_TYAGA: 2,
  // Tekislovchi balka (Балка выравнивающая): har 1.2 m balandlikda devor bo'ylab, 2 yuza.
  BEAM_ROW_STEP_M: 1.2,
  // Push-pull tirgak (Подкос винтовой двухуровневый): devor bo'ylab 1.4 m qadam,
  // BITTA yuzada (tashqi tomondan qo'yiladi). TZ-13 loyihasidan: 72 m devorga 52 dona.
  BRACE_STEP_M: 1.4,
  // Montaj podmostlari kronshteyni: har 15 m devorga 1 dona (TZ-13: 72 m → 4 dona)
  KRONSHTEYN_STEP_M: 18,
  // Montaj zahvati: butun obyektga 2 dona (TZ-13)
  ZAHVAT_TOTAL: 2,

  // ---- POL (perekrytiye) qolipi — TZ-13 spetsifikatsiyasidan ----
  // Telefonlar: 450 m² pol uchun 660 stoyka, 660 univilka, 137 trenoga,
  // 274 dvutavr balka, 151.5 fanera varag'i (2440×1220).
  DECK_STOYKA_PER_M2: 660 / 450,      // ≈ 1.47 dona/m²
  DECK_UNIVILKA_PER_STOYKA: 1,
  DECK_TRENOGA_PER_STOYKA: 137 / 660, // ≈ har 4.8 stoykaga 1 uch oyoq
  DECK_BALKA_PER_M2: 274 / 450,       // ≈ 0.61 dona/m²
  DECK_FANERA_M2: 2.44 * 1.22,        // bitta varaq maydoni
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

// Panel og'irligi va maydoni — FAQAT katalogdagi o'lchamlar qabul qilinadi.
// Katalogda yo'q kombinatsiya uchun null qaytadi va u hisobga kirmaydi.
export function panelSpec(type, wMm, hMm) {
  const def = MINAR[type];
  if (!def?.byKey) return null;
  const item = def.byKey.get(wMm + 'x' + hMm);
  if (!item) return null;
  return {
    w: item.w, h: item.h,
    name: item.name,
    area: +((item.w * item.h) / 1e6).toFixed(3),
    weight: item.kg
  };
}

// Qavat balandligiga mos teleskopik stoyka modelini tanlash
export function pickStoyka(heightM) {
  const h = Number(heightM) || 3;
  const list = MINAR.deck.stoyka;
  return list.find((t) => h >= t.range[0] && h <= t.range[1]) || list[list.length - 1];
}
// Eski nom (moslik uchun)
export const pickTU = pickStoyka;

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
    // Shu balandlikda KATALOGDA MAVJUD bo'lgan enlar bilan yopiladi
    const allowed = def.widths.filter((w) => def.byKey.has(w + 'x' + hMm));
    if (!allowed.length) continue;
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

  // HAR QAVATNING O'Z DEVORLARI bo'lishi mumkin. IFC modelida bu odatiy
  // hol: AdvancedProject.ifc da podvalda 90, 1-qavatda 183 devor bor.
  // Bitta to'plamni hamma qavatga qo'llash - podvalning devorlari bilan
  // 1-qavatni hisoblash degani va xato ikki barobargacha yetadi.
  // Qavatda o'z devorlari bo'lmasa umumiy plandagilari ishlatiladi.
  const wallsOfFloor = (fl) => {
    if (!fl?.walls?.length) return extWalls;
    const own = exteriorWallsOf({ walls: fl.walls }).filter((w) => w.type === 'exterior');
    return own.length ? own : extWalls;
  };
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

  // Katalog pozitsiyasini og'irligi bo'yicha narxlash.
  // Faylda narx yo'q (faqat nom/o'lcham/og'irlik), shuning uchun standart narx
  // po'lat kg tarifidan chiqariladi; har qator UI'da qo'lda tahrirlanadi.
  const kgRateBuy = Number(R.minar_panel_kg ?? 18000);
  const kgRateRent = Number(R.qolip_panel_rent ?? MINAR_RENT.qolip_panel) * rentMonths;
  const priceOf = (kg) => (Number.isFinite(kg) && kg > 0
    ? Math.round(kg * (rent ? kgRateRent : kgRateBuy))
    : null);

  // Katalogdagi pozitsiyani qo'shish: nom, og'irlik va narx — hammasi katalogdan
  const addCat = (fl, baseKey, item, qty, note = '') => {
    if (!item || !(qty > 0)) return;
    // Katalogda og'irlik ko'rsatilmagan pozitsiya uchun narx chiqarib bo'lmaydi —
    // qator ko'rinadi, lekin narxni foydalanuvchi qo'lda kiritishi kerakligi yoziladi
    const tail = item.kg ? ` — ${item.kg} kg` : ' — og\'irligi katalogda yo\'q, narxni qo\'lda kiriting';
    add(fl, baseKey, `${item.name}${tail}${note}`, item.unit || 'dona', qty,
      { matKey: null, matRateOverride: priceOf(item.kg) });
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
    const fWalls = wallsOfFloor(fl);
    const agg = {};            // "w x h" -> dona (ikki yuza bilan)
    let extLenTotal = 0;       // tashqi devor uzunligi
    let maxThickness = 0.2;    // eng qalin tashqi devor (tyaga uzunligi uchun)
    let panelAreaM2 = 0;       // panel bilan yopilgan sof yuza (2 yuza)
    let skippedAreaM2 = 0;     // panelга kichik qolgan (proyom qutisi bilan yopiladi)

    for (const w of fWalls) {
      const L = wallLengthOf(w);
      if (L < 0.5) continue;
      extLenTotal += L;
      maxThickness = Math.max(maxThickness, Number(w.thickness) || 0.2);
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
      // Nom katalogdagidek: "КМО (Щит) 450х1500"
      add(fl, 'qolip_panel',
        `${spec.name} — ${spec.weight} kg/dona, ${color}`,
        'dona', cnt, { matKey: null, matRateOverride: Math.round(spec.weight * kgRate) });
    }

    // --- Aksessuarlar (FORMWORK_NORMS bo'yicha) ---
    const panels = Object.values(agg).reduce((s, x) => s + x, 0);
    const tyagaRows = Math.max(1, Math.round(H / N.TYAGA_ROW_STEP_M));
    const zamok = Math.ceil(panels * N.ZAMOK_PER_PANEL);
    const klin = Math.ceil(zamok * N.KLIN_PER_ZAMOK);
    const tyagaCnt = Math.ceil(extLenTotal / N.TYAGA_STEP_M) * tyagaRows;
    const gayka = tyagaCnt * N.GAYKA_PER_TYAGA;
    // Tekislovchi balka qatorlari soni (balandlik bo'yicha)
    const horizRows = Math.max(1, Math.round(H / N.BEAM_ROW_STEP_M));
    const braceCnt = Math.ceil(extLenTotal / N.BRACE_STEP_M); // faqat tashqi yuzada

    // Barcha pozitsiyalar KATALOGDAN — nom, o'lcham, og'irlik aynan fayldagidek.
    // Mahsulot tanlovi TZ-13 loyihasining haqiqiy spetsifikatsiyasiga mos:
    // Замок клиновой, Анкер торцевой, Винт стяжной 1м (Тайрот), Гайка D90,
    // Подкос винтовой двухуровневый, Кронштейн подмостей, Захват монтажный.
    const cat = (n) => MINAR.item(n);

    addCat(fl, 'qolip_zamok', cat('Замок клиновой'), zamok);
    addCat(fl, 'qolip_anker', cat('Анкер торцевой'), Math.ceil(panels * N.ANKER_PER_PANEL));

    // Tyaga (tayrot) — devor qalinligiga qarab katalogdan; TZ-13 da 1 m ishlatilgan
    const tie = pickByLength(
      MINAR.ties.filter((t) => t.family === 'tie'),
      Math.round((maxThickness + 0.4) * 1000)
    ) || pickByLength(MINAR.ties, Math.round((maxThickness + 0.4) * 1000));
    addCat(fl, 'qolip_tyaga', tie, tyagaCnt);
    addCat(fl, 'qolip_gayka', cat('Гайка D90'), gayka);

    // Push-pull qiyalik tayanch — ikki darajali, qavat balandligiga mos
    const brace = pickByLength(
      MINAR.braces.filter((b) => b.family === 'brace_2' && b.len),
      Math.round(H * 0.95 * 1000)
    );
    addCat(fl, 'qolip_brace', brace, braceCnt);

    // Montaj podmostlari va zahvat
    addCat(fl, 'qolip_kronshteyn', cat('Кронштейн подмостей, 1,10'),
      Math.ceil(extLenTotal / N.KRONSHTEYN_STEP_M));
    addCat(fl, 'qolip_zahvat', cat('Захват монтажный'), N.ZAHVAT_TOTAL);

    // --- Burchak elementlari: ЩУВ panellari (TZ-13 da shular ishlatilgan) ---
    const cornerCount = countCorners(fWalls);
    if (cornerCount > 0) {
      // Qavat balandligiga mos ЩУВ burchak paneli
      const hMm = Math.round(H * 1000);
      const shuv = MINAR.corners
        .filter((c) => c.family === 'щув' && c.h && Math.abs(c.h - hMm) <= 300 && c.kg)
        .sort((a, b) => (a.a + a.b) - (b.a + b.b))[0];
      if (shuv) addCat(fl, 'qolip_shuv', shuv, cornerCount * N.FACES);
    }

    // --- Ustun qolipi (ЩУР) — devor bog'lanish nuqtalarida ---
    const cols = columnJunctions(plan);
    if (cols.length) {
      const shur = pickByLength(MINAR.columns, Math.round(H * 1000), 'h');
      addCat(fl, 'qolip_ustun', shur, cols.length, ' — ustun qolipi');
    }

    // --- POL (perekrytiye) qolipi — TZ-13 spetsifikatsiyasi me'yorlari ---
    const deckArea = deckAreaOf(plan, fWalls);
    if (deckArea > 0) {
      const d = MINAR.deck;
      const st = pickStoyka(H);
      const stoykaCnt = Math.ceil(deckArea * N.DECK_STOYKA_PER_M2);
      addCat(fl, 'qolip_stoyka', { name: st.name, kg: st.weight, unit: 'шт' }, stoykaCnt);
      addCat(fl, 'qolip_univilka', { name: d.univilka.name, kg: d.univilka.weight, unit: 'шт' },
        Math.ceil(stoykaCnt * N.DECK_UNIVILKA_PER_STOYKA));
      addCat(fl, 'qolip_trenoga', { name: d.trenoga.name, kg: d.trenoga.weight, unit: 'шт' },
        Math.ceil(stoykaCnt * N.DECK_TRENOGA_PER_STOYKA));
      addCat(fl, 'qolip_balka_dv', { name: d.balka.name, kg: d.balka.weight, unit: 'шт' },
        Math.ceil(deckArea * N.DECK_BALKA_PER_M2));
      addCat(fl, 'qolip_fanera', { name: d.fanera.name, kg: d.fanera.weight, unit: 'шт' },
        Math.ceil(deckArea / N.DECK_FANERA_M2));
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

// Tashqi kontur burchaklari soni: ikki tashqi devor uchi tutashadigan nuqtalar
export function countCorners(extWalls) {
  const pts = [];
  for (const w of extWalls) for (const p of [w.a, w.b]) pts.push(p);
  let corners = 0;
  const seen = [];
  for (const p of pts) {
    if (seen.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.15)) continue;
    const touching = pts.filter((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.15).length;
    if (touching >= 2) { corners++; seen.push(p); }
  }
  return corners;
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
