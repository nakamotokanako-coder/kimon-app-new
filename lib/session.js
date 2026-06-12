// lib/session.js
// 署名付きセッションCookie（HMAC-SHA256）・Cookie解析/発行・マジックリンクorigin構築。
// 純関数主体でKV/外部依存なし → テストから直接呼べる（既存の素朴流儀に合わせる）。
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'kimon_session';
export const SESSION_MAX_AGE_SEC = 90 * 24 * 60 * 60; // 90日

// Preview/本番で正しいoriginを組むための許可ホスト接尾辞（保険のHostヘッダ検証用）。
const ALLOWED_HOST_SUFFIXES = ['.vercel.app'];

/** {email, exp} を base64url(JSON) + "." + HMAC-SHA256 で署名する。 */
export function signSession(payload, secret) {
  if (!secret) throw new Error('signSession: secret required');
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** 署名検証 + exp 期限チェック。妥当なら payload、無効なら null。 */
export function verifySession(token, secret) {
  if (!secret || typeof token !== 'string' || !token.includes('.')) return null;
  const dot = token.indexOf('.');
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // 署名長が違えば timingSafeEqual が投げるので長さを先に確認（タイミング差は許容範囲）。
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.email !== 'string' || typeof payload.exp !== 'number') return null;
  if (Date.now() > payload.exp) return null;
  return payload;
}

/** Cookieヘッダ文字列を { name: value } に解析する。 */
export function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** req からセッション payload を取り出して検証する（未ログイン/無効は null）。 */
export function getSessionFromReq(req, secret) {
  const token = parseCookies(req?.headers?.cookie)[SESSION_COOKIE];
  if (!token) return null;
  return verifySession(token, secret);
}

/** Set-Cookie 値（HttpOnly / Secure / SameSite=Lax / Path=/）。 */
export function buildSessionCookie(value, maxAgeSec = SESSION_MAX_AGE_SEC) {
  return [
    `${SESSION_COOKIE}=${value}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSec}`,
  ].join('; ');
}

/** 失効用 Set-Cookie 値（Max-Age=0）。 */
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * マジックリンクの origin（末尾スラッシュなし）を組む。案D（ハイブリッド）:
 *   APP_BASE_URL ?? https://${VERCEL_URL} ?? Hostヘッダ(許可リスト検証)
 * 本番は APP_BASE_URL 未設定でも VERCEL_URL 経由で正しく組まれる。組めなければ null。
 */
export function buildOrigin(req, env = process.env) {
  if (env.APP_BASE_URL) return env.APP_BASE_URL.replace(/\/+$/, '');
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL.replace(/\/+$/, '')}`;
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || '';
  const proto = req?.headers?.['x-forwarded-proto'] || 'https';
  if (host && ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return `${proto}://${host}`;
  }
  return null;
}
