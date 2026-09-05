// Kirish urinishlarini cheklash — parolni terib topishga qarshi himoya.
//
// Bu yerdagi asosiy talab: XATO urinishlar ko'paysa qulf ishlashi, TO'G'RI
// parol esa hisobni nolga qaytarishi. Agar qulf haqiqiy foydalanuvchini
// ham to'sib qo'ysa, u dasturga kira olmaydi va bu xavfsizlikdan ko'ra
// ko'proq zarar keltiradi.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as limiter from '../server/lib/ratelimit.js';

test.beforeEach(() => limiter.reset());

// --- Odatdagi holat ---------------------------------------------------

test('yangi IP bemalol urinib ko\'radi', () => {
  assert.equal(limiter.check('1.1.1.1').allowed, true);
});

test('bir necha xato hali qulflamaydi', () => {
  for (let i = 0; i < 4; i++) limiter.fail('1.1.1.1');
  assert.equal(limiter.check('1.1.1.1').allowed, true);
});

test('to\'g\'ri parol hisobni nolga qaytaradi', () => {
  for (let i = 0; i < 4; i++) limiter.fail('1.1.1.1');
  limiter.succeed('1.1.1.1');
  assert.equal(limiter.stats().tracked, 0);
  assert.equal(limiter.check('1.1.1.1').allowed, true);
});

// --- Qulflash ---------------------------------------------------------

test('5-xatodan keyin qulflanadi', () => {
  let last;
  for (let i = 0; i < 5; i++) last = limiter.fail('2.2.2.2');
  assert.equal(last.lockedSec, 60);
  const gate = limiter.check('2.2.2.2');
  assert.equal(gate.allowed, false);
  assert.ok(gate.retryAfterSec > 0 && gate.retryAfterSec <= 60);
});

test('urinish ko\'paygan sari muddat uzayadi', () => {
  const ip = '3.3.3.3';
  let sec = [];
  for (let i = 1; i <= 20; i++) {
    const r = limiter.fail(ip);
    if ([5, 10, 15, 20].includes(i)) sec.push(r.lockedSec);
  }
  assert.deepEqual(sec, [60, 5 * 60, 30 * 60, 60 * 60]);
});

test('qulf muddati tugagach yana ruxsat beriladi', () => {
  const ip = '4.4.4.4';
  const now = Date.now();
  for (let i = 0; i < 5; i++) limiter.fail(ip, now);
  assert.equal(limiter.check(ip, now).allowed, false);
  // 61 soniyadan keyin
  assert.equal(limiter.check(ip, now + 61_000).allowed, true);
});

// --- Eng muhimi: bir IP boshqasini to'smaydi --------------------------

test('bitta IP qulflansa boshqalari ishlayveradi', () => {
  for (let i = 0; i < 20; i++) limiter.fail('5.5.5.5');
  assert.equal(limiter.check('5.5.5.5').allowed, false);
  assert.equal(limiter.check('6.6.6.6').allowed, true);
});

// --- Kuzatuv ----------------------------------------------------------

test('stats qulflanganlar sonini aytadi', () => {
  for (let i = 0; i < 5; i++) limiter.fail('7.7.7.7');
  limiter.fail('8.8.8.8');
  const s = limiter.stats();
  assert.equal(s.tracked, 2);
  assert.equal(s.locked, 1);
});

// --- Sekinlashtirish --------------------------------------------------

test('xato javob sekinlashtiriladi', async () => {
  const t0 = Date.now();
  await limiter.delay(50);
  assert.ok(Date.now() - t0 >= 45);
});

test('kechikish robotning tezligini keskin tushiradi', () => {
  // 250 ms kechikish bilan sekundiga 4 ta urinish. 5 belgili parolni
  // (26^5 ≈ 11.9 mln) terib topish 94 ming soatdan oshadi - amalda mumkin emas.
  const perSec = 1000 / limiter.FAIL_DELAY_MS;
  assert.ok(perSec <= 4, `sekundiga ${perSec} urinish - juda tez`);
});
