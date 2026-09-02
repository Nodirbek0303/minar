// ============================================================
//  AI moduli — OpenAI-mos API (OpenAI / Z.ai / Anthropic-proxy)
//  .env: AI_API_KEY, AI_BASE_URL (default https://api.openai.com/v1), AI_MODEL (default gpt-4o-mini)
//  Kalit bo'lmasa — demo rejim (evristik tahlil + namuna plan).
// ============================================================

export function aiConfig() {
  return {
    key: process.env.AI_API_KEY || '',
    baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.AI_MODEL || 'gpt-4o-mini'
  };
}
export const aiEnabled = () => !!aiConfig().key;

async function chat(messages, { json = false, imageBase64 = null } = {}) {
  const { key, baseUrl, model } = aiConfig();
  const content = imageBase64
    ? [{ type: 'text', text: messages[messages.length - 1].content },
       { type: 'image_url', image_url: { url: imageBase64 } }]
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
