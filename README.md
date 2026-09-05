# ArxAI Platform — MINAR apalka (qolip) hisob va sotuv platformasi

Chizma yuklash → AI/geometrik tahlil → **MINAR qolip spetsifikatsiyasi va smetasi** → 5D (3D + vaqt + xarajat) ko'rish → VR/AR.

## Imkoniyatlar

| Modul | Tavsif |
|---|---|
| 🧱 **IFC o'quvchisi** | Revit/Tekla/ArchiCAD dan chiqqan IFC dan geometriya o'qiladi: `IfcExtrudedAreaSolid` profillari, `IfcLocalPlacement` zanjiri (burilish bilan), `IfcElementQuantity` miqdorlari va `Pset_WallCommon.IsExternal`. O'lchami topilmagan element hisobga **kirmaydi** |
| ◈ **BIM koordinatsiya markazi** | Loyiha manbalari, IFC/DXF almashuv modellari, reviziya holati va AR/KR/MEP koordinatsiya masalalari bitta CDE panelida |
| 📥 **Ko'p faylli yuklash** | Bir vaqtda 20 tagacha hujjat: IFC, DXF/DWG, PDF, JPG/PNG/WEBP, DOCX, XLSX, TXT/CSV — sudrab tashlash bilan |
| 📖 **Hujjatlarni birga o'qish** | Chizmadan geometriya, PDF/DOCX/XLSX matnidan qavatlar, balandliklar va gabarit; hammasi bitta tahlilda birlashtiriladi |
| 📏 **Masshtab** | Birlik DXF sarlavhasidagi `$INSUNITS` dan olinadi; bo'lmasa gabarit bo'yicha taxmin qilinadi va foydalanuvchi mm/sm/m ni qo'lda tanlashi mumkin |
| 🤖 **AI tahlil** | Rasm chizmadan AI devor/eshik/deraza/xonalarni aniqlaydi (OpenAI-mos API); DXF uchun geometrik tahlil |
| 🏢 **Ko'p qavat** | Qavat qo'shish/o'chirish, balandlik; har qavat qolipi alohida yoqiladi/o'chiriladi va alohida hisoblanadi |
| ⬇ **Apalka qoidasi** | Qavat soni qancha bo'lishidan **qat'i nazar** qolip faqat **podval va 1-qavatga** hisoblanadi. Yuqori qavatlar smetaga ham, 5D ko'rinishga ham kirmaydi |
| 🔩 **MINAR qoliplari** | Real katalog: KSHO/MSHO panellari aniq o'lchamlarda devorga joylanadi (DP kombinatsiya), zamok/tyaga/klin/gayka, ustun qolipi, TU teleskopik ustunlar — 3D da real ko'rinishda (RAL ranglar) |
| ⚖ **Ikki tizim taqqoslashi** | Bitta loyiha uchun **мелкощитовая (КМО)** va **крупнощитовая (ЩЛ)** to'liq va alohida hisoblanadi; taqqoslash jadvali (panel, og'irlik, muddat, summa) va har birining o'z bo'limi + oraliq jami. Tanlangan variant bosh ko'rsatkichlarga, 5D ga va PDF ga tushadi |
| 💰 **Sotib olish / arenda** | Har pozitsiya uchun narx; arenda oylik tarif × oylar bo'yicha hisoblanadi; har qatorda narxni qo'lda kiritish mumkin |
| 🏗 **5D ko'rish** | Ko'p qavatli 3D model vaqt jadvali bo'yicha qurilib boradi; qavat tanlash; PNG snapshot |
| 📋 **Ishchi chizmalar** | Har tashqi devor uchun panel markasi, ochiqlik, tyaga, tekislovchi balka, podkos qadami va o'lchamlari; SVG hamda qatlamli DXF eksport |
| 🥽 **VR/AR** | WebXR (VR qo'lqoyni / ARCore telefon) — bino ichida yurish |
| 💬 **AI yordamchi** | Loyiha kontekstida qolip bo'yicha maslahat (chat) |

## Ishga tushirish

```bash
npm install
npm run dev        # server :3001 + web :5173
```

Brauzerda: **http://localhost:5173**

AI kalitisiz ham ishlaydi (demo rejim). To'liq AI uchun `.env.example` ni `.env` ga ko'chirib, `AI_API_KEY` kiriting.

```bash
npm test           # hisob dvigateli, DXF tahlili va validatsiya testlari
npm run build      # production build
npm start          # http://localhost:3001 da ham API, ham UI
```

## Qo'llanadigan fayl formatlari

| Format | Nima olinadi |
|---|---|
| `.dxf` | Devor geometriyasi, xonalar, ochiqliklar, ustunlar (aniq o'lchamda) |
| `.ifc` | **To'liq geometriya**: devor uchlari va qalinligi, ustun kesimi, plita, qavatlar va balandliklari. Plan IFC dan quriladi va to'g'ridan-to'g'ri qolip hisobiga tushadi |
| `.pdf` | Sahifalar rasmga o'giriladi (AI ko'rish uchun) + matn (`pdftotext`) |
| `.jpg .png .webp` | Chizma rasmi — AI vision o'qiydi |
| `.docx` | Word matni: qavatlar, balandliklar, texnik talablar |
| `.xlsx` | Excel jadvali: spetsifikatsiya, o'lchamlar |
| `.txt .csv` | Oddiy matn |

### Revit, AutoCAD va BIM ish oqimi

Platforma native formatni soxta tarzda to'liq o'qilgan deb ko'rsatmaydi. Ishchi almashuv oqimi:

`Revit (IFC4/DXF export) → ArxAI BIM markazi → hisob, 5D va koordinatsiya masalalari`

`AutoCAD (DXF export) → aniq 2D geometriya va qolip hisobi`

`.rvt` va `.dwg` fayllari manba/arxiv sifatida biriktirilishi mumkin; server tomonda haqiqiy model geometriyasi uchun IFC yoki DXF kerak. Native RVT viewer uchun keyingi production integratsiya Autodesk APS (OAuth, Model Derivative API) ulanishini talab qiladi.

#### IFC dan nima o'qiladi

| IFC tushunchasi | Nima olinadi |
|---|---|
| `IfcSIUnit` | Uzunlik, **yuza va hajm birligi alohida** — Revit uzunlikni mm, yuzani m² da yozadi |
| `IfcBuildingStorey` | Qavat nomi va balandligi; qavat balandligi ketma-ket qavatlar farqidan |
| `IfcLocalPlacement` | To'liq o'zgartirish: o'rin **va burilish** — usiz devor uchlari joyiga tushmaydi |
| `IfcExtrudedAreaSolid` + `IfcRectangleProfileDef` | Devor uzunligi/qalinligi, ustun kesimi, plita qalinligi |
| `IfcElementQuantity` | Profil topilmasa zaxira manba: uzunlik, yuza, hajm |
| `Pset_WallCommon.IsExternal` | Devor tashqarimi — taxmin qilinmaydi, modeldan so'raladi |

Har o'lcham uchun **manbasi** saqlanadi (`profile` / `quantity` / `bbox`).
Manbasi topilmagan o'lcham `null` bo'lib qoladi va hisobga kirmaydi —
nol uzunlikli devor smetani jimgina buzadi, uni hech kim sezmaydi.

Proyomlar (eshik/deraza) `IfcRelVoidsElement` orqali devorga bog'lanadi va
yuzadan **chegiriladi**. Haqiqiy modellarda o'lchangan ta'sir: qolip yuzasi
5,5% dan 15,7% gacha kamayadi, panel soni esa ba'zan **oshadi** — proyom
devorni bo'laklarga bo'lib mayda panel talab qiladi.

Geometriya manbalari tartibi: **DXF → IFC → AI rasm tahlili**.

**Xotira chegarasi:** 51 MB li IFC dan 1 026 311 yozuv chiqadi va ~370 MB
xotira yeydi. Serverda 2 GB RAM bor, shuning uchun 40 MB dan katta fayl
tushunarli xato bilan rad etiladi — yiqilgan xizmat hamma uchun to'xtaydi.

### Aniqlik qanday o'lchanadi

```bash
node tools/aniqlik.mjs <IFC papkasi>
```

O'qilgan natija modelning **o'z miqdorlari** bilan solishtiriladi
(`IfcQuantityArea`) — AI ham, taxmin ham aralashmaydi. 2026-09-05 holati,
bim-whale to'plami: **440 devor, 357 tasi 5% aniqlik ichida (81%)**.

Ba'zi eksportlar `NetSideArea` ga devorning **ikkala yuzasini** yozadi
(LargeBuilding, TallBuilding), ba'zilari bittasini (AdvancedProject).
O'lchov buni aniqlaydi va **aytadi** — jimgina ikkiga bo'lish xato bo'lardi.

### Haqiqiy binolar kutubxonasi

OpenStreetMap dan O'zbekiston binolari (ODbL). 1 633 924 konturdan qolip
hisobi uchun ma'nolilari saralangan: 2+ qavatli, 200 m² dan katta —
**41 755 bino**, 8,1 MB.

```
GET  /api/library?minLevels=5&minArea=2000    qidiruv
GET  /api/library/:id                          bitta bino
POST /api/library/:id/plan                     hisob plani
```

DIQQAT: OSM ma'lumoti mukammal emas — qavat soni 18% da, balandlik atigi
0,6% da ko'rsatilgan, ba'zi yozuvlar ochiq xato (100 000 m² li «2 qavatli
uy»). Shuning uchun bu kutubxona **manba emas, namuna**: devor qalinligi va
qavat balandligi OSM da yo'q va parametr sifatida beriladi.

Bir so'rovda **20 tagacha** fayl, har biri 30 MB gacha. Geometriya manbai sifatida DXF ustun
turadi; DXF bo'lmasa AI rasm tahlilidan foydalaniladi. Qavatlar avval AI dan, u bo'lmasa
hujjat matnidan (`docparse.js` evristikasi) aniqlanadi — ya'ni **AI kalitisiz ham**
Word/PDF matnidan "3 qavatli, podval 2,8 m" kabi ma'lumot o'qiladi.

PDF ni o'qish uchun serverda `poppler-utils` kerak: `sudo apt install poppler-utils`.
Rasm va PDF **chizmalarini** tushunish uchun `AI_API_KEY` kerak (matn va DXF kalitsiz ham ishlaydi).

### AI provayderi

Provayder kalit ko'rinishidan avtomatik aniqlanadi (yoki `AI_PROVIDER` bilan majburlanadi):

| Kalit | Provayder | Xususiyatlari |
|---|---|---|
| `sk-ant-...` | **Anthropic (Claude)** — rasmiy SDK | PDF **rasmga o'girilmaydi**, hujjat sifatida to'g'ridan-to'g'ri o'qiladi; natija `strict` tool sxemasi bilan kafolatlanadi (JSON hech qachon buzuq kelmaydi); standart model `claude-opus-5`, adaptiv fikrlash bilan |
| boshqasi | OpenAI-mos API | `/chat/completions`, PDF sahifalari rasmga o'giriladi |

## Hujjat rollari va etalon spetsifikatsiya

Yuklangan har bir fayl **roli** aniqlanadi (fayl nomi va ichidagi matn bo'yicha):

| Rol | Nimadan aniqlanadi | Nima qilinadi |
|---|---|---|
| 📋 Spetsifikatsiya | "Спецификация", jadval sarlavhasi (Наименование/Кол-во) | **Etalon** sifatida olinadi — hisob u bilan qator-qator solishtiriladi |
| 🧱 Devor qolipi rejasi | "Монолитная стена", "крупнощитовой/мелкощитовой опалубки" | Chizma sifatida AI ga beriladi |
| ▤ Perekrytiye rejasi | "перекрытий" | Pol qolipi geometriyasi |
| ━ Rigel rejasi | "ригел" | Balka qolipi |
| ▮ Ustun rejasi | "колонн" | ЩУР ustun qolipi |
| ⚠ DWG | `.dwg` kengaytmasi | **O'qilmaydi** — AutoCAD da "Save As → DXF" kerakligi aytiladi |

Etalon topilsa, "Materiallar va narx" bo'limida **solishtirish jadvali** chiqadi:
✓ mos · ≠ farq qiladi · ✗ hisobda yo'q · + etalonda yo'q. Farq foizi bilan ko'rsatiladi.

## Kirish nazorati

| `.env` da `APP_PASSWORD` | Natija |
|---|---|
| **berilmagan** | Server faqat `127.0.0.1` da tinglaydi — lokal demo, tarmoqqa chiqmaydi |
| **berilgan** | Barcha API va yuklangan fayllar sessiya cookie'si bilan himoyalanadi, server `0.0.0.0` da ishlaydi |

HTTPS orqali ishlatilsa `.env` da `COOKIE_SECURE=1`, frontend boshqa domenda bo'lsa `APP_ORIGIN` bering.

## Arxitektura

```
server/            Express API (Node ESM)
  lib/dxf.js       DXF parser: masshtab ($INSUNITS), devor/eshik deteksiyasi
  lib/calc.js      Miqdor → smeta (BOQ) → 5D jadval
  lib/validate.js  Kiruvchi plan/narx/qavat validatsiyasi va chegaralari
  lib/auth.js      Parol asosidagi sessiya
  lib/db.js        JSON-fayl baza (xotirada kesh + atomik yozuv navbati)
  lib/ai.js        AI vision (rasm→plan JSON) + chat yordamchi
shared/catalog.js  MINAR katalogi (XLSX dan avtomatik, 796 pozitsiya)
shared/formwork.js Panel joylash (DP), me'yorlar, qolip hisobi
tools/             import-catalog.mjs — katalogni XLSX dan yangilash
deploy.sh          Serverga chiqarish (baza zaxirasi bilan)
src/               React + Three.js (Vite)
test/              node:test — hisob, DXF va validatsiya testlari
```

## MINAR katalogi — hisobning asosi

Barcha nomlar, o'lchamlar va og'irliklar **`data/catalog/minar-katalog.xlsx`** dan olingan
(796 pozitsiya) va `shared/catalog.js` ga avtomatik o'tkazilgan. Hisob-kitob **faqat shu
katalogdagi o'lchamlar** bilan yuritiladi — katalogda yo'q panel hech qachon taklif qilinmaydi.

```bash
node tools/import-catalog.mjs "data/catalog/minar-katalog.xlsx"   # katalogni qayta yuklash
```

| Guruh | Katalogdagi soni | Izoh |
|---|---|---|
| **КМО (Щит)** | 45 | Devor qolipi, mayda shtitli: eni 200–600 mm (50 qadam) × balandligi 300–1500 mm (300 qadam) |
| **ЩЛ** | 88 | Katta shtitli: eni 200–1200 mm × balandligi 1200–3300 mm |
| **ЩУ** | 54 | Universal katta panel: eni 500–1200 mm × balandligi 1200–3300 mm |
| **ЩУВ / ЩУВУ / ЩШ / ЩУН** | 458 | Burchak va ustun elementlari |
| **ЩУР** | 8 | Ustun qolipi 0,3×0,3×(0,6…3,3) m |
| Угол внутренний / наружний | 34 | Burchak profillari |
| Балка выравнивающая | 27 | Tekislovchi balka |
| Винт стяжной (Тайрот) | 18 | Tyaga |
| Подкос винтовой | 16 | Qiyalik tayanch |
| УЭ, Замок, Клин, Гайка, Шайба v.b. | 43 | Aksessuarlar |

Spetsifikatsiyada nomlar **aynan katalogdagidek** chiqadi: `КМО (Щит) 600х1500 — 23.4 kg`,
`Замок универсальный — 4.5 kg`, `Винт стяжной заготовка БМ/16/, 0,6м — 0.84 kg`.

**Narxlash:** katalog faylida narx yo'q (faqat nom / o'lcham / og'irlik), shuning uchun standart
narx **og'irlik × po'lat kg tarifi** bo'yicha chiqariladi (`minar_panel_kg`, arendada
`qolip_panel_rent` × oylar). Har bir qator narxi "Materiallar va narx" bo'limida qo'lda
kiritiladi. Katalogda og'irligi ko'rsatilmagan pozitsiyalar qatorida shu haqda yozuv chiqadi.

## Ikki tizim: мелкощитовая va крупнощитовая

| | Мелкощитовая | Крупнощитовая |
|---|---|---|
| Panel oilasi | **КМО (Щит)** — 45 o'lcham | **ЩЛ** — 88 o'lcham |
| O'lchamlar | 200–600 × 300–1500 mm | 200–1200 × 1200–3300 mm |
| Xususiyati | Qo'lda ko'tariladi, murakkab shakllarga mos; pozitsiya va zamok ko'p | Kran bilan o'rnatiladi, montaj tez, chok kam; tor joylarni yopolmaydi |

Ikkalasi ham **to'liq alohida** hisoblanadi (`computeVariants`) — mijoz taqqoslab tanlaydi.
Tanlangan variant **5D chizmaga ham** tushadi: 3D da aynan o'sha panel oilasi (КМО yoki ЩЛ)
katalog o'lchamlarida joylanadi, HUD va legendada tizim nomi ko'rsatiladi.
Katta panellar tor joylarga sig'masa, o'sha yuza `skippedArea` da ko'rsatiladi (proyom qutisi
bilan yopiladi). Narx qo'lda tahrirlansa faqat tanlangan variantga tegishli bo'ladi.

