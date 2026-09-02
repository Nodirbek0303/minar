import DxfParser from 'dxf-parser';

// ============================================================
//  DXF arxitektura chizmasini tahlil: masshtab, tozalash, devorlar,
//  qalinlik, eshik/derazalar, xonalar (ismi bilan), ustunlar.
//  Natija plan modeli + meta.analysis (tahlil hisoboti).
//
//  MASSHTAB: birlik avval DXF sarlavhasidagi $INSUNITS dan olinadi.
//  U bo'lmasa gabarit bo'yicha taxmin qilinadi va natijada
//  meta.analysis.units.source = 'auto' deb belgilanadi, ya'ni
//  foydalanuvchi birlikni qo'lda ko'rsatishi mumkin.
// ============================================================

// $INSUNITS kodlari → metrga ko'paytuvchi
const INSUNITS = {
  1: { f: 0.0254, id: 'in', name: 'dyuym' },
  2: { f: 0.3048, id: 'ft', name: 'fut' },
  4: { f: 0.001, id: 'mm', name: 'millimetr' },
  5: { f: 0.01, id: 'cm', name: 'santimetr' },
  6: { f: 1, id: 'm', name: 'metr' },
  14: { f: 0.1, id: 'dm', name: 'detsimetr' }
};
export const UNIT_FACTORS = { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, in: 0.0254, ft: 0.3048 };

