import crypto from 'crypto';

// ============================================================
//  Oddiy parol asosidagi kirish nazorati.
//
//   · .env da APP_PASSWORD berilgan bo'lsa — barcha /api va /files
//     yo'llari sessiya cookie'si bilan himoyalanadi.
//   · Parol berilmagan bo'lsa server FAQAT 127.0.0.1 da tinglaydi
//     (lokal demo rejimi) va ochiq tarmoqqa chiqmaydi.
//
//  Sessiyalar xotirada saqlanadi — server qayta ishga tushsa,
//  qaytadan kirish talab qilinadi.
// ============================================================

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 soat
const COOKIE = 'arxai_session';
const sessions = new Map(); // token -> expiresAt

export const authEnabled = () => !!process.env.APP_PASSWORD;

function sweep() {
  const now = Date.now();
  for (const [t, exp] of sessions) if (exp < now) sessions.delete(t);
}

export function createSession() {
  sweep();
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return { token, maxAge: SESSION_TTL_MS };
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

function validSession(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(token); return false; }
  return true;
}

// Parolni doimiy vaqtda solishtirish (timing hujumiga qarshi)
export function checkPassword(input) {
  const real = process.env.APP_PASSWORD || '';
  if (!real) return false;
  const a = Buffer.from(String(input ?? ''), 'utf8');
  const b = Buffer.from(real, 'utf8');
  if (a.length !== b.length) {
    // uzunlik farq qilsa ham doimiy vaqt uchun taqqoslash bajariladi
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionToken(req) {
  return readCookie(req, COOKIE);
}

export function setSessionCookie(res, token, maxAge) {
  const secure = process.env.COOKIE_SECURE === '1';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(maxAge / 1000)}` + (secure ? '; Secure' : ''));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// Himoya middleware: ochiq yo'llar ro'yxatidan tashqari hamma narsa uchun
export function requireAuth(openPaths = []) {
  return (req, res, next) => {
    if (!authEnabled()) return next();
    if (req.method === 'OPTIONS') return next();
    if (openPaths.some((p) => req.path === p)) return next();
    if (validSession(sessionToken(req))) return next();
    res.status(401).json({ error: 'Kirish talab qilinadi', auth: true });
  };
}
