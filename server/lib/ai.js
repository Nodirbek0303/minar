import * as claude from './anthropic.js';
import { DEFAULT_MODEL as ANTHROPIC_DEFAULT_MODEL } from './anthropic.js';
// ============================================================
//  AI moduli — OpenAI-mos API (OpenAI / Z.ai / Anthropic-proxy)
//  .env: AI_API_KEY, AI_BASE_URL (default https://api.openai.com/v1), AI_MODEL (default gpt-4o-mini)
//  Kalit bo'lmasa — demo rejim (evristik tahlil + namuna plan).
// ============================================================

// Provayder kalitning ko'rinishidan aniqlanadi (yoki AI_PROVIDER bilan majburlanadi):
//  · sk-ant-... → Anthropic (Claude), rasmiy SDK orqali
//  · boshqasi   → OpenAI-mos API (/chat/completions)
const OPENAI_DEFAULT_URL = 'https://api.openai.com/v1';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1';

export function pickBaseUrl(configured, provider) {
  const url = (configured || '').replace(/\/$/, '');
  const wantsAnthropic = provider === 'anthropic';
  const looksOpenai = /api\.openai\.com/i.test(url);
  const looksAnthropic = /api\.anthropic\.com/i.test(url);
  if (!url) return wantsAnthropic ? ANTHROPIC_URL : OPENAI_DEFAULT_URL;
  if (wantsAnthropic && looksOpenai) return ANTHROPIC_URL;
  if (!wantsAnthropic && looksAnthropic) return OPENAI_DEFAULT_URL;
  return url;
}

/** Sozlama o'zaro ziddiyatli bo'lsa — sababi bilan qaytaradi. */
export function aiMisconfig() {
  const key = process.env.AI_API_KEY || '';
  if (!key) return null;
  const url = (process.env.AI_BASE_URL || '').replace(/\/$/, '');
  if (key.startsWith('sk-ant-') && /api\.openai\.com/i.test(url)) {
    return 'AI_API_KEY Anthropic kaliti, AI_BASE_URL esa OpenAI manzili — '
         + 'manzil Anthropic ga o\'zgartirildi';
  }
  if (!key.startsWith('sk-ant-') && /api\.anthropic\.com/i.test(url)) {
    return 'AI_API_KEY OpenAI kaliti, AI_BASE_URL esa Anthropic manzili — '
         + 'manzil OpenAI ga o\'zgartirildi';
  }
  return null;
}

export function aiConfig() {
  const key = process.env.AI_API_KEY || '';
  const forced = (process.env.AI_PROVIDER || '').toLowerCase();
  const provider = forced === 'anthropic' || forced === 'openai'
    ? forced
    : (key.startsWith('sk-ant-') ? 'anthropic' : 'openai');
  return {
    key,
    provider,
    // Manzil provayderga MOS bo'lishi shart. Serverda Anthropic kaliti
    // (sk-ant-...) OpenAI manziliga yuborilib turgan edi va har chaqiruv
    // 401 qaytarardi - dastur esa «AI: ulangan» deb ko'rsatardi.
    // Agar sozlamadagi manzil provayderga to'g'ri kelmasa, e'tiborsiz
    // qoldiriladi: noto'g'ri sozlama jim ishlamay turgandan ko'ra
    // to'g'rilangani yaxshi.
    baseUrl: pickBaseUrl(process.env.AI_BASE_URL, provider),
    model: process.env.AI_MODEL || (provider === 'anthropic' ? ANTHROPIC_DEFAULT_MODEL : 'gpt-4o-mini')
  };
}
export const aiEnabled = () => !!aiConfig().key;
export const aiProvider = () => aiConfig().provider;
// Anthropic PDF ni rasmga o'girmasdan, hujjat sifatida to'g'ridan-to'g'ri o'qiydi
export const supportsNativePdf = () => aiEnabled() && aiConfig().provider === 'anthropic';

// `data:image/png;base64,...` -> Anthropic SDK kutadigan ko'rinish
function dataUrlToSource(url) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(url);
  if (m) return { type: 'base64', media_type: m[1], data: m[2] };
  return { type: 'base64', media_type: 'image/png', data: url };
}

