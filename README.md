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
shared/formwork.js MINAR katalogi, panel joylash (DP), me'yorlar, qolip hisobi
src/               React + Three.js (Vite)
test/              node:test — hisob, DXF va validatsiya testlari
```

## Hisob me'yorlari

Barcha aksessuar formulalari `shared/formwork.js` dagi **`FORMWORK_NORMS`** da, izohi bilan bir joyda turadi:

- **Qolip devorning ikkala yuzasiga** qo'yiladi (`FACES = 2`); eshik va deraza o'rinlariga panel qo'yilmaydi — u yerlar proyom qutisi bilan yopiladi
- **MSHO** — 200–600 × 300–1500 mm, 26 kg/m² (katalogda 1500×500 va 1500×600 yo'q)
- **KSHO** — 3.3 m gacha, 90 kg/m²
- Panellar devor uzunligi va balandligiga **DP algoritmi** bilan aniq joylanadi; juda uzun devor xotira uchun bo'laklarga bo'linadi
- Zamok: panelga 2 dona, har zamokka 1 klin
- Tyaga: devor bo'ylab 0.9 m qadam, har 1.2 m balandlikda bir qator; har tyagaga 2 cho'yan gayka
- Vertikal truba 1.2 m qadam; gorizontal truba har 1.2 m balandlikda (5% ulanish zaxirasi)
- Ikki shoxli tirgak: vertikal × gorizontal truba kesishmalari soni
- Push-pull tirgak: 2.4 m qadam, 2 yuza
- Ustun qolipi: devor bog'lanish nuqtalarida 40×40 sm (perimetr 1.6 m × balandlik)
- **TU teleskopik ustun**: pol maydonining har 1.5 m² ga 1 dona + uch oyoq + univilka; model qavat balandligiga qarab tanlanadi
- Unumdorlik: qolip montaji 5 m²/kun·kishi, brigada 4 kishi

3D ko'rinish va spetsifikatsiya **bitta** joylashuv funksiyasidan (`layoutWallFaceWithOpenings`) foydalanadi — ekranda ko'ringan narsa smetadagi raqam bilan bir xil.

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
