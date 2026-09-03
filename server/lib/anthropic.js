import Anthropic from '@anthropic-ai/sdk';

// ============================================================
//  Anthropic (Claude) provayderi — rasmiy SDK orqali.
//
//  OpenAI-mos API dan farqlari:
//   · rasm bloki: {type:'image', source:{type:'base64', media_type, data}}
//   · PDF ni RASMGA O'GIRISH SHART EMAS — hujjat sifatida to'g'ridan-to'g'ri
//     yuboriladi: {type:'document', source:{type:'base64',
//     media_type:'application/pdf', data}} — sahifalar, jadvallar va
//     o'lchamlar aniqroq o'qiladi
//   · natija sxemasi `strict` tool orqali kafolatlanadi — JSON hech qachon
//     buzuq kelmaydi
// ============================================================

export const DEFAULT_MODEL = 'claude-opus-5';

export function client(apiKey) {
  return new Anthropic({ apiKey });
}

// Reja modeli sxemasi. strict: true bo'lgani uchun har bir daraja
// additionalProperties:false va to'liq required ro'yxatiga ega bo'lishi shart.
// Nuqta: [x, y] — strict sxemada minItems/maxItems 0/1 dan boshqa qiymatni
// qabul qilmaydi, shuning uchun cheklov izohda ko'rsatiladi.
const point = { type: 'array', items: { type: 'number' }, description: 'Aynan ikki son: [x, y] metrda' };

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Loyiha nomi' },
    floors: {
      type: 'array',
      description: 'Qavatlar, pastdan yuqoriga. Podval bo\'lsa birinchi bo\'lib, underground: true bilan.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          height: { type: 'number', description: 'Qavat balandligi, metr' },
          underground: { type: 'boolean', description: 'Yer osti qavatimi (podval/tsokol)' }
        },
        required: ['name', 'height', 'underground'],
        additionalProperties: false
      }
    },
    walls: {
      type: 'array',
      description: 'Devorlar. Koordinatalar metrda, plan markazi (0,0) atrofida.',
      items: {
        type: 'object',
        properties: {
          a: point,
          b: point,
          thickness: { type: 'number', description: 'Devor qalinligi, metr' },
          type: { type: 'string', enum: ['exterior', 'interior'] }
        },
        required: ['a', 'b', 'thickness', 'type'],
        additionalProperties: false
      }
    },
    openings: {
      type: 'array',
      description: 'Eshik va derazalar. wallId — walls massividagi tartib raqami: "w0", "w1", ...',
      items: {
        type: 'object',
        properties: {
          wallId: { type: 'string' },
          type: { type: 'string', enum: ['door', 'window'] },
          offset: { type: 'number', description: 'Devor boshidan masofa, metr' },
          width: { type: 'number' },
          height: { type: 'number' },
          sill: { type: 'number', description: 'Deraza tagligi balandligi (eshik uchun 0)' }
        },
        required: ['wallId', 'type', 'offset', 'width', 'height', 'sill'],
        additionalProperties: false
      }
    },
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          polygon: { type: 'array', items: point }
        },
        required: ['name', 'polygon'],
        additionalProperties: false
      }
    },
    summary: { type: 'string', description: 'Hujjatlardan nima aniqlangani — 2-3 gap, o\'zbek tilida' },
    confidence: { type: 'string', enum: ['yuqori', 'o\'rta', 'past'] }
  },
  required: ['name', 'floors', 'walls', 'openings', 'rooms', 'summary', 'confidence'],
  additionalProperties: false
};

// data URI dan media_type va base64 ni ajratish
export function splitDataUri(uri) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(String(uri));
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

// Hujjatlarni tahlil qilish: rasmlar + PDF hujjatlar + matn
export async function analyzeDocuments(apiKey, model, { images = [], documents = [], text = '', fileNames = [], dxfHint = null }) {
  const anthropic = client(apiKey);
  const content = [];

  // PDF hujjatlar — Claude ularni sahifama-sahifa o'zi o'qiydi
  for (const doc of documents) {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: doc.mediaType || 'application/pdf', data: doc.data },
      ...(doc.name ? { title: doc.name.slice(0, 100) } : {})
    });
  }

  // Chizma rasmlari
  for (const img of images) {
    const parts = splitDataUri(img);
    if (!parts) continue;
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: parts.mediaType, data: parts.data }
    });
  }

  const lines = [
    'Siz tajribali arxitektor va qurilish smetachisisiz. Sizga bitta loyihaning bir necha hujjati berilgan:',
    ...fileNames.map((n, i) => `  ${i + 1}. ${n}`),
    '',
    'Chizmalardagi qavat rejalarini va hujjatlardagi texnik ma\'lumotlarni BIRGA o\'qing.',
    'Hujjatlar bir-birini to\'ldirsa — hammasini hisobga oling. Qarama-qarshi bo\'lsa,',
    'chizmadagi o\'lchamni ustun deb biling, matndan esa qavatlar soni va balandliklarni oling.'
  ];

  if (dxfHint) {
    lines.push(
      '',
      `DXF chizmasidan aniq geometriya allaqachon olingan: ${dxfHint.walls} devor, ` +
      `gabarit ${dxfHint.size?.x}×${dxfHint.size?.y} m.`,
      'Shuning uchun walls, openings va rooms ni BO\'SH massiv qilib qaytaring —',
      'faqat name, floors, summary va confidence ni to\'ldiring.'
    );
  }

  if (text.trim()) {
    lines.push('', 'HUJJATLARDAN OLINGAN MATN:', '"""', text.slice(0, 60000), '"""');
  }

  lines.push(
    '',
    'Natijani submit_plan vositasi orqali qaytaring.',
    'Koordinatalar METRLARDA, plan markazi (0,0) atrofida.',
    'Devor qalinligi: tashqi 0.3 m, ichki 0.15 m (chizmada boshqacha bo\'lsa — o\'shani oling).',
    'Podval (yerto\'la, tsokol) tilga olinsa, uni floors ro\'yxatida birinchi qilib underground: true bilan qo\'shing.',
    'Qavat balandligi topilmasa 3.0 m deb oling.'
  );

  content.push({ type: 'text', text: lines.join('\n') });

  // strict tool — natija sxemaga qat'iy mos keladi, JSON parse xatosi bo'lmaydi
  const stream = anthropic.messages.stream({
    model: model || DEFAULT_MODEL,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    tools: [{
      name: 'submit_plan',
      description: 'Hujjatlardan aniqlangan bino rejasi va qavatlar ro\'yxatini qaytaradi',
      strict: true,
      input_schema: PLAN_SCHEMA
    }],
    tool_choice: { type: 'tool', name: 'submit_plan' },
    messages: [{ role: 'user', content }]
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new Error('AI so‘rovni bajarishdan bosh tortdi' +
      (message.stop_details?.explanation ? ': ' + message.stop_details.explanation : ''));
  }
  const call = message.content.find((b) => b.type === 'tool_use' && b.name === 'submit_plan');
  if (!call) {
    const txt = message.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').slice(0, 200);
    throw new Error('AI reja qaytarmadi' + (txt ? ': ' + txt : ''));
  }
  return { result: call.input, usage: message.usage, model: message.model };
}

// Chat yordamchi
export async function chat(apiKey, model, { system, messages }) {
  const anthropic = client(apiKey);
  const message = await anthropic.messages.create({
    model: model || DEFAULT_MODEL,
    max_tokens: 4000,
    output_config: { effort: 'medium' },
    system,
    messages
  });
  if (message.stop_reason === 'refusal') {
    return 'Kechirasiz, bu savolga javob bera olmayman.';
  }
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}
