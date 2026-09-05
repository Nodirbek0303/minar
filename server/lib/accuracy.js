// ============================================================
//  Aniqlikni O'LCHASH.
//
//  "Yaxshi ishlayapti" degan gap raqam emas. Bu modul ikkita planni
//  yoki hisobni solishtirib, farqni FOIZDA aytadi — shunda yaxshilanish
//  ham, buzilish ham ko'rinadi.
//
//  Ikki xil o'lchov bor:
//
//  1. `compareToModel` — bizning o'qiganimiz IFC modelning O'Z
//     miqdorlari bilan solishtiriladi. Model muallifi yozgan
//     IfcQuantityArea etalon vazifasini bajaradi: AI ham, taxmin ham
//     aralashmaydi. Bu eng toza o'lchov.
//
//  2. `comparePlans` — ikkita plan (masalan AI o'qigani va haqiqiysi)
//     solishtiriladi: devor soni, umumiy uzunlik, mos kelgan devorlar.
//
//  Ikkalasi ham FARQNI ko'rsatadi, "o'tdi/o'tmadi" demaydi: chegara
//  qayerda ekanini odam hal qiladi.
// ============================================================

const pct = (a, b) => (b === 0 ? (a === 0 ? 0 : 100) : +(100 * (a - b) / b).toFixed(1));

/**
 * O'qilgan modelni uning O'Z miqdorlari bilan solishtiradi.
 * Devor yuzasi uchun IFC dagi `IfcQuantityArea` etalon.
 */
export function compareToModel(model) {
  const rows = [];
  for (const el of model.elements) {
    if (el.kind !== 'wall' || !el.areaM2) continue;
    // Bizning hisobimiz: uzunlik x balandlik (bitta yuza)
    if (!el.lengthM || !el.heightM) continue;
    const ours = el.lengthM * el.heightM;
    rows.push({ id: el.id, name: el.name, model: el.areaM2, ours: +ours.toFixed(3),
                diffPct: pct(ours, el.areaM2), source: el.source });
  }
  if (!rows.length) {
    return { comparable: 0, note: 'Modelda yuza miqdorlari yo\'q — solishtirib bo\'lmaydi' };
  }
  // Ba'zi eksportlar NetSideArea ga devorning IKKALA yuzasini yozadi
  // (LargeBuilding va TallBuilding shunday), ba'zilari bittasini
  // (AdvancedProject). Buni jimgina ikkiga bo'lish XATO bo'lardi -
  // o'lchov konvensiyani aniqlab, uni AYTISHI kerak.
  const ratios = rows.map((r) => r.model / r.ours).sort((a, b) => a - b);
  const medianRatio = ratios[Math.floor(ratios.length / 2)];
  const bothFaces = medianRatio > 1.8 && medianRatio < 2.2;
  if (bothFaces) {
    for (const r of rows) {
      r.model = +(r.model / 2).toFixed(3);
      r.diffPct = pct(r.ours, r.model);
    }
  }

  const diffs = rows.map((r) => Math.abs(r.diffPct)).sort((a, b) => a - b);
  const within = (limit) => rows.filter((r) => Math.abs(r.diffPct) <= limit).length;
  return {
    comparable: rows.length,
    // Model devorning ikkala yuzasini yozganmi
    bothFacesInModel: bothFaces,
    medianDiffPct: diffs[Math.floor(diffs.length / 2)],
    within2pct: within(2),
    within5pct: within(5),
    within10pct: within(10),
    worst: rows.slice().sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct)).slice(0, 5),
    totalModel: +rows.reduce((s, r) => s + r.model, 0).toFixed(2),
    totalOurs: +rows.reduce((s, r) => s + r.ours, 0).toFixed(2)
  };
}

/** Devor uzunligi. */
const lenOf = (w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);

/**
 * Ikkita planni solishtiradi. `truth` — haqiqiy, `got` — o'qilgani.
 * Devorlar joyi va uzunligi bo'yicha juftlanadi.
 */
// Ikkita plan har xil koordinata boshida bo'lishi mumkin: IFC modeli
// bino qayerda turganini saqlaydi, AI esa rasmdan o'qib markazni (0,0)
// deb oladi. Solishtirishdan oldin ikkalasi ham markazlashtiriladi -
// aks holda to'g'ri o'qilgan plan ham 0% ko'rsatadi.
function centred(walls) {
  if (!walls.length) return walls;
  const xs = walls.flatMap((w) => [w.a[0], w.b[0]]);
  const ys = walls.flatMap((w) => [w.a[1], w.b[1]]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return walls.map((w) => ({
    ...w, a: [w.a[0] - cx, w.a[1] - cy], b: [w.b[0] - cx, w.b[1] - cy]
  }));
}

export function comparePlans(truth, got, { tol = 1.0, centre = true } = {}) {
  const T = centre ? centred(truth?.walls || []) : (truth?.walls || []);
  const G = centre ? centred(got?.walls || []) : (got?.walls || []);
  const used = new Set();
  let matched = 0, lenError = 0;
  for (const t of T) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < G.length; i++) {
      if (used.has(i)) continue;
      const g = G[i];
      // Ikki uchi ham yaqin bo'lsa - o'sha devor (yo'nalish teskari
      // bo'lishi mumkin, shuning uchun ikkala tartib tekshiriladi)
      const d1 = Math.hypot(g.a[0] - t.a[0], g.a[1] - t.a[1])
               + Math.hypot(g.b[0] - t.b[0], g.b[1] - t.b[1]);
      const d2 = Math.hypot(g.a[0] - t.b[0], g.a[1] - t.b[1])
               + Math.hypot(g.b[0] - t.a[0], g.b[1] - t.a[1]);
      const d = Math.min(d1, d2);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0 && bestD <= tol * 2) {
      used.add(best);
      matched++;
      lenError += Math.abs(lenOf(G[best]) - lenOf(t));
    }
  }
  const totalT = T.reduce((s, w) => s + lenOf(w), 0);
  const totalG = G.reduce((s, w) => s + lenOf(w), 0);
  return {
    truthWalls: T.length,
    gotWalls: G.length,
    matched,
    missed: T.length - matched,
    extra: G.length - matched,
    recallPct: T.length ? +(100 * matched / T.length).toFixed(1) : 0,
    precisionPct: G.length ? +(100 * matched / G.length).toFixed(1) : 0,
    totalLengthTruth: +totalT.toFixed(2),
    totalLengthGot: +totalG.toFixed(2),
    lengthDiffPct: pct(totalG, totalT),
    meanLengthErrorM: matched ? +(lenError / matched).toFixed(3) : null
  };
}

/** Qisqa, o'qiladigan xulosa. */
export function describe(cmp) {
  if (cmp.comparable !== undefined) {
    if (!cmp.comparable) return cmp.note;
    return `${cmp.comparable} devor solishtirildi: median farq `
         + `${cmp.medianDiffPct}%, 5% ichida ${cmp.within5pct} ta `
         + `(${Math.round(100 * cmp.within5pct / cmp.comparable)}%)`
         + (cmp.bothFacesInModel ? ' [model ikkala yuzani yozgan]' : '');
  }
  return `${cmp.matched}/${cmp.truthWalls} devor topildi `
       + `(to'liqlik ${cmp.recallPct}%, aniqlik ${cmp.precisionPct}%), `
       + `umumiy uzunlik farqi ${cmp.lengthDiffPct}%`;
}