async function chat(messages, { json = false, imageBase64 = null, images = null } = {}) {
  const { key, baseUrl, model, provider } = aiConfig();
  const imgs = images?.length ? images : (imageBase64 ? [imageBase64] : []);

  // Anthropic kaliti bilan OpenAI ning /chat/completions ga borish
  // mumkin emas. Ilgari shunday bo'lardi va rasm tahlili UMUMAN
  // ishlamasdi - xato esa faqat foydalanuvchiga chiqardi.
  if (provider === 'anthropic') {
    const { chat: anthropicChat } = await import('./anthropic.js');
    const text = messages[messages.length - 1].content;
    const content = imgs.length
      ? [...imgs.map((url) => ({
           type: 'image',
           source: dataUrlToSource(url)
         })), { type: 'text', text }]
      : text;
    return anthropicChat(key, model, {
      system: json ? 'Faqat JSON qaytar, boshqa matn yozma.' : undefined,
      messages: [{ role: 'user', content }]
    });
  }
  const content = imgs.length
    ? [{ type: 'text', text: messages[messages.length - 1].content },
       ...imgs.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } }))]
    : messages[messages.length - 1].content;
  const body = {
    model,
    messages: [...messages.slice(0, -1), { role: 'user', content }],
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    max_tokens: json ? 12000 : 3000 // reja JSON'i uzun bo'ladi — kesilib qolmasin
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120000);
  let res;
  try {
    res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
      signal: ac.signal
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError'
      ? 'AI javob bermadi (2 daqiqa kutildi). Keyinroq urinib ko‘ring.'
      : 'AI serveriga ulanib bo‘lmadi: ' + e.message);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error('AI API xato: ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  const choice = data.choices?.[0];
  if (json && choice?.finish_reason === 'length') {
    throw new Error('AI javobi kesilib qoldi — chizmani soddaroq (kamroq detalli) rasm bilan qayta yuklang.');
  }
  return choice?.message?.content || '';
}

// Rasm chizmadan plan modeli chiqarish (AI kaliti kerak)
export async function analyzeImage(imageBase64) {
  if (!aiEnabled()) {
    throw new Error(
      "Rasm chizmani AI orqali o'qish uchun AI kaliti kerak: .env faylga AI_API_KEY yozing va serverni qayta ishga tushiring. " +
      "Kalitsiz ham DXF chizmalarni to'liq tahlil qilish mumkin (tayyor arxitektura chizmalari odatda DXF bo'ladi)."
    );
  }
  const prompt = `Siz arxitektura mutaxassisisiz. Bu qo'lda chizilgan yoki kompyuterda chizilgan qavat rejasi (floor plan).
Rejadagi devorlar, eshiklar, derazalar va xonalarni aniqlang va FAQAT quyidagi JSON formatini qaytaring:
{"walls":[{"a":[x1,y1],"b":[x2,y2],"thickness":0.2,"type":"exterior|interior"}],
"openings":[{"wallId":"w0","type":"door|window","offset":1.0,"width":0.9,"height":2.1,"sill":0.9}],
"rooms":[{"name":"Yotoqxona","polygon":[[x,y],...]}]}
Koordinatalar METRLarda, plan markazi (0,0) atrofida. Bino kengligini eng katta o'lcham deb oling.
wallId = walls massividagi indeks "w"+i. Faqat JSON, boshqa matn yo'q.`;
  const out = await chat([{ role: 'user', content: prompt }], { imageBase64, json: true });
  let obj;
  try {
    obj = JSON.parse(out.replace(/```json|```/g, '').trim());
  } catch {
    throw new Error('AI javobini o‘qib bo‘lmadi (JSON emas). Chizmani aniqroq suratga olib qayta yuklang.');
  }
  if (!Array.isArray(obj?.walls) || !obj.walls.length) {
    throw new Error('AI rasmda devor topa olmadi. Chizma aniqroq va to‘liq ko‘ringan surat yuklang.');
  }
  const walls = obj.walls.map((w, i) => ({
    id: 'w' + i,
    a: w.a, b: w.b,
    thickness: w.thickness || 0.2,
    height: 3.0,
    type: w.type || 'interior'
  }));
  // Devor id'lari bo'yicha qidirish — massivni "w0" satri bilan indekslash mumkin emas
  const wallById = new Map(walls.map((w) => [w.id, w]));
  const openings = (obj.openings || []).map((o, i) => ({
    id: 'o' + i,
    wallId: wallById.has(o.wallId) ? o.wallId : null,
    type: o.type === 'window' ? 'window' : 'door',
    offset: o.offset || 0.5,
    width: o.width || 0.9,
    height: o.type === 'window' ? (o.height || 1.4) : (o.height || 2.1),
    sill: o.type === 'window' ? (o.sill ?? 0.9) : 0
  })).filter((o) => o.wallId);
  const rooms = (obj.rooms || []).map((r, i) => ({ id: 'r' + i, name: r.name || 'Xona ' + (i + 1), polygon: r.polygon }));
  return {
    plan: { meta: { name: 'AI tahlil (rasm)', source: 'image-ai', units: 'm', level: '1-qavat' }, walls, openings, rooms },
    demo: false
  };
}