function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function polyArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// MTEXT formatlash kodlarini tozalash: \pxq; \fArial|b0; {\H1.2x;...} v.b.
function cleanText(raw) {
  return String(raw || '')
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Chizma birligini aniqlash
function detectUnits(dxf, extent, forced) {
  if (forced && UNIT_FACTORS[forced]) {
    return { factor: UNIT_FACTORS[forced], id: forced, source: 'user', confidence: 'aniq' };
  }
  const code = Number(dxf?.header?.$INSUNITS);
  if (INSUNITS[code]) {
    const u = INSUNITS[code];
    return { factor: u.f, id: u.id, source: 'header', confidence: 'aniq' };
  }
  // Sarlavhada birlik yo'q — gabarit bo'yicha taxmin.
  // Arxitektura chizmasi metrda odatda 5..300, millimetrda 5000..300000 bo'ladi.
  if (extent >= 1000) return { factor: 0.001, id: 'mm', source: 'auto', confidence: 'taxminiy' };
  if (extent >= 300) return { factor: 0.01, id: 'cm', source: 'auto', confidence: 'taxminiy' };
  return { factor: 1, id: 'm', source: 'auto', confidence: 'taxminiy' };
}

export function analyzeDxf(text, opts = {}) {
  const parser = new DxfParser();
  let dxf;
  try {
    dxf = parser.parseSync(text);
  } catch (e) {
    throw new Error('DXF parse xatosi: ' + e.message + ' (Binary DXF bo‘lsa, ASCII DXF sifatida saqlab yuklang)');
  }
  const ents = dxf.entities || [];

  // --- 1. Chiziqlar, yopiq polilinealar va matnlarni yig'ish ---
  const segs = [];      // devor nomzodlari (LINE, ochiq polilineya)
  const polySegs = [];  // yopiq konturlar qirralari (xona/ustun) — eshik deteksiyasi uchun
  const closedPolys = [];
  const texts = [];
  for (const ent of ents) {
    if (ent.type === 'LINE') {
      const v = ent.vertices || [];
      if (v.length >= 2 && [v[0].x, v[0].y, v[1].x, v[1].y].every(Number.isFinite)) {
        segs.push({ a: [v[0].x, v[0].y], b: [v[1].x, v[1].y] });
      }
    } else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
      const vs = (ent.vertices || [])
        .map((v) => [v.x ?? v.position?.x, v.y ?? v.position?.y])
        .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      const closed = (ent.shape || ent.closed) && vs.length >= 3;
      if (closed) closedPolys.push(vs);
      // Yopiq kontur — bu xona chegarasi (yoki ustun), devor emas.
      // Uning qirralari devor chiziqlari bilan ustma-ust tushib, bitta devorni
      // bir nechta soxta devorga bo'lib yuboradi, shuning uchun devor
      // nomzodlariga qo'shilmaydi. Devorlar LINE va ochiq polilinealardan olinadi.
      if (!closed) {
        for (let i = 0; i < vs.length - 1; i++) segs.push({ a: vs[i], b: vs[i + 1] });
      } else {
        polySegs.push(...vs.slice(0, -1).map((v, i) => ({ a: v, b: vs[i + 1] })), { a: vs[vs.length - 1], b: vs[0] });
      }
    } else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
      // dxf-parser TEXT va MTEXT ni to'liq o'qiydi — qo'lda regex kerak emas
      const p = ent.startPoint || ent.position || {};
      const t = cleanText(ent.text);
      const h = Number(ent.textHeight ?? ent.height) || 0.2;
      if (t && Number.isFinite(p.x) && Number.isFinite(p.y)) texts.push({ x: p.x, y: p.y, h, text: t });
    }
  }
  if (!segs.length) throw new Error('DXF da chiziq (LINE/POLYLINE) topilmadi');

  // --- 2. Masshtab: $INSUNITS yoki gabarit bo'yicha ---
  const xs = [], ys = [];
  for (const s of [...segs, ...polySegs]) { xs.push(s.a[0], s.b[0]); ys.push(s.a[1], s.b[1]); }
  const rawExtX = Math.max(...xs) - Math.min(...xs), rawExtY = Math.max(...ys) - Math.min(...ys);
  const units = detectUnits(dxf, Math.max(rawExtX, rawExtY), opts.units);
  const scale = units.factor;
  const cx0 = (Math.max(...xs) + Math.min(...xs)) / 2 * scale;
  const cy0 = (Math.max(...ys) + Math.min(...ys)) / 2 * scale;
  const sizeM = { x: +(rawExtX * scale).toFixed(2), y: +(rawExtY * scale).toFixed(2) };

  for (const s of [...segs, ...polySegs]) {
    s.a = [+((s.a[0] * scale - cx0).toFixed(3)), +((s.a[1] * scale - cy0).toFixed(3))];
    s.b = [+((s.b[0] * scale - cx0).toFixed(3)), +((s.b[1] * scale - cy0).toFixed(3))];
  }
  for (const poly of closedPolys) for (const p of poly) { p[0] = p[0] * scale - cx0; p[1] = p[1] * scale - cy0; }
  for (const t of texts) { t.x = t.x * scale - cx0; t.y = t.y * scale - cy0; t.h = t.h * scale; }

  // --- 3. Tozalash: kalta chiziqlar va takrorlar ---
  const len = (s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
  const segKey = (s) => [s.a, s.b].map((p) => p.map((v) => Math.round(v * 100)).join(',')).sort().join('|');
  const seen = new Set();
  const clean = [];
  for (const s of segs) {
    if (len(s) < 0.25) continue;
    const k = segKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push(s);
  }

  // Chizmada devorga yaramaydigan gabarit — masshtab noto'g'ri bo'lishi mumkin
  if (!clean.length) {
    throw unitError(units, sizeM, 'Chizmada devor bo‘la oladigan chiziq topilmadi');
  }

  // --- 4. Devorlar: uzun chiziqlar, kollinear birlashtirish ---
  const wallsRaw = clean.filter((s) => len(s) >= 1.0);
  const merged = [];
  for (const s of wallsRaw) {
    const dirKey = Math.round(Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) / Math.PI * 2) % 2; // 0: gorizontal, 1: vertikal
    let done = false;
    for (const m of merged) {
      if (m.dirKey !== dirKey) continue;
      if (distToSeg(s.a, m.a, m.b) < 0.06 && distToSeg(s.b, m.a, m.b) < 0.06) {
        const pts = [m.a, m.b, s.a, s.b];
        const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
        const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
        if (dirKey === 0) { m.a = [minX, m.a[1]]; m.b = [maxX, m.b[1]]; }
        else { m.a = [m.a[0], minY]; m.b = [m.b[0], maxY]; }
        done = true;
        break;
      }
    }
    if (!done) merged.push({ a: [...s.a], b: [...s.b], dirKey });
  }

  // --- 4b. Parallel juft devorlar: markaz chiziqqa birlashtirish ---
  // Juftlik EN YAQIN mos chiziq bilan tanlanadi (birinchi uchragani bilan emas),
  // aks holda bitta devor bir necha siljigan markaz chiziqqa bo'linib qoladi.
  const used = new Set();
  const finalW = [];
  for (let i = 0; i < merged.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const w = merged[i];
    let pairJ = -1, pairD = Infinity;
    for (let j = i + 1; j < merged.length; j++) {
      if (used.has(j)) continue;
      const v = merged[j];
      if (v.dirKey !== w.dirKey) continue;
      const d = distToSeg(v.a, w.a, w.b);
      // juftlik: parallel, 8..60 sm oralig'ida va bo'ylama qoplanishi bor
      if (d > 0.08 && d < 0.6 && distToSeg(v.b, w.a, w.b) < 0.6 && d < pairD) { pairJ = j; pairD = d; }
    }
    if (pairJ >= 0) {
      used.add(pairJ);
      const v = merged[pairJ];
      finalW.push({
        a: [(w.a[0] + v.a[0]) / 2, (w.a[1] + v.a[1]) / 2],
        b: [(w.b[0] + v.b[0]) / 2, (w.b[1] + v.b[1]) / 2],
        thickness: +pairD.toFixed(2)
      });
    } else {
      finalW.push({ a: [...w.a], b: [...w.b], thickness: null });
    }
  }

  // --- 4c. Qolgan yaqin markaz chiziqlarni birlashtirish (O-5) ---
  const centered = [];
  for (const w of finalW) {
    const dir = Math.abs(w.b[0] - w.a[0]) >= Math.abs(w.b[1] - w.a[1]) ? 0 : 1;
    const near = centered.find((m) => {
      if (m.dir !== dir) return false;
      return distToSeg(w.a, m.a, m.b) < 0.12 && distToSeg(w.b, m.a, m.b) < 0.12;
    });
    if (near) {
      const pts = [near.a, near.b, w.a, w.b];
      const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
      const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
      if (dir === 0) { near.a = [minX, (near.a[1] + w.a[1]) / 2]; near.b = [maxX, (near.b[1] + w.b[1]) / 2]; }
      else { near.a = [(near.a[0] + w.a[0]) / 2, minY]; near.b = [(near.b[0] + w.b[0]) / 2, maxY]; }
      if (near.thickness == null) near.thickness = w.thickness;
      continue;
    }
    centered.push({ ...w, dir });
  }

  // --- 5. Standart qalinlik: juftlanmagan devorlar uchun median ---
  const thicknessSamples = centered.filter((w) => w.thickness != null).map((w) => w.thickness).sort((a, b) => a - b);
  const thickness = thicknessSamples.length
    ? Math.min(0.5, Math.max(0.12, thicknessSamples[Math.floor(thicknessSamples.length / 2)]))
    : 0.2;

  // --- 6. Tashqi/ichki belgilash (konturga yaqinlik) ---
  const allPts = centered.flatMap((w) => [w.a, w.b]);
  const minX = Math.min(...allPts.map((p) => p[0])), maxX = Math.max(...allPts.map((p) => p[0]));
  const minY = Math.min(...allPts.map((p) => p[1])), maxY = Math.max(...allPts.map((p) => p[1]));
  const walls = centered.map((w, i) => {
    const near = (p) => Math.min(Math.abs(p[0] - minX), Math.abs(p[0] - maxX), Math.abs(p[1] - minY), Math.abs(p[1] - maxY));
    const isExt = near(w.a) < 0.4 && near(w.b) < 0.4;
    return {
      id: 'dw' + i, a: w.a, b: w.b,
      thickness: +(w.thickness ?? thickness).toFixed(2), height: 3.0,
      type: isExt ? 'exterior' : 'interior'
    };
  });

  if (!walls.length) {
    throw unitError(units, sizeM, 'Chizmadan devor aniqlanmadi');
  }

  // --- 7. Eshik/deraza deteksi: devor ustidagi qisqa perpendikulyar kesmalar ---
  const shortSegs = [...clean, ...polySegs].filter((s) => len(s) < 1.0 && len(s) > 0.4);
  const openings = [];
  let oid = 0;
  for (const w of walls) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (L < 0.5) continue;
    const u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
    for (const s of shortSegs) {
      const mx = (s.a[0] + s.b[0]) / 2, my = (s.a[1] + s.b[1]) / 2;
      const t = (mx - w.a[0]) * u[0] + (my - w.a[1]) * u[1];
      if (t < 0.15 || t > L - 0.15) continue;
      const px = w.a[0] + t * u[0], py = w.a[1] + t * u[1];
      if (Math.hypot(mx - px, my - py) > 0.3) continue;
      const sd = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
      const sl = Math.hypot(sd[0], sd[1]);
      const dot = Math.abs((sd[0] / sl) * u[0] + (sd[1] / sl) * u[1]);
      if (dot < 0.6 && sl >= 0.6 && sl <= 1.4) {
        if (!openings.some((o) => o.wallId === w.id && Math.abs(o.offset - (t - sl / 2)) < 0.5)) {
          openings.push({ id: 'op' + oid++, wallId: w.id, type: 'door', offset: Math.max(0.1, t - sl / 2), width: sl, height: 2.1, sill: 0 });
        }
      }
    }
  }

  // --- 8. Xonalar: yopiq polilinealar; ismini ichidagi TEXT dan olish ---
  const rooms = [];
  let rid = 0;
  const usedNames = new Set();
  for (const poly of closedPolys) {
    const area = Math.abs(polyArea(poly));
    if (area < 2 || poly.length < 3) continue;
    let name = null, bestH = -1;
    for (const t of texts) {
      if (pointInPoly([t.x, t.y], poly) && t.h > bestH && t.text.length < 40) {
        bestH = t.h; name = t.text;
      }
    }
    if (!name) name = 'Xona ' + (++rid);
    while (usedNames.has(name)) name = name + ' ' + (++rid);
    usedNames.add(name);
    rooms.push({ id: 'r' + rooms.length, name, polygon: poly.map((p) => [+p[0].toFixed(3), +p[1].toFixed(3)]) });
  }
  if (!rooms.length) {
    rooms.push({ id: 'r1', name: 'Umumiy maydon', polygon: [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]] });
  }

  // --- 9. Ustunlar: kichik kvadrat yopiq polilinealar ---
  const columns = [];
  for (const poly of closedPolys) {
    const area = Math.abs(polyArea(poly));
    if (area < 0.08 || area > 0.6) continue;
    const px = poly.map((p) => p[0]), py = poly.map((p) => p[1]);
    const bw = Math.max(...px) - Math.min(...px), bh = Math.max(...py) - Math.min(...py);
    const aspect = Math.min(bw, bh) / Math.max(bw, bh);
    if (aspect > 0.4 && bw < 1.2 && bh < 1.2) {
      const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
      const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
      columns.push({ x: +cx.toFixed(3), y: +cy.toFixed(3), size: +Math.max(bw, bh).toFixed(2) });
    }
  }

  // --- 10. Loyiha nomi: eng katta balandlikdagi matn ---
  const nameText = texts.slice().sort((a, b) => b.h - a.h)[0];
  const metaName = nameText && nameText.text.length >= 4 && nameText.text.length <= 60 ? nameText.text : 'DXF loyiha';

  const analysis = {
    walls: walls.length,
    exterior: walls.filter((w) => w.type === 'exterior').length,
    interior: walls.filter((w) => w.type === 'interior').length,
    openings: openings.length,
    rooms: rooms.length,
    columns: columns.length,
    texts: texts.length,
    thickness: +thickness.toFixed(2),
    cleaned: segs.length - clean.length,
    units: { id: units.id, factor: units.factor, source: units.source, confidence: units.confidence },
    size: sizeM
  };

  return {
    meta: { name: metaName.slice(0, 50), source: 'dxf', units: 'm', level: '1-qavat', analysis },
    walls, openings, rooms,
    columns: columns.length ? columns : undefined
  };
}

// Masshtab sababli bo'sh chiqqan tahlil uchun tushunarli xato
function unitError(units, sizeM, what) {
  const e = new Error(
    `${what}. Chizma birligi "${units.id}" deb olindi (${units.source === 'header' ? 'DXF sarlavhasidan' : 'gabarit bo‘yicha taxminan'}), ` +
    `natijada bino o‘lchami ${sizeM.x}×${sizeM.y} m chiqdi. Agar bu noto‘g‘ri bo‘lsa, birlikni qo‘lda tanlang (mm / sm / m).`
  );
  e.code = 'DXF_UNITS';
  e.units = units.id;
  e.size = sizeM;
  return e;
}
