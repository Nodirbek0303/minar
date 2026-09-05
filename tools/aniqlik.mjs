#!/usr/bin/env node
// IFC o'quvchisining aniqligini o'lchash.
//
//   node tools/aniqlik.mjs <papka>
//
// Papkadagi har IFC model o'qiladi va natija modelning O'Z miqdorlari
// bilan solishtiriladi. AI ham, taxmin ham aralashmaydi - eng toza o'lchov.

import fs from 'fs';
import path from 'path';
import { readIfc, ifcToPlan } from '../server/lib/ifc.js';
import { compareToModel, describe } from '../server/lib/accuracy.js';

const dir = process.argv[2];
if (!dir) { console.error('Papka ko\'rsating'); process.exit(1); }

function walk(d, out = []) {
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.ifc$/i.test(name)) out.push(p);
  }
  return out;
}

const files = walk(dir);
let read = 0, failed = 0, comparable = 0, within5 = 0;
console.log(`\n${files.length} ta IFC fayl\n`);
for (const f of files.sort()) {
  const short = path.basename(f);
  try {
    const t0 = Date.now();
    const model = readIfc(fs.readFileSync(f, 'utf8'));
    const plan = ifcToPlan(model);
    const c = compareToModel(model);
    read++;
    if (c.comparable) { comparable += c.comparable; within5 += c.within5pct; }
    console.log(
      `  ${short.slice(0, 34).padEnd(36)} ${String(model.stats.total).padStart(5)} elem  ` +
      `${String(plan.walls.length).padStart(4)} devor  ${String(plan.openings.length).padStart(4)} proyom  ` +
      `${String(Date.now() - t0).padStart(5)}ms  ${c.comparable ? describe(c) : ''}`);
  } catch (e) {
    failed++;
    console.log(`  ${short.slice(0, 34).padEnd(36)} XATO: ${e.message}`);
  }
}
console.log(`\nXULOSA: ${read} o'qildi, ${failed} xato.`);
if (comparable) {
  console.log(`Model miqdorlari bilan solishtirildi: ${comparable} devor, ` +
              `${within5} tasi 5% aniqlik ichida (${Math.round(100 * within5 / comparable)}%).`);
}
