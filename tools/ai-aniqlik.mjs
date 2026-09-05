#!/usr/bin/env node
// AI ning chizma o'qish aniqligini O'LCHASH.
//
//   node tools/ai-aniqlik.mjs <papka>
//
// Papkada juftliklar bo'lishi kerak: `nom.png` (chizma) va
// `nom.plan.json` (to'g'ri javob). Ularni `tools/reja-rasm.mjs` yasaydi.
//
// Nima uchun shunday: ochiq qavat rejasi to'plamlari (CubiCasa5K)
// NOTIJORAT litsenziyada, ArxAI esa sotuv platformasi - ularni
// ishlatish litsenziyani buzadi. Shuning uchun chizmalar o'zimizda
// yasaladi: IFC modelidan geometriya olinadi (to'g'ri javob), undan
// chizma chiziladi. Litsenziya toza, to'g'ri javob esa aniq ma'lum.
//
// DIQQAT: har chaqiruv pul turadi. Fayl soni ataylab kichik.

import fs from 'fs';
import path from 'path';
import { analyzeImage, aiEnabled } from '../server/lib/ai.js';
import { comparePlans, describe } from '../server/lib/accuracy.js';
import { loadEnv } from '../server/lib/db.js';

loadEnv();
if (!aiEnabled()) {
  console.error('AI kaliti yo\'q (.env dagi AI_API_KEY). O\'lchash mumkin emas.');
  process.exit(1);
}

const dir = process.argv[2];
if (!dir) { console.error('Papka ko\'rsating'); process.exit(1); }

const pngs = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
console.log(`\n${pngs.length} ta chizma o'lchanadi. Har biri uchun AI chaqiriladi.\n`);

const rows = [];
for (const png of pngs.sort()) {
  const base = png.replace(/\.png$/, '');
  const truthFile = path.join(dir, base + '.plan.json');
  if (!fs.existsSync(truthFile)) continue;
  const truth = JSON.parse(fs.readFileSync(truthFile, 'utf8'));
  process.stdout.write(`  ${base.padEnd(20)} `);
  try {
    const t0 = Date.now();
    const buf = fs.readFileSync(path.join(dir, png));
    const got = await analyzeImage(buf.toString('base64'));
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const cmp = comparePlans(truth, { walls: got.walls || [] });
    rows.push({ base, cmp });
    console.log(`${secs}s  ${describe(cmp)}`);
  } catch (e) {
    console.log(`XATO: ${e.message.slice(0, 70)}`);
  }
}

if (rows.length) {
  const avg = (k) => (rows.reduce((s, r) => s + (r.cmp[k] || 0), 0) / rows.length).toFixed(1);
  console.log(`\nXULOSA (${rows.length} chizma):`);
  console.log(`  to'liqlik (topilgan devorlar ulushi): ${avg('recallPct')}%`);
  console.log(`  aniqlik (to'g'ri topilganlar ulushi): ${avg('precisionPct')}%`);
  console.log(`  umumiy uzunlik farqi: ${avg('lengthDiffPct')}%`);
}