// ============================================================
//  Ko'p hujjatli tahlil: chizma rasmlari (PDF sahifalari ham), va
//  hujjat matnlari (PDF/DOCX/XLSX) — hammasi BIR SO'ROVDA yuboriladi.
//  AI ularni birga o'qib, bitta reja modelini va qavatlar ro'yxatini qaytaradi.
// ============================================================
export async function analyzeDocuments({ images = [], documents = [], text = '', fileNames = [], dxfHint = null }) {
  if (!aiEnabled()) {
    throw new Error(
      "Hujjatlarni (PDF, rasm, DOCX) AI orqali o'qish uchun AI kaliti kerak: server .env fayliga " +
      "AI_API_KEY yozing va serverni qayta ishga tushiring. Kalitsiz ham DXF chizmalar to'liq tahlil qilinadi."
    );
  }
  if (!images.length && !documents.length && !text.trim()) {
    throw new Error("Tahlil qilish uchun o'qiladigan hujjat topilmadi");
  }

  const cfg = aiConfig();
  if (cfg.provider === 'anthropic') {
    const { result } = await claude.analyzeDocuments(cfg.key, cfg.model, {
      images, documents, text, fileNames, dxfHint
    });
    return normalizeAiPlan(result);
  }

  const parts = [];
  parts.push(`Siz tajribali arxitektor va qurilish smetachisisiz. Sizga bitta loyihaning bir necha hujjati berilgan:
${fileNames.map((n, i) => `  ${i + 1}. ${n}`).join('\n')}

Rasmlardagi qavat rejalarini (planlarni) va matndagi texnik ma'lumotlarni BIRGA o'qing.
Agar hujjatlar bir-birini to'ldirsa — hammasini hisobga oling. Qarama-qarshi bo'lsa, chizmadagi
o'lchamni ustun deb biling, matndan esa qavatlar soni va balandliklarni oling.`);

  if (dxfHint) {
    parts.push(`\nDXF chizmasidan aniq geometriya allaqachon olingan: ${dxfHint.walls} devor, gabarit ${dxfHint.size?.x}x${dxfHint.size?.y} m.
Shuning uchun devor koordinatalarini QAYTA chizmang — faqat qavatlar ro'yxati, loyiha nomi va izohni qaytaring.`);
  }

  if (text.trim()) {
    parts.push(`\nHUJJATLARDAN OLINGAN MATN:\n"""\n${text.slice(0, 24000)}\n"""`);
  }

  parts.push(`\nFAQAT quyidagi JSON ni qaytaring, boshqa matnsiz:
{
  "name": "loyiha nomi",
  "floors": [{"name":"Podval","height":2.8,"underground":true},{"name":"1-qavat","height":3.0,"underground":false}],
  "walls": [{"a":[x1,y1],"b":[x2,y2],"thickness":0.3,"type":"exterior"}],
  "openings": [{"wallId":"w0","type":"door","offset":1.0,"width":0.9,"height":2.1,"sill":0}],
  "rooms": [{"name":"Yotoqxona","polygon":[[x,y],[x,y],[x,y]]}],
  "summary": "hujjatlardan nima aniqlanganini 2-3 gapda o'zbekcha izohlang",
  "confidence": "yuqori|o'rta|past"
}

Qoidalar:
- Koordinatalar METRLARDA, plan markazi (0,0) atrofida.
- wallId — walls massividagi tartib raqami: "w0", "w1", ...
- Devor qalinligi: tashqi 0.3 m, ichki 0.15 m (chizmada boshqacha bo'lsa — o'shani oling).
- floors: hujjatda podval (yerto'la) tilga olinsa, uni birinchi qilib "underground": true bilan qo'shing.
- Qavat balandligi topilmasa 3.0 m deb oling.
- Faqat JSON. Izoh, markdown yoki tushuntirish yozmang.`);

  const out = await chat([{ role: 'user', content: parts.join('\n') }], { images, json: true });
  let obj;
  try {
    obj = JSON.parse(out.replace(/```json|```/g, '').trim());
  } catch {
    throw new Error("AI javobini o'qib bo'lmadi (JSON emas). Hujjatlarni aniqroq nusxada qayta yuklang.");
  }
  return normalizeAiPlan(obj);
}

