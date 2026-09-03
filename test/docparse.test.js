import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFloorsFromText, parseSize } from '../server/lib/docparse.js';
import { docxText, xlsxText, fileKind } from '../server/lib/extract.js';
import zlib from 'zlib';

test('o\'zbekcha matndan podval va qavatlar aniqlanadi', () => {
  const f = parseFloorsFromText(
    'Turar-joy binosi — 3 qavatli\nPodval balandligi 2,8 m; 1-qavat 3,0 m; 2-qavat 3,0 m\nGabarit: 12,0 x 8,0 m'
  );
  assert.equal(f.length, 4, 'podval + 3 qavat');
  assert.equal(f[0].name, 'Podval');
  assert.equal(f[0].underground, true);
  assert.equal(f[0].height, 2.8);
  assert.equal(f[1].name, '1-qavat');
  assert.equal(f[1].height, 3);
  assert.equal(f.filter((x) => x.underground).length, 1);
});

test('ruscha matndan ham aniqlanadi', () => {
  const f = parseFloorsFromText('Жилой дом, 2 этажа. Подвал высота 2,5 м. Высота этажа 3,0 м');
  assert.equal(f.length, 3);
  assert.equal(f[0].underground, true);
  assert.equal(f[0].height, 2.5);
  assert.equal(f[1].height, 3);
});

test('podvalsiz matn', () => {
  const f = parseFloorsFromText('4 qavatli bino, qavat balandligi 3,3 m');
  assert.equal(f.length, 4);
  assert.equal(f.some((x) => x.underground), false);
  assert.equal(f[0].height, 3.3);
});

test('faqat podval tilga olinsa', () => {
  const f = parseFloorsFromText('Podval qismiga monolit qolip quyiladi');
  assert.ok(f.length >= 1);
  assert.equal(f[0].underground, true);
});

test('qavat haqida ma\'lumot bo\'lmasa bo\'sh qaytadi', () => {
  assert.deepEqual(parseFloorsFromText('Shartnoma №12, narxlar ilova qilinadi'), []);
  assert.deepEqual(parseFloorsFromText(''), []);
});

test('haddan tashqari qavat soni qabul qilinmaydi', () => {
  const f = parseFloorsFromText('99 qavatli bino');
  assert.equal(f.length, 0, '40 dan ortiq qavat e\'tiborga olinmaydi');
});

test('gabarit o\'lchami o\'qiladi', () => {
  assert.deepEqual(parseSize('Gabarit: 12,0 x 8,0 m'), { x: 12, y: 8 });
  assert.deepEqual(parseSize('размер 24 × 15 м'), { x: 24, y: 15 });
  assert.equal(parseSize('hech qanday o\'lcham yo\'q'), null);
});

// ---------- extract.js: DOCX/XLSX ZIP o'quvchisi ----------

// Minimal ZIP yasash (deflate) — tashqi vositasiz
function makeZip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, 'utf8');
    const comp = zlib.deflateRawSync(raw);
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 14); // crc (tekshirilmaydi)
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

test('DOCX dan matn o\'qiladi (tashqi kutubxonasiz)', () => {
  const doc = '<w:document><w:body>' +
    '<w:p><w:r><w:t>Podval balandligi 2,8 m</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>1-qavat 3,0 m</w:t></w:r></w:p>' +
    '</w:body></w:document>';
  const txt = docxText(makeZip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': doc }));
  assert.match(txt, /Podval balandligi 2,8 m/);
  assert.match(txt, /1-qavat 3,0 m/);
  const floors = parseFloorsFromText(txt);
  assert.equal(floors[0].name, 'Podval');
  assert.equal(floors[0].height, 2.8);
});

test('XLSX dan umumiy satrlar to\'g\'ri almashtiriladi', () => {
  const sst = '<sst><si><t>Qavat</t></si><si><t>Maydon</t></si><si><t>Podval</t></si></sst>';
  const sheet = '<worksheet><sheetData>' +
    '<row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>' +
    '<row><c t="s"><v>2</v></c><c><v>168.28</v></c></row>' +
    '</sheetData></worksheet>';
  const txt = xlsxText(makeZip({
    '[Content_Types].xml': '<Types/>',
    'xl/sharedStrings.xml': sst,
    'xl/worksheets/sheet1.xml': sheet
  }));
  assert.match(txt, /Qavat \| Maydon/);
  assert.match(txt, /Podval \| 168\.28/);
});

test('fayl turlari to\'g\'ri aniqlanadi', () => {
  assert.equal(fileKind('reja.PDF'), 'pdf');
  assert.equal(fileKind('chizma.dxf'), 'dxf');
  assert.equal(fileKind('foto.JPEG'), 'image');
  assert.equal(fileKind('smeta.xlsx'), 'xlsx');
  assert.equal(fileKind('shartnoma.docx'), 'docx');
  assert.equal(fileKind('eski.doc'), 'other');
});
