// ============================================================
//  Kiruvchi ma'lumot validatsiyasi.
//  Hisob dvigateli faqat tekshirilgan plan bilan ishlaydi: koordinatalar
//  chekli, o'lchamlar mantiqiy chegarada. Bu NaN natijalarni va juda
//  katta chizma bilan xotirani portlatishning oldini oladi.
// ============================================================

export const LIMITS = {
  MAX_WALLS: 2000,
  MAX_OPENINGS: 4000,
  MAX_ROOMS: 500,
  MAX_POLY_POINTS: 500,
  MAX_COLUMNS: 2000,
  MAX_FLOORS: 40,
  MAX_COORD: 5000,      // m — markazdan maksimal masofa
  MAX_WALL_LEN: 500,    // m — bitta devor uzunligi
  MIN_THICKNESS: 0.05,
  MAX_THICKNESS: 2,
  MIN_FLOOR_H: 0.5,
  MAX_FLOOR_H: 6
};

export class ValidationError extends Error {
  constructor(msg) { super(msg); this.name = 'ValidationError'; this.status = 400; }
}

const num = (v) => (typeof v === 'number' ? v : Number(v));
const finite = (v) => Number.isFinite(num(v));

function pt(p, where) {
  if (!Array.isArray(p) || p.length < 2 || !finite(p[0]) || !finite(p[1])) {
    throw new ValidationError(`${where}: koordinata noto‘g‘ri (son bo‘lishi kerak)`);
  }
  const x = num(p[0]), y = num(p[1]);
  if (Math.abs(x) > LIMITS.MAX_COORD || Math.abs(y) > LIMITS.MAX_COORD) {
    throw new ValidationError(`${where}: koordinata chegaradan tashqarida (±${LIMITS.MAX_COORD} m). Chizma masshtabi noto‘g‘ri bo‘lishi mumkin.`);
  }
  return [x, y];
}

const clamp = (v, lo, hi, d) => {
  const n = num(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

const str = (v, max, d) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : d;
};

// Plan modelini tekshirish va tozalash (har doim yangi obyekt qaytaradi)
export function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') throw new ValidationError('Plan obyekt bo‘lishi kerak');

  const wallsIn = Array.isArray(plan.walls) ? plan.walls : [];
  if (wallsIn.length > LIMITS.MAX_WALLS) {
    throw new ValidationError(`Devorlar soni juda ko‘p (${wallsIn.length} > ${LIMITS.MAX_WALLS})`);
  }
  const walls = wallsIn.map((w, i) => {
    const a = pt(w?.a, `Devor #${i + 1} boshi`);
    const b = pt(w?.b, `Devor #${i + 1} oxiri`);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > LIMITS.MAX_WALL_LEN) {
      throw new ValidationError(`Devor #${i + 1} uzunligi ${L.toFixed(0)} m — chegaradan (${LIMITS.MAX_WALL_LEN} m) katta. Chizma masshtabini tekshiring.`);
    }
    return {
      id: str(w?.id, 40, 'w' + i),
      a, b,
      thickness: clamp(w?.thickness, LIMITS.MIN_THICKNESS, LIMITS.MAX_THICKNESS, 0.2),
      height: clamp(w?.height, LIMITS.MIN_FLOOR_H, LIMITS.MAX_FLOOR_H, 3),
      type: w?.type === 'exterior' ? 'exterior' : 'interior'
    };
  });
  const wallIds = new Set(walls.map((w) => w.id));

  const openingsIn = Array.isArray(plan.openings) ? plan.openings : [];
  if (openingsIn.length > LIMITS.MAX_OPENINGS) {
    throw new ValidationError(`Ochiqliklar soni juda ko‘p (${openingsIn.length} > ${LIMITS.MAX_OPENINGS})`);
  }
  const openings = openingsIn
    .filter((o) => o && wallIds.has(o.wallId))
    .map((o, i) => {
      const type = o.type === 'window' ? 'window' : 'door';
      return {
        id: str(o.id, 40, 'o' + i),
        wallId: o.wallId,
        type,
        offset: clamp(o.offset, 0, LIMITS.MAX_WALL_LEN, 0),
        width: clamp(o.width, 0.1, 20, 0.9),
        height: clamp(o.height, 0.1, LIMITS.MAX_FLOOR_H, type === 'window' ? 1.4 : 2.1),
        sill: type === 'window' ? clamp(o.sill, 0, LIMITS.MAX_FLOOR_H, 0.9) : 0
      };
    });

  const roomsIn = Array.isArray(plan.rooms) ? plan.rooms : [];
  if (roomsIn.length > LIMITS.MAX_ROOMS) {
    throw new ValidationError(`Xonalar soni juda ko‘p (${roomsIn.length} > ${LIMITS.MAX_ROOMS})`);
  }
  const rooms = roomsIn
    .filter((r) => r && Array.isArray(r.polygon) && r.polygon.length >= 3)
    .map((r, i) => ({
      id: str(r.id, 40, 'r' + i),
      name: str(r.name, 60, 'Xona ' + (i + 1)),
      polygon: r.polygon.slice(0, LIMITS.MAX_POLY_POINTS).map((p, j) => pt(p, `Xona "${r.name || i + 1}" nuqta #${j + 1}`))
    }));

  const columnsIn = Array.isArray(plan.columns) ? plan.columns.slice(0, LIMITS.MAX_COLUMNS) : [];
  const columns = columnsIn
    .filter((c) => c && finite(c.x) && finite(c.y))
    .map((c) => ({ x: num(c.x), y: num(c.y), size: clamp(c.size, 0.1, 3, 0.4) }));

  const floors = validateFloors(plan.floors);

  const meta = plan.meta && typeof plan.meta === 'object' ? plan.meta : {};
  const out = {
    meta: {
      name: str(meta.name, 60, 'Loyiha'),
      source: str(meta.source, 20, 'manual'),
      units: 'm',
      level: str(meta.level, 30, '1-qavat'),
      ...(meta.analysis && typeof meta.analysis === 'object' ? { analysis: meta.analysis } : {})
    },
    walls, openings, rooms
  };
  if (columns.length) out.columns = columns;
  if (floors) out.floors = floors;
  return out;
}