// AI qaytargan xom JSON ni plan modeliga keltirish
function normalizeAiPlan(obj) {
  const walls = (Array.isArray(obj.walls) ? obj.walls : []).map((w, i) => ({
    id: 'w' + i,
    a: w.a, b: w.b,
    thickness: Number(w.thickness) || 0.2,
    height: 3.0,
    type: w.type === 'exterior' ? 'exterior' : 'interior'
  })).filter((w) => Array.isArray(w.a) && Array.isArray(w.b));

  const wallById = new Map(walls.map((w) => [w.id, w]));
  const openings = (Array.isArray(obj.openings) ? obj.openings : []).map((o, i) => ({
    id: 'o' + i,
    wallId: wallById.has(o.wallId) ? o.wallId : null,
    type: o.type === 'window' ? 'window' : 'door',
    offset: Number(o.offset) || 0.5,
    width: Number(o.width) || 0.9,
    height: Number(o.height) || (o.type === 'window' ? 1.4 : 2.1),
    sill: o.type === 'window' ? (Number(o.sill) ?? 0.9) : 0
  })).filter((o) => o.wallId);

  const rooms = (Array.isArray(obj.rooms) ? obj.rooms : [])
    .filter((r) => Array.isArray(r.polygon) && r.polygon.length >= 3)
    .map((r, i) => ({ id: 'r' + i, name: String(r.name || 'Xona ' + (i + 1)).slice(0, 60), polygon: r.polygon }));

  const floors = (Array.isArray(obj.floors) ? obj.floors : []).map((f, i) => ({
    name: String(f.name || (i + 1) + '-qavat').slice(0, 40),
    height: Math.min(6, Math.max(0.5, Number(f.height) || 3)),
    underground: !!f.underground
  }));

  return {
    name: String(obj.name || '').slice(0, 60),
    walls, openings, rooms, floors,
    summary: String(obj.summary || '').slice(0, 800),
    confidence: ["yuqori", "o'rta", 'past'].includes(obj.confidence) ? obj.confidence : "o'rta"
  };
}

