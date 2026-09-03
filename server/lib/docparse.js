// ============================================================
//  Hujjat matnidan qavatlar va o'lchamlarni EVRISTIK aniqlash.
//
//  AI kaliti bo'lmaganda ham (demo rejim) DOCX/PDF/XLSX matnidan
//  qavatlar soni, podval bor-yo'qligi va balandliklar o'qiladi.
//  AI ulangan bo'lsa — uning natijasi ustun, bu esa zaxira bo'ladi.
// ============================================================

const BASEMENT_RE = /(podval|yerto[‘'’]?la|yer\s*osti|подвал|цоколь|цокольн|basement)/i;

// "3 qavatli", "3 qavat", "3 этажа", "3 этажный"
const COUNT_RES = [
  /(\d{1,2})\s*[-–]?\s*qavatli/gi,
  /(\d{1,2})\s*[-–]?\s*qavat\b/gi,
  /(\d{1,2})\s*[-–]?\s*этаж/gi,
  /(\d{1,2})\s*[-–]?\s*floors?\b/gi
];

// Sondagi vergulni nuqtaga o'girish: "2,8" -> 2.8
const num = (s) => Number(String(s).replace(',', '.'));

// O'lchov birligi: metr. Kirill harfidan keyin \b ishlamaydi (\w faqat ASCII),
// shuning uchun "keyingi belgi harf emas" degan lookahead ishlatiladi.
const UNIT = '(?:metr|метр|meter|m|м)(?![a-zA-Zа-яА-ЯёЁ])';

// Balandlikni qabul qilinadigan oraliqqa siqish
const clampH = (v) => (Number.isFinite(v) && v >= 0.5 && v <= 6 ? +v.toFixed(2) : null);

// Matndan bitta qavatning balandligi: "1-qavat 3,0 m", "podval balandligi 2,8 m"
function heightNear(text, label) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // yorliqdan keyin 40 belgi ichida "3,0 m" ko'rinishidagi son
  const re = new RegExp(esc + '[^\\n]{0,40}?(\\d{1,2}[.,]\\d{1,2}|\\d{1,2})\\s*' + UNIT, 'i');
  const m = re.exec(text);
  return m ? clampH(num(m[1])) : null;
}

// Umumiy (tipik) qavat balandligi.
// Avval ANIQ ibora qidiriladi ("qavat balandligi", "высота этажа"), keyingina
// umumiy so'z ("balandligi", "высота"). Umumiy so'z podval haqidagi gapda
// uchrasa e'tiborga olinmaydi — aks holda podval balandligi butun binoga
// tipik balandlik sifatida yopishib qolardi.
function defaultHeight(text) {
  const specific = new RegExp('(?:qavat\\s*balandligi|высота\\s*этажа|floor\\s*height)[^\\n]{0,20}?(\\d{1,2}[.,]\\d{1,2}|\\d{1,2})\\s*' + UNIT, 'i');
  const sm = specific.exec(text);
  if (sm) return clampH(num(sm[1]));

  const generic = new RegExp('(?:balandligi|высота)[^\\n]{0,20}?(\\d{1,2}[.,]\\d{1,2}|\\d{1,2})\\s*' + UNIT, 'gi');
  for (const m of String(text).matchAll(generic)) {
    const before = String(text).slice(Math.max(0, m.index - 30), m.index);
    if (BASEMENT_RE.test(before)) continue; // podval balandligi — tipik emas
    return clampH(num(m[1]));
  }
  return null;
}

// Gabarit: "12,0 x 8,0 m"
export function parseSize(text) {
  const re = new RegExp('(\\d{1,3}[.,]?\\d{0,2})\\s*[x×хX*]\\s*(\\d{1,3}[.,]?\\d{0,2})\\s*' + UNIT, 'i');
  const m = re.exec(text || '');
  if (!m) return null;
  const x = num(m[1]), y = num(m[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0 || x > 500 || y > 500) return null;
  return { x, y };
}

// Hujjat matnidan qavatlar ro'yxatini tuzish.
// Qaytadi: [{name, height, underground}] yoki bo'sh massiv (aniqlanmasa).
export function parseFloorsFromText(text) {
  const t = String(text || '');
  if (!t.trim()) return [];

  const hasBasement = BASEMENT_RE.test(t);
  const baseH = defaultHeight(t) || 3.0;

  // Qavatlar soni — eng katta ishonchli qiymat (40 dan oshmaydi)
  let count = 0;
  for (const re of COUNT_RES) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 40) count = Math.max(count, n);
    }
  }

  // Matnda "1-qavat", "2-qavat" kabi alohida yorliqlar bo'lsa — ularni ham sanaymiz
  const labelled = new Set();
  for (const m of t.matchAll(/(\d{1,2})\s*[-–]\s*(?:qavat|этаж)/gi)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 40) labelled.add(n);
  }
  if (labelled.size) count = Math.max(count, Math.max(...labelled));

  if (!count && !hasBasement) return [];
  if (!count) count = 1; // faqat podval tilga olingan bo'lsa

  const floors = [];
  if (hasBasement) {
    const h = heightNear(t, 'podval') || heightNear(t, 'подвал') || heightNear(t, 'yerto') || baseH;
    floors.push({ name: 'Podval', height: h, underground: true });
  }
  for (let i = 1; i <= count; i++) {
    const h = heightNear(t, i + '-qavat') || heightNear(t, i + ' qavat') || heightNear(t, i + '-этаж') || baseH;
    floors.push({ name: i + '-qavat', height: h, underground: false });
  }
  return floors;
}

// Hujjatlardan olingan qisqa xulosa (foydalanuvchiga ko'rsatish uchun)
export function describeParsed(floors, size) {
  if (!floors.length && !size) return null;
  const parts = [];
  if (floors.length) {
    const und = floors.filter((f) => f.underground).length;
    parts.push(`hujjat matnidan ${floors.length} qavat aniqlandi` + (und ? ` (shundan ${und} ta yer osti)` : ''));
  }
  if (size) parts.push(`gabarit ${size.x}×${size.y} m`);
  return parts.join(', ');
}
