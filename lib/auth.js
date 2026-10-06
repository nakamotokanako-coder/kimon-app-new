// lib/auth.js
// サーバー側の「今ログインしているのは誰か」の判定を1か所にまとめる。
//
// セッションCookieは署名付き（lib/session.js）だが、それだけだとサーバー側で取り消せない。
// user:{email} に端末ごとのセッション一覧（sessions）とセッション世代（sv）を持たせ、
// Cookie の sid が一覧にあり、sv が一致するときだけ有効とする。
//   - 同時にログインできる端末は MAX_DEVICES 台まで。超えたら一番使われていない端末をログアウト
//     （1つのアカウントを数名で共有されるのを防ぐ）
//   - ログインの有効期間は30日（月額サブスクの更新周期に合わせる。SESSION_MAX_AGE_SEC）
//   - 「すべての端末からログアウト」は sv を1つ進めて一覧を空にする
import { isInvited, loadInvites, mayLogin, ownerEmail } from './invite.js';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { kv } from './kv.js';
import { getSessionFromReq, signSession, buildSessionCookie, SESSION_MAX_AGE_SEC } from './session.js';
import { hasFullAccess, isPaidActive } from './accessPolicy.js';

export const MAX_DEVICES = 3;
/** 最終利用日時の更新間隔（毎リクエストで書き込まないため） */
const LAST_SEEN_UPDATE_MS = 60 * 60 * 1000;

/** user レコードのセッション世代（未設定は 0） */
export function sessionVersionOf(user) {
  return Number.isInteger(user?.sv) ? user.sv : 0;
}

/** 期限切れ（30日より前にログイン）を除いたセッション一覧 */
export function liveSessions(user, now = Date.now()) {
  const list = Array.isArray(user?.sessions) ? user.sessions : [];
  return list.filter((s) => s?.sid && now - Date.parse(s.createdAt || 0) < SESSION_MAX_AGE_SEC * 1000);
}

/** User-Agent から「iPhone・Safari」のような端末名を作る（一覧表示用・おおまかで良い） */
export function deviceLabel(userAgent = '') {
  const ua = String(userAgent || '');
  let device = 'その他の端末';
  if (/iPad/.test(ua)) device = 'iPad';
  else if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/Android/.test(ua)) device = 'Android';
  else if (/Macintosh|Mac OS X/.test(ua)) device = 'Mac';
  else if (/Windows/.test(ua)) device = 'Windows';
  let browser = '';
  // LINE の中のブラウザ（名前に Safari も入っているので、先に見分ける）
  if (/\bLine\//.test(ua)) browser = 'LINE';
  else if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/FxiOS|Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return browser ? `${device}・${browser}` : device;
}

/**
 * 有効なセッションなら { email, user, sid, status, full } を返す。未ログイン・無効・取り消し済みは null。
 * KV 障害時も null（未ログイン扱い）に倒す。
 */
export async function getActiveSession(req, env = process.env) {
  const secret = env.SESSION_SECRET;
  const session = secret ? getSessionFromReq(req, secret) : null;
  if (!session || typeof session.sid !== 'string') return null;
  const key = `user:${session.email}`;
  let user;
  try {
    user = await kv().get(key);
  } catch {
    return null;
  }
  if (!user) return null;
  const cookieSv = Number.isInteger(session.sv) ? session.sv : 0;
  if (cookieSv !== sessionVersionOf(user)) return null;
  const sessions = liveSessions(user);
  const mine = sessions.find((s) => s.sid === session.sid);
  if (!mine) return null; // 端末の上限で追い出された・個別にログアウトされた・期限切れ

  // 最終利用日時を（1時間に1回だけ）更新する。一覧の表示と、追い出す端末の判定に使う。
  const now = Date.now();
  if (now - Date.parse(mine.lastSeenAt || 0) > LAST_SEEN_UPDATE_MS) {
    const updated = sessions.map((s) => (s.sid === mine.sid ? { ...s, lastSeenAt: new Date(now).toISOString() } : s));
    user = { ...user, sessions: updated };
    try {
      await kv().set(key, user);
    } catch {
      // 最終利用日時の更新失敗は致命的ではない
    }
  }

  // 招待制（lib/invite.js）: 招待されていない人は、ログイン中でもログアウト扱いにする。
  let invited = false;
  try {
    const invites = await loadInvites();
    if (!mayLogin(session.email, invites, env)) return null;
    invited = isInvited(session.email, invites, env);
  } catch {
    // 一覧を読めないときは、招待の特典なしで続ける（締め出しはしない）
  }

  const rawStatus = typeof user.status === 'string' ? user.status : 'free';
  const paidUntil = typeof user.paidUntil === 'string' ? user.paidUntil : null;
  // 有料期限が切れていたら、表示上も無料として扱う。
  const status = rawStatus === 'paid' && !isPaidActive({ status: rawStatus, paidUntil }) ? 'free' : rawStatus;
  return {
    email: session.email,
    user,
    sid: session.sid,
    status,
    paidUntil: status === 'paid' ? paidUntil : null,
    // 招待した人は、課金を始めたあともずっと全機能を使える。
    full: invited || hasFullAccess({ loggedIn: true, status, paidUntil }),
    invited,
    owner: Boolean(ownerEmail(env)) && session.email === ownerEmail(env),
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
 * user レコードを用意し（無ければ free で作成）、この端末のセッションを登録して Cookie を発行する。
 * 端末が MAX_DEVICES 台を超えたら、最終利用が一番古い端末をログアウトさせる。
 * @returns {Promise<boolean>} SESSION_SECRET 未設定なら false
 */
export async function issueSession(res, email, req = null, env = process.env) {
  const secret = env.SESSION_SECRET;
  if (!secret) return false;
  // 招待制のとき、招待されていない人にはログインを発行しない（メールを送る前にも止めているが、念のためここでも）。
  if (!mayLogin(email, await loadInvites({ fresh: true }), env)) return false;
  const userKey = `user:${email}`;
  let user = await kv().get(userKey);
  if (!user) user = { status: 'free', sv: 0, createdAt: new Date().toISOString() };

  const nowIso = new Date().toISOString();
  const sid = randomBytes(16).toString('hex');
  let sessions = liveSessions(user);
  // このブラウザがすでに同じ会員でログイン中なら、その分は入れ替える（同じ端末が2台ぶんに数えられないようにする）。
  const current = getSessionFromReq(req, secret);
  if (current?.email === email && typeof current.sid === 'string') {
    sessions = sessions.filter((s) => s.sid !== current.sid);
  }
  sessions.push({ sid, label: deviceLabel(req?.headers?.['user-agent']), createdAt: nowIso, lastSeenAt: nowIso });
  if (sessions.length > MAX_DEVICES) {
    sessions = [...sessions]
      .sort((a, b) => Date.parse(b.lastSeenAt || 0) - Date.parse(a.lastSeenAt || 0))
      .slice(0, MAX_DEVICES);
  }
  user = { ...user, sessions };
  await kv().set(userKey, user);

  const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  res.setHeader('Set-Cookie', buildSessionCookie(signSession({ email, exp, sv: sessionVersionOf(user), sid }, secret)));
  return true;
}

/** 指定した端末のセッションを一覧から外す（その端末はログアウト状態になる） */
export async function revokeSession(email, sid) {
  const key = `user:${email}`;
  const user = await kv().get(key);
  if (!user) return;
  await kv().set(key, { ...user, sessions: liveSessions(user).filter((s) => s.sid !== sid) });
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