// Qavatlar ro'yxatini tekshirish va tozalash
export function validateFloors(floors) {
  if (!Array.isArray(floors) || !floors.length) return null;
  if (floors.length > LIMITS.MAX_FLOORS) {
    throw new ValidationError(`Qavatlar soni 1..${LIMITS.MAX_FLOORS} oralig‘ida bo‘lishi kerak`);
  }
  const seen = new Set();
  return floors.map((f, i) => {
    const fw = f?.formwork && typeof f.formwork === 'object' ? f.formwork : {};
    let id = str(f?.id, 40, '');
    if (!id || seen.has(id)) id = 'fl' + Date.now().toString(36) + i;
    seen.add(id);
    return {
      id,
      name: str(f?.name, 40, (i + 1) + '-qavat'),
      height: clamp(f?.height, LIMITS.MIN_FLOOR_H, LIMITS.MAX_FLOOR_H, 3),
      facade: f?.facade !== false,
      underground: !!f?.underground,
      formwork: {
        type: ['classic', 'ksho', 'msho'].includes(fw.type) ? fw.type : 'msho',
        color: ['RAL3020', 'RAL9005', 'RAL2004'].includes(fw.color) ? fw.color : 'RAL3020'
      }
    };
  });
}

// Narx jadvali: faqat son qiymatlar, mantiqiy chegarada
export function validateRates(rates) {
  if (!rates || typeof rates !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(rates)) {
    if (!/^[a-z0-9_]{2,40}$/.test(k)) continue;
    const n = num(v);
    if (Number.isFinite(n) && n >= 0 && n <= 1e12) out[k] = n;
  }
  return out;
}

// Qator bo'yicha narx overridelari
export function validatePriceOverrides(po) {
  if (!po || typeof po !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(po)) {
    if (typeof k !== 'string' || k.length > 80) continue;
    if (v === null || v === undefined || v === '') continue;
    const n = num(v);
    if (Number.isFinite(n) && n >= 0 && n <= 1e12) out[k] = n;
  }
  return out;
}

// Loyiha sozlamalari
export function validateOpts(opts) {
  if (!opts || typeof opts !== 'object') return {};
  const out = {};
  if (opts.wallMaterial !== undefined) {
    out.wallMaterial = opts.wallMaterial === 'gazobeton' ? 'gazobeton' : 'brick';
  }
  if (opts.rentMode !== undefined) out.rentMode = opts.rentMode === 'rent' ? 'rent' : 'buy';
  if (opts.rentMonths !== undefined) out.rentMonths = Math.round(clamp(opts.rentMonths, 1, 120, 1));
  return out;
}
