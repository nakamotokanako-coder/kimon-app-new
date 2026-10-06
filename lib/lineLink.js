// lib/lineLink.js
// LINE のユーザーと、アプリの会員（メールアドレス）を結びつける。
//
// 流れ:
//   1. LINE で「アプリと連携」を押すと、15分だけ使える1回きりのリンク（?line=合言葉）を返信する
//   2. リンクを開いてアプリにログインし、画面で「連携する」を押すと結びつく
//      （リンクを開いただけでは結びつけない。他人から送られたリンクで、知らないうちに結びつくのを防ぐ）
//   3. 以後、LINE からの通知のたびに、結びついた会員が全機能を使えるかを見られる（memberOfLineUser）
//
// 保存先（KV）:
//   line:linktoken:{合言葉} → { userId, name, trusted? }   15分で消える。使ったら消す
//     trusted … LINE でログインした本人の端末に渡した合言葉（lib/lineLogin.js）。確認の画面を出さずに結びつけてよい
//   line:link:{LINEのユーザーID} → メールアドレス
//   line:user:{メールアドレス} → LINEのユーザーID
//   会員情報 user:{email} には書かない（決済の Webhook の書き込みと競合させない。lib/userData.js と同じ考え方）
//
// 入口: GET / POST / DELETE /api/auth/me?line=1（Hobby プランの関数12個制限のため me に同居）
//   GET    … { linked }
//   POST   … { token } で相手の LINE の名前を確かめる → { name, trusted }。{ token, confirm: true } で結びつける → { linked: true }
//   DELETE … 連携をやめる
import { randomBytes } from 'node:crypto';
import { kv } from './kv.js';
import { isInvited, loadInvites, mayLogin } from './invite.js';
import { hasFullAccess, isPaidActive } from './accessPolicy.js';

export const LINK_TOKEN_TTL_SEC = 15 * 60;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

const tokenKey = (token) => `line:linktoken:${token}`;
const linkKey = (userId) => `line:link:${userId}`;
const userKey = (email) => `line:user:${email}`;

/** 連携用の合言葉を作る（15分・1回きり）。name は確認画面に出す LINE の表示名（無くてもよい） */
export async function createLinkToken(userId, name = '', { trusted = false } = {}) {
  const token = randomBytes(24).toString('base64url');
  const value = { userId, name: String(name || '').slice(0, 40), ...(trusted ? { trusted: true } : {}) };
  await kv().set(tokenKey(token), value, { ex: LINK_TOKEN_TTL_SEC });
  return token;
}

/** 合言葉の中身（期限切れ・使用済み・形が違うものは null） */
export async function peekLinkToken(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const found = await kv().get(tokenKey(token));
  return found?.userId ? found : null;
}

/** この LINE のユーザーに結びついた会員のメールアドレス（無ければ null） */
export async function linkedEmail(userId) {
  if (!userId) return null;
  return (await kv().get(linkKey(userId))) || null;
}

export async function unlinkByEmail(email) {
  const userId = await kv().get(userKey(email));
  if (userId) await kv().del(linkKey(userId));
  await kv().del(userKey(email));
}

export async function unlinkByLineUser(userId) {
  const email = await kv().get(linkKey(userId));
  if (email) await kv().del(userKey(email));
  await kv().del(linkKey(userId));
}

/** LINE のユーザーと会員を結びつける。1人の会員に LINE は1つ、1つの LINE に会員は1人（前の結びつきは外す）。 */
export async function linkLineUser(userId, email) {
  await unlinkByEmail(email);
  await unlinkByLineUser(userId);
  await kv().set(linkKey(userId), email);
  await kv().set(userKey(email), userId);
}

/**
 * 合言葉を使って結びつける（合言葉は1回きり）。
 * @returns {Promise<boolean>} 合言葉が無効なら false
 */
export async function linkAccount(token, email) {
  const found = await peekLinkToken(token);
  if (!found) return false;
  await kv().del(tokenKey(token));
  await linkLineUser(found.userId, email);
  return true;
}

/**
 * LINE のユーザーに結びついた会員と、その人がどこまで使えるか。結びついていなければ null。
 * 判定は lib/auth.js の getActiveSession と同じ（有料期限が切れていたら無料。招待した人は全機能）。
 * 解約後は、期限が切れた時点でここも無料に戻る。
 */
export async function memberOfLineUser(userId, env = process.env) {
  const email = await linkedEmail(userId);
  if (!email) return null;
  const user = await kv().get(`user:${email}`);
  if (!user) return null;
  let invited = false;
  try {
    const invites = await loadInvites();
    if (!mayLogin(email, invites, env)) return null;
    invited = isInvited(email, invites, env);
  } catch {
    // 一覧を読めないときは、招待の特典なしで続ける
  }
  const rawStatus = typeof user.status === 'string' ? user.status : 'free';
  const paidUntil = typeof user.paidUntil === 'string' ? user.paidUntil : null;
  const status = rawStatus === 'paid' && !isPaidActive({ status: rawStatus, paidUntil }) ? 'free' : rawStatus;
  return {
    email,
    status,
    paidUntil: status === 'paid' ? paidUntil : null,
    invited,
    full: invited || hasFullAccess({ loggedIn: true, status, paidUntil }),
  };
}

/** GET / POST / DELETE /api/auth/me?line=1 の処理。active は getActiveSession の結果。 */
export async function handleLineLink(req, res, active) {
  if (!active) return res.status(401).json({ error: 'not_logged_in' });

  if (req.method === 'GET') {
    return res.status(200).json({ linked: Boolean(await kv().get(userKey(active.email))) });
  }
  if (req.method === 'DELETE') {
    await unlinkByEmail(active.email);
    return res.status(200).json({ linked: false });
  }

  // POST: JSON だけ受け付ける（他サイトのフォームからの送信を受けない）。
  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ error: 'json_required' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const found = await peekLinkToken(body.token);
  if (!found) return res.status(404).json({ error: 'expired' });
  if (body.confirm !== true) return res.status(200).json({ name: found.name || '', trusted: Boolean(found.trusted) });
  await linkAccount(body.token, active.email);
  return res.status(200).json({ linked: true });
}
