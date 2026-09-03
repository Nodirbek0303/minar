# ArxAI Platform — MINAR apalka (qolip) hisob va sotuv platformasi

Chizma yuklash → AI/geometrik tahlil → **MINAR qolip spetsifikatsiyasi va smetasi** → 5D (3D + vaqt + xarajat) ko'rish → VR/AR.

## Imkoniyatlar

| Modul | Tavsif |
|---|---|
| 📥 **Ko'p faylli yuklash** | Bir vaqtda 20 tagacha hujjat: DXF, PDF, JPG/PNG/WEBP, DOCX, XLSX, TXT/CSV — sudrab tashlash bilan |
| 📖 **Hujjatlarni birga o'qish** | Chizmadan geometriya, PDF/DOCX/XLSX matnidan qavatlar, balandliklar va gabarit; hammasi bitta tahlilda birlashtiriladi |
| 📏 **Masshtab** | Birlik DXF sarlavhasidagi `$INSUNITS` dan olinadi; bo'lmasa gabarit bo'yicha taxmin qilinadi va foydalanuvchi mm/sm/m ni qo'lda tanlashi mumkin |
| 🤖 **AI tahlil** | Rasm chizmadan AI devor/eshik/deraza/xonalarni aniqlaydi (OpenAI-mos API); DXF uchun geometrik tahlil |
| 🏢 **Ko'p qavat** | Qavat qo'shish/o'chirish, balandlik; har qavat qolipi alohida yoqiladi/o'chiriladi va alohida hisoblanadi |
| ⬇ **Apalka sxemasi** | Standart: qolip **faqat podval va 1-qavatga** qo'yiladi (yuqori qavatlarga kerak emas); bir bosishda o'zgartiriladi |
| 🔩 **MINAR qoliplari** | Real katalog: KSHO/MSHO panellari aniq o'lchamlarda devorga joylanadi (DP kombinatsiya), zamok/tyaga/klin/gayka, ustun qolipi, TU teleskopik ustunlar — 3D da real ko'rinishda (RAL ranglar) |
| 💰 **Sotib olish / arenda** | Har pozitsiya uchun narx; arenda oylik tarif × oylar bo'yicha hisoblanadi; har qatorda narxni qo'lda kiritish mumkin |
| 🏗 **5D ko'rish** | Ko'p qavatli 3D model vaqt jadvali bo'yicha qurilib boradi; qavat tanlash; PNG snapshot |
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
| `.pdf` | Sahifalar rasmga o'giriladi (AI ko'rish uchun) + matn (`pdftotext`) |
| `.jpg .png .webp` | Chizma rasmi — AI vision o'qiydi |
| `.docx` | Word matni: qavatlar, balandliklar, texnik talablar |
| `.xlsx` | Excel jadvali: spetsifikatsiya, o'lchamlar |
| `.txt .csv` | Oddiy matn |

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
