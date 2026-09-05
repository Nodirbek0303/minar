// ============================================================
//  Kirish urinishlarini cheklash — parolni terib topishga qarshi.
//
//  Muammo: /api/login har chaqiruvga ~2 ms da javob beradi va urinishlar
//  soni cheklanmagan edi. Ochiq IP da bu parolni terib topishni bir necha
//  daqiqalik ishga aylantiradi — parol qanchalik yaxshi bo'lsa ham, uni
//  cheksiz urinish bilan sindirish mumkin.
//
//  Yechim ikki qatlamli:
//
//   1. Har xato urinishdan keyin JAVOB SEKINLASHADI (250 ms). Odam buni
//      sezmaydi, robot esa sekundiga mingdan to'rttaga tushadi.
//   2. Bir IP dan ketma-ket xato urinishlar ko'paysa — QULFLANADI.
//      Muddat bosqichma-bosqich o'sadi, to'g'ri parol kiritilsa nolga
//      qaytadi.
//
//  Hisob xotirada yuritiladi: server qayta ishga tushsa qulf ham ketadi.
//  Bu ataylab shunday — bitta jarayonli xizmat uchun tashqi baza qo'shish
//  foydasidan ko'ra ko'proq nosozlik keltiradi.
// ============================================================

// Nechta xatodan keyin qulflanadi va necha vaqtga (millisekund).
// Bosqichlar: 5 xato -> 1 daqiqa, 10 -> 5 daqiqa, 15 -> 30 daqiqa,
// 20 va undan ko'p -> 1 soat.
export const STEPS = [
  { fails: 20, lock: 60 * 60 * 1000 },
  { fails: 15, lock: 30 * 60 * 1000 },
  { fails: 10, lock: 5 * 60 * 1000 },
  { fails: 5, lock: 60 * 1000 }
];

// Har xato javobdan oldingi kechikish. Robotning tezligini keskin tushiradi.
export const FAIL_DELAY_MS = 250;

// Shuncha vaqt jim turgan IP ro'yxatdan chiqadi (xotira o'smasin).
const FORGET_MS = 2 * 60 * 60 * 1000;

const tries = new Map(); // ip -> { fails, lockedUntil, seen }

function sweep(now) {
  for (const [ip, rec] of tries) {
    if (now - rec.seen > FORGET_MS) tries.delete(ip);
  }
}

function lockFor(fails) {
  for (const step of STEPS) if (fails >= step.fails) return step.lock;
  return 0;
}

/**
 * Shu IP hozir urinib ko'rishi mumkinmi?
 * Qulflangan bo'lsa qancha kutishi kerakligini (soniya) qaytaradi.
 */
export function check(ip, now = Date.now()) {
  const rec = tries.get(ip);
  if (!rec || !rec.lockedUntil || rec.lockedUntil <= now) {
    return { allowed: true, retryAfterSec: 0 };
  }
  return {
    allowed: false,
    retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000)
  };
}

/** Xato urinish qayd etiladi. Qulf boshlansa uning muddatini qaytaradi. */
export function fail(ip, now = Date.now()) {
  sweep(now);
  const rec = tries.get(ip) || { fails: 0, lockedUntil: 0, seen: now };
  rec.fails += 1;
  rec.seen = now;
  const lock = lockFor(rec.fails);
  if (lock) rec.lockedUntil = now + lock;
  tries.set(ip, rec);
  return { fails: rec.fails, lockedSec: lock ? Math.ceil(lock / 1000) : 0 };
}

/** To'g'ri parol — hisob nolga qaytadi. */
export function succeed(ip) {
  tries.delete(ip);
}

/** Kuzatuv uchun: hozir nechta IP ro'yxatda va nechtasi qulflangan. */
export function stats(now = Date.now()) {
  let locked = 0;
  for (const rec of tries.values()) if (rec.lockedUntil > now) locked += 1;
  return { tracked: tries.size, locked };
}

/** Testlar uchun: hammasini tozalash. */
export function reset() {
  tries.clear();
}

/** Kechikish — testlarda kutib o'tirmaslik uchun alohida funksiya. */
export function delay(ms = FAIL_DELAY_MS) {
  return new Promise((r) => setTimeout(r, ms));
}