## Hisob me'yorlari

Miqdor me'yorlari `shared/formwork.js` dagi **`FORMWORK_NORMS`** da, izohi bilan bir joyda turadi:

- **Qolip devorning ikkala yuzasiga** qo'yiladi (`FACES = 2`); eshik va deraza o'rinlariga panel qo'yilmaydi
- Panellar devor uzunligi va balandligiga **DP algoritmi** bilan, faqat katalogdagi o'lchamlardan joylanadi
- Zamok (Замок универсальный): panelga 2 dona; har zamokka 1 klin va 1 shkvoren
- Tyaga (Винт стяжной): devor bo'ylab 0.9 m qadam, har 1.2 m balandlikda bir qator; uzunligi devor
  qalinligi + 0.25 m ga qarab katalogdan tanlanadi; har tyagaga 2 gayka va 2 shayba
- Tekislovchi balka (Балка выравнивающая): har 1.2 m balandlikda devor bo'ylab, 2 yuza
- Push-pull tirgak (Подкос винтовой): 2.4 m qadam, 2 yuza; uzunligi qavat balandligiga qarab katalogdan
- Burchak profillari: har tashqi burchakda, qavat balandligini qoplaydigan sonda
- Ustun qolipi (ЩУР): devor bog'lanish nuqtalarida, balandligi qavatga mos
- **Qavat qoidasi (`podval-1`)**: qolip yer osti qavatlariga va birinchi yer usti qavatiga
  qo'yiladi — qolganlariga qo'yilmaydi. Bu yangi loyiha yaratilganda avtomatik qo'llanadi,
  UI da yangi qavat qo'shilsa unga apalka yoqilmaydi, 5D ko'rinishda esa qolipsiz qavatlar
  yashiriladi ("Faqat qolip qavatlari" belgisi bilan boshqariladi).
  Qoidadan chetlashilsa "Qavatlar" bo'limida ogohlantirish va bir bosishli tuzatish chiqadi
