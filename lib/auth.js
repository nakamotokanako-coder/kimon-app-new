// lib/auth.js
// サーバー側の「今ログインしているのは誰か」の判定を1か所にまとめる。
//
// セッションCookieは署名付き（lib/session.js）だが、それだけだとサーバー側で取り消せない。
// user:{email} に sv（セッション世代）を持たせ、Cookie の sv と一致するときだけ有効とする。
// 「すべての端末からログアウト」は sv を1つ進めるだけで、それ以前に発行した全Cookieが無効になる。
import { kv } from './kv.js';
import { getSessionFromReq } from './session.js';
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
