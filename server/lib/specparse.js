// ============================================================
//  Tayyor SPETSIFIKATSIYANI o'qish (etalon).
//
//  Loyihachi bergan spetsifikatsiya — haqiqiy miqdorlar ro'yxati.
//  Uni o'qib olsak, platformaning hisobini shu bilan solishtirib,
//  farqni ko'rsatish mumkin: "hato bo'lmasin" degani shu.
//
//  Kutilgan ustunlar (nomlari har xil bo'lishi mumkin):
//    № | Наименование | Кол-во | Ед.изм.
//  Bo'lim sarlavhalari alohida qatorda keladi:
//    "План крупнощитовой опалубки", "Перекрытие", ...
// ============================================================

import { detectRole } from './docrole.js';

const NUM = (v) => {
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Bo'lim sarlavhasini tanish (raqamsiz, miqdorsiz uzunroq matn)
const SECTION_RE = /(опалубк|перекрыт|перекрита|ригел|стен|колонн|фундамент|лестниц)/i;
const HEADER_RE = /наименование/i;

// Matnli jadvaldan (xlsxText natijasi) pozitsiyalarni ajratib olish
export function parseSpecification(text, { fileName = '' } = {}) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sections = [];
  let cur = null;

  const pushSection = (title) => {
    cur = { title: title.trim(), items: [] };
    sections.push(cur);
  };

  for (const line of lines) {
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '');
    if (!cells.length) continue;

    // Jadval sarlavhasi — o'tkazib yuboriladi
    if (cells.some((c) => HEADER_RE.test(c))) continue;

    // Bo'lim sarlavhasi: bitta katak, raqam emas, mavzuga oid
    if (cells.length === 1 && NUM(cells[0]) === null) {
      if (SECTION_RE.test(cells[0]) || cells[0].length > 6) pushSection(cells[0]);
      continue;
    }

    // Pozitsiya: nom + miqdor topilishi kerak
    const nameIdx = cells.findIndex((c) => NUM(c) === null && c.length >= 3);
    if (nameIdx < 0) continue;
    const name = cells[nameIdx];
    // nomdan keyingi birinchi son — miqdor
    let qty = null, unit = '';
    for (let i = nameIdx + 1; i < cells.length; i++) {
      const n = NUM(cells[i]);
      if (qty === null && n !== null && n > 0) { qty = n; continue; }
      if (qty !== null && NUM(cells[i]) === null && !unit) { unit = cells[i]; break; }
    }
    if (qty === null) continue;

    if (!cur) pushSection('Spetsifikatsiya');
    cur.items.push({
      name,
      qty: +qty.toFixed(2),
      unit: unit || 'шт'
    });
  }

  const all = sections.flatMap((s) => s.items);
  return {
    fileName,
    sections: sections.filter((s) => s.items.length),
    total: all.length,
    // Har bo'limga rol beriladi: devor / perekrytiye / rigel ...
    roles: sections.filter((s) => s.items.length).map((s) => ({
      title: s.title,
      role: detectRole(s.title, s.title).id,
      count: s.items.length
    }))
  };
}

// Etalon bilan hisobni solishtirish.
// Nomlar bo'yicha moslashtiradi (katalog nomi = spetsifikatsiya nomi).
export function compareToSpec(spec, computedRows) {
  const norm = (s) => String(s || '')
    .toLowerCase()
    .replace(/—.*$/, '')          // "— 23.4 kg" qismini olib tashlash
    .replace(/\(.*?\)/g, ' ')     // qavs ichidagi izohlar
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const mine = new Map();
  for (const r of computedRows || []) {
    const k = norm(r.name);
    mine.set(k, (mine.get(k) || 0) + r.qty);
  }

  const rows = [];
  const usedKeys = new Set();
  for (const sec of spec.sections || []) {
    for (const it of sec.items) {
      const k = norm(it.name);
      const got = mine.has(k) ? mine.get(k) : null;
      usedKeys.add(k);
      const diff = got === null ? null : +(got - it.qty).toFixed(2);
      rows.push({
        section: sec.title,
        name: it.name,
        unit: it.unit,
        spec: it.qty,
        computed: got,
        diff,
        pct: got === null || !it.qty ? null : Math.round((got - it.qty) / it.qty * 100),
        status: got === null ? 'missing' : Math.abs(diff) < 0.5 ? 'match' : 'differs'
      });
    }
  }
  // Hisobda bor, lekin spetsifikatsiyada yo'q pozitsiyalar
  for (const r of computedRows || []) {
    const k = norm(r.name);
    if (usedKeys.has(k)) continue;
    usedKeys.add(k);
    rows.push({
      section: 'Hisobda qo‘shimcha',
      name: r.name, unit: r.unit,
      spec: null, computed: mine.get(k), diff: null, pct: null, status: 'extra'
    });
  }

  const stat = { match: 0, differs: 0, missing: 0, extra: 0 };
  for (const r of rows) stat[r.status]++;
  return { rows, stat };
}