- **TU teleskopik ustun**: pol maydonining har 1.5 m² ga 1 dona + uch oyoq + univilka.
  ⚠ Bu guruh Excel katalogida **yo'q** (u faqat devor va ustun qolipini qamraydi) —
  qiymatlar MINAR UZB.pdf dan olingan
- Unumdorlik: qolip montaji 5 m²/kun·kishi, brigada 4 kishi

3D ko'rinish va spetsifikatsiya **bitta** joylashuv funksiyasidan (`layoutWallFaceWithOpenings`)
foydalanadi — ekranda ko'ringan panel smetadagi qator bilan bir xil.

## Chegaralar (validatsiya)

Devor ≤ 2000 ta, ochiqlik ≤ 4000, xona ≤ 500, qavat ≤ 40, koordinata ±5000 m, bitta devor ≤ 500 m,
qavat balandligi 0.5–6 m, devor qalinligi 0.05–2 m. Chegaradan chiqqan plan 400 xatosi bilan rad etiladi.

## Yo'l xaritasi

1. **IFC import** (Revit/Nemetschek chiqishi) — ko'p qavatli binolar, aniq elementlar
2. **PostgreSQL + foydalanuvchilar** (rollar: loyihachi, menejer, buyurtmachi) — hozirgi JSON baza bir tenantli
3. **Gantt diagramma** va resurs grafigi, kritik yo'l
4. **DXF qatlamlari (layer) tanlash** va 2D muharrir (devor chizish/tahrirlash)
5. **Ta'minotchilar katalogi** — real narxlar, RFQ shakllari
6. **Mobil AR** (WebXR hit-test) — qurilish maydonida loyihani joyiga qo'yish
7. **Hisobotlar**: KX savdo-xarid, bayonnoma shablonlari
