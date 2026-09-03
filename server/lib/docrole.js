// ============================================================
//  Hujjat ROLINI aniqlash — fayl nomi va ichidagi matn bo'yicha.
//
//  Loyiha komplektida odatda bir necha chizma va spetsifikatsiya bo'ladi:
//   · Спецификация           — tayyor miqdorlar ro'yxati (etalon)
//   · План крупнощитовой опалубки / Монолитная стена — DEVOR qolipi
//   · Опалубочный план перекрытий  — POL (perekrytiye) qolipi
//   · Опалубочный план ригелей     — RIGEL (balka) qolipi
//   · .dwg                   — AutoCAD binar chizmasi (DXF kerak)
//
//  Rol aniq bo'lsa, hujjat kerakli joyga qo'yiladi va noto'g'ri
//  hisobga qo'shilib ketmaydi.
// ============================================================

export const ROLES = {
  spec: {
    id: 'spec',
    title: 'Spetsifikatsiya',
    hint: 'Tayyor miqdorlar ro‘yxati — hisob shu bilan solishtiriladi (etalon)',
    icon: '📋'
  },
  wall: {
    id: 'wall',
    title: 'Devor qolipi rejasi',
    hint: 'Монолитная стена — крупнощитовая yoki мелкощитовая опалубка',
    icon: '🧱'
  },
  slab: {
    id: 'slab',
    title: 'Perekrytiye (pol) qolipi rejasi',
    hint: 'Телескопические стойки, двутавровые балки, фанера',
    icon: '▤'
  },
  beam: {
    id: 'beam',
    title: 'Rigel (balka) qolipi rejasi',
    hint: 'Ригель — balka qolipi',
    icon: '━'
  },
  column: {
    id: 'column',
    title: 'Ustun qolipi rejasi',
    hint: 'Колонна — ЩУР ustun qolipi',
    icon: '▮'
  },
  plan: {
    id: 'plan',
    title: 'Arxitektura rejasi',
    hint: 'Qavat rejasi — devor, eshik, deraza geometriyasi',
    icon: '📐'
  },
  cad: {
    id: 'cad',
    title: 'AutoCAD chizmasi (DWG)',
    hint: 'Binar DWG o‘qilmaydi — AutoCAD da "Save As → DXF" qilib yuklang',
    icon: '⚠'
  },
  unknown: { id: 'unknown', title: 'Aniqlanmadi', hint: '', icon: '📎' }
};

// Kalit so'zlar — ruscha va o'zbekcha, kichik harfda solishtiriladi
const RULES = [
  { role: 'spec', re: /(спецификац|specificat|ведомост|smeta|спец\.)/i, weight: 10 },
  { role: 'slab', re: /(перекрыт|перекрита|plita|перекрі)/i, weight: 9 },
  { role: 'beam', re: /(ригел|ригель|rigel|балк[аи]\s*ригел)/i, weight: 9 },
  { role: 'column', re: /(колонн|ustun\s*qolip|щур)/i, weight: 7 },
  { role: 'wall', re: /(монолитн\w*\s*стен|стеновая опалубк|опалубка стен|devor\s*qolip)/i, weight: 9 },
  { role: 'wall', re: /(крупнощитов|мелкощитов)/i, weight: 6 },
  { role: 'plan', re: /(план\s*этаж|поэтажный план|архитектурн|qavat\s*reja)/i, weight: 6 },
  { role: 'wall', re: /(опалубочный план|опалубк)/i, weight: 3 }
];

// Spetsifikatsiya ichidagi belgilar (matn bo'yicha)
const SPEC_CONTENT = /(наименование[\s\S]{0,80}кол-?во|кол-?во[\s\S]{0,40}ед\.?\s*изм)/i;

export function detectRole(fileName, text = '', kind = '') {
  const name = String(fileName || '');
  const body = String(text || '').slice(0, 20000);
  const hay = name + '\n' + body;

  if (/\.dwg$/i.test(name)) {
    return { ...ROLES.cad, confidence: 'aniq', matched: 'DWG kengaytmasi' };
  }

  const scores = {};
  const matches = {};
  for (const r of RULES) {
    // Fayl nomidagi moslik ichidagidan ustunroq
    if (r.re.test(name)) { scores[r.role] = (scores[r.role] || 0) + r.weight * 2; matches[r.role] = 'nom'; }
    else if (r.re.test(body)) { scores[r.role] = (scores[r.role] || 0) + r.weight; matches[r.role] = matches[r.role] || 'matn'; }
  }
  // Jadval sarlavhasi bo'lsa — bu spetsifikatsiya
  if ((kind === 'xlsx' || kind === 'text') && SPEC_CONTENT.test(body)) {
    scores.spec = (scores.spec || 0) + 12;
    matches.spec = matches.spec || 'jadval sarlavhasi';
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!best) {
    // DXF/rasm — odatda arxitektura rejasi
    if (kind === 'dxf') return { ...ROLES.plan, confidence: 'taxminiy', matched: 'DXF chizma' };
    return { ...ROLES.unknown, confidence: 'past', matched: '' };
  }
  const [role, score] = best;
  return {
    ...ROLES[role],
    confidence: score >= 12 ? 'aniq' : score >= 6 ? "o'rta" : 'taxminiy',
    matched: matches[role] === 'nom' ? 'fayl nomi' : matches[role] || 'matn'
  };
}