// Chat yordamchi — loyiha konteksti bilan
export async function chatAssistant(message, history = [], context = null) {
  const sys = `Siz "ArxAI" qurilish qolipi (apalka) hisob yordamchisisiz. O'zbek tilida, qisqa va aniq javob bering.
Ixtisosingiz — MINAR qolip tizimi: MSHO (mayda shtitli, 200-600 x 300-1500 mm, 26 kg/m2), KSHO (katta shtitli, 3.3 m gacha, 90 kg/m2),
universal zamok (240 mm, 50 kN), tyaga (tayrot) 150 kN, cho'yan gayka, klin 79x27, ikki shoxli tirgak, push-pull qiyalik tayanch,
vertikal/gorizontal trubalar, ustun qolipi (40x40) va TU teleskopik ustunlar (pol qolipi uchun).
Asosiy me'yorlar: qolip devorning IKKALA yuzasiga qo'yiladi; tyaga qadami 0.9 m va har 1.2 m balandlikda bir qator;
har tyagaga 2 gayka; vertikal truba qadami 1.2 m; push-pull tirgak qadami 2.4 m; TU — pol maydonining har 1.5 m2 ga 1 dona.
Qoliplar sotib olinishi ham, oylik arendaga olinishi ham mumkin — foydalanuvchi platformada rejimni tanlaydi.`;
  const msgs = [{ role: 'system', content: sys }];
  if (context) msgs.push({ role: 'system', content: 'Foydalanuvchi loyihasi ma\'lumotlari:\n' + context });
  for (const h of history.slice(-8)) msgs.push({ role: h.role, content: h.content });
  msgs.push({ role: 'user', content: message });
  if (!aiEnabled()) return demoAnswer(message, context);

  const cfg = aiConfig();
  if (cfg.provider === 'anthropic') {
    // Anthropic da system alohida maydon, messages ichida emas
    const sys = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const turns = msgs.filter((m) => m.role !== 'system');
    return claude.chat(cfg.key, cfg.model, { system: sys, messages: turns });
  }
  return chat(msgs);
}

function demoAnswer(message, context) {
  const m = String(message).toLowerCase();
  const tail = context
    ? `\n\n**Sizning loyihangiz:** ${context}`
    : '';
  if (m.includes('arenda') || m.includes('ijara'))
    return `**Arenda (ijara) hisobi** (demo rejim — AI kaliti yo'q, lekin qoidalar doimiy ishlaydi):

Platformada "Materiallar" bo'limidan **Arenda** rejimini yoqing va oylar sonini kiriting — barcha pozitsiyalar oylik tarif x oylar bo'yicha qayta hisoblanadi.

Taxminiy oylik tariflar: panel **4 000 so'm/kg**, universal zamok **8 000**, tyaga **2 500**, gayka **800**, klin **1 000**, truba **3 000 so'm/m**, TU **25 000**, ustun qolipi **60 000 so'm/m²**.${tail}`;
  if (m.includes('apalka') || m.includes('qolip') || m.includes('panel') || m.includes('msho') || m.includes('ksho'))
    return `**MINAR qolip hisobi** (demo rejim):

- Qolip devorning **ikkala yuzasiga** qo'yiladi — maydon = 2 x devor yuzasi, eshik/deraza o'rinlari chegiriladi
- **MSHO** — 200-600 x 300-1500 mm, 26 kg/m² (1500 balandlik uchun 500 va 600 eni katalogda yo'q)
- **KSHO** — 3.3 m gacha, 90 kg/m²
- Panellar devor uzunligiga **aniq** kombinatsiya bilan joylanadi (DP algoritmi)
- Har panelga ~2 zamok va shuncha klin; tyaga qadami **0.9 m**, har **1.2 m** balandlikda bir qator; har tyagaga **2 gayka**${tail}`;
  if (m.includes('tu') || m.includes('ustun') || m.includes('pol') || m.includes('perekr'))
    return `**TU teleskopik ustunlar** (demo rejim): pol (perekrytiye) qolipi uchun har **1.5 m²** ga **1 dona** ustun, har ustunga bitta **uch oyoq** va bitta **univilka**.

Qavat balandligiga qarab model tanlanadi: TU3,2 (1.7-2.0 m) ... TU5,1 (3.05-5.1 m). Devor burchaklari va T-qo'shilishlarida esa **ustun qolipi** (40x40 sm) hisoblanadi.${tail}`;
  if (m.includes('narx') || m.includes('xarajat') || m.includes('qancha') || m.includes('smeta'))
    return `Narxlarni "Materiallar" bo'limida o'zgartira olasiz — har bir qator uchun narxni qo'lda kiritish mumkin, jami summa avtomatik qayta hisoblanadi. **Sotib olish** va **arenda** rejimlari alohida.${tail}`;
  return `Men ArxAI yordamchisiman (hozircha **demo rejim** — .env faylga AI_API_KEY qo'ysangiz to'liq AI chat ishlaydi).

Savol bering: MSHO/KSHO panel hisobi, zamok/tyaga/klin sarfi, TU teleskopik ustunlar, arenda narxlari yoki montaj muddati haqida.${tail}`;
}
