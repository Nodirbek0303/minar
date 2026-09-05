#!/usr/bin/env node
// Plandan CHIZMA RASMI yasash — AI ni sinash uchun.
//
//   node tools/reja-rasm.mjs <chiqish papkasi>
//
// Nima uchun kerak: AI ning chizma o'qish aniqligini o'lchash uchun
// «to'g'ri javobi ma'lum» chizmalar kerak. Ochiq to'plamlar (CubiCasa5K)
// notijorat litsenziyada, ArxAI esa sotuv platformasi. Shuning uchun
// chizmalar O'ZIMIZDA yasaladi: IFC modelidan geometriya olinadi
// (to'g'ri javob), undan qurilish chizmasiga o'xshash rasm chiziladi.
//
// SVG chiqadi; rasmga o'girish brauzerda yoki `rsvg-convert` bilan.

import fs from 'fs';
import path from 'path';

const W = 1400, H = 1000, PAD = 70;

export function planToSvg(plan, { title = '' } = {}) {
  const walls = plan.walls || [];
  if (!walls.length) return null;
  const xs = walls.flatMap((w) => [w.a[0], w.b[0]]);
  const ys = walls.flatMap((w) => [w.a[1], w.b[1]]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const k = (Math.min(W, H) - 2 * PAD) / span;
  const X = (x) => PAD + (x - minX) * k;
  const Y = (y) => H - PAD - (y - minY) * k;

  const p = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
  p.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);

  // Devorlar - qurilish chizmasidagidek qalinligi bilan
  for (const w of walls) {
    const t = Math.max(2, (Number(w.thickness) || 0.3) * k);
    p.push(`<line x1="${X(w.a[0]).toFixed(1)}" y1="${Y(w.a[1]).toFixed(1)}" ` +
           `x2="${X(w.b[0]).toFixed(1)}" y2="${Y(w.b[1]).toFixed(1)}" ` +
           `stroke="#111" stroke-width="${t.toFixed(1)}" stroke-linecap="butt"/>`);
  }

  // Proyomlar - devor ustida oq uzilish (chizmada shunday ko'rsatiladi)
  for (const o of plan.openings || []) {
    const w = walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1];
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    const x0 = w.a[0] + ux * o.offset, y0 = w.a[1] + uy * o.offset;
    const x1 = x0 + ux * o.width, y1 = y0 + uy * o.width;
    const t = Math.max(2, (Number(w.thickness) || 0.3) * k);
    p.push(`<line x1="${X(x0).toFixed(1)}" y1="${Y(y0).toFixed(1)}" ` +
           `x2="${X(x1).toFixed(1)}" y2="${Y(y1).toFixed(1)}" ` +
           `stroke="#fff" stroke-width="${(t + 1).toFixed(1)}"/>`);
    // Eshik yoyi - chizmadagi odatiy belgi
    if (o.type === 'door') {
      p.push(`<path d="M ${X(x0).toFixed(1)} ${Y(y0).toFixed(1)} L ${X(x1).toFixed(1)} ${Y(y1).toFixed(1)}" ` +
             `stroke="#666" stroke-width="1" fill="none"/>`);
    }
  }

  // Masshtab chizig'i - AI birlikni shundan biladi
  const barM = span > 40 ? 10 : span > 15 ? 5 : 1;
  const bx = PAD, by = H - 28;
  p.push(`<line x1="${bx}" y1="${by}" x2="${bx + barM * k}" y2="${by}" stroke="#111" stroke-width="3"/>`);
  p.push(`<text x="${bx}" y="${by - 8}" font-family="sans-serif" font-size="18" fill="#111">0</text>`);
  p.push(`<text x="${bx + barM * k - 10}" y="${by - 8}" font-family="sans-serif" font-size="18" fill="#111">${barM} m</text>`);
  if (title) p.push(`<text x="${PAD}" y="40" font-family="sans-serif" font-size="24" fill="#111">${title}</text>`);
  p.push('</svg>');
  return p.join('\n');
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || 'test/fixtures/rejalar';
  const { readIfc, ifcToPlan } = await import('../server/lib/ifc.js');
  fs.mkdirSync(out, { recursive: true });
  const src = process.argv[3] || '/home/user/bim-data/bim-whale';
  const files = [];
  const walk = (d) => { for (const n of fs.readdirSync(d)) {
    const p2 = path.join(d, n);
    if (fs.statSync(p2).isDirectory()) walk(p2);
    else if (/\.ifc$/i.test(n)) files.push(p2);
  } };
  walk(src);
  let made = 0;
  for (const f of files) {
    try {
      const model = readIfc(fs.readFileSync(f, 'utf8'), { maxBytes: 100e6 });
      const plan = ifcToPlan(model, { name: path.basename(f, '.ifc') });
      if (plan.walls.length < 3) continue;
      const base = path.basename(f, '.ifc');
      const svg = planToSvg(plan, { title: base });
      if (!svg) continue;
      fs.writeFileSync(path.join(out, base + '.svg'), svg);
      // To'g'ri javob yonida saqlanadi
      fs.writeFileSync(path.join(out, base + '.plan.json'), JSON.stringify(plan, null, 1));
      made++;
      console.log(`  ${base}: ${plan.walls.length} devor, ${plan.openings.length} proyom`);
    } catch (e) { console.log(`  ${path.basename(f)}: ${e.message.slice(0, 60)}`); }
  }
  console.log(`\n${made} ta chizma va to'g'ri javob yozildi: ${out}`);
}
