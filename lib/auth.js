// lib/auth.js
// サーバー側の「今ログインしているのは誰か」の判定を1か所にまとめる。
//
// セッションCookieは署名付き（lib/session.js）だが、それだけだとサーバー側で取り消せない。
// user:{email} に sv（セッション世代）を持たせ、Cookie の sv と一致するときだけ有効とする。
// 「すべての端末からログアウト」は sv を1つ進めるだけで、それ以前に発行した全Cookieが無効になる。
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { kv } from './kv.js';
import { getSessionFromReq, signSession, buildSessionCookie, SESSION_MAX_AGE_SEC } from './session.js';
import { hasFullAccess } from './accessPolicy.js';

/** user レコードのセッション世代（未設定は 0） */
export function sessionVersionOf(user) {
  return Number.isInteger(user?.sv) ? user.sv : 0;
}

/**
 * 有効なセッションなら { email, user, status, full } を返す。未ログイン・無効・取り消し済みは null。
 * KV 障害時も null（未ログイン扱い）に倒す。
 */
export async function getActiveSession(req, env = process.env) {
  const secret = env.SESSION_SECRET;
  const session = secret ? getSessionFromReq(req, secret) : null;
  if (!session) return null;
  let user;
  try {
    user = await kv().get(`user:${session.email}`);
  } catch {
    return null;
  }
  if (!user) return null;
  const cookieSv = Number.isInteger(session.sv) ? session.sv : 0;
  if (cookieSv !== sessionVersionOf(user)) return null;
  const status = typeof user.status === 'string' ? user.status : 'free';
  return {
    email: session.email,
    user,
    status,
    full: hasFullAccess({ loggedIn: true, status }),
  };
}

/** リクエスト元IP（x-forwarded-for の先頭）。取れなければ 'unknown'。 */
export function clientIp(req) {
  const fwd = req?.headers?.['x-forwarded-for'];
  const first = typeof fwd === 'string' ? fwd.split(',')[0].trim() : '';
  return first || req?.headers?.['x-real-ip'] || 'unknown';
}

// ---- ログイン完了（リンク・コード共通） ----

/**
 * user レコードを用意し（無ければ free で作成）、セッションCookieを発行する。
 * @returns {Promise<boolean>} SESSION_SECRET 未設定なら false
 */
export async function issueSession(res, email, env = process.env) {
  const secret = env.SESSION_SECRET;
  if (!secret) return false;
  const userKey = `user:${email}`;
  let user = await kv().get(userKey);
  if (!user) {
    user = { status: 'free', sv: 0, createdAt: new Date().toISOString() };
    await kv().set(userKey, user);
  }
  const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  res.setHeader('Set-Cookie', buildSessionCookie(signSession({ email, exp, sv: sessionVersionOf(user) }, secret)));
  return true;
}

// ---- 6桁のログインコード ----
// ホーム画面に追加したアプリ（iPhone）はブラウザとログイン情報が別のため、メールのリンクを押すと
// 別のブラウザでログインしてしまう。メールに載せたコードをアプリ内で入力してログインできるようにする。
// コードは平文で保存せず HMAC で保存し、1つのコードにつき入力ミスは5回まで。
export const LOGIN_CODE_MAX_ATTEMPTS = 5;

export function generateLoginCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export function hashLoginCode(email, code, secret) {
  return createHmac('sha256', secret || 'no-secret').update(`${email}:${code}`).digest('hex');
}

export function loginCodeMatches(stored, email, code, secret) {
  if (!stored?.hash || !/^\d{6}$/.test(String(code || ''))) return false;
  const a = Buffer.from(stored.hash, 'hex');
  const b = Buffer.from(hashLoginCode(email, String(code), secret), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
