// lib/lineLogin.js
// LINE でログイン（LINE Login v2.1）。メールのコードでのログインと並べて使える、もう1つの入口。
//
// 会員の正本はメールアドレス（user:{email}。招待・決済・領収書がメールアドレスに結びついている）のまま変えない。
// LINE でログインした人が「どの会員か」は、lib/lineLink.js の結びつき（LINE のユーザーID → メールアドレス）で決める。
//   - 結びつきがある            → その会員としてログイン
//   - 結びつきがない（はじめて）→ 連携用の合言葉を返す。画面でメールのコードで1回ログインしてもらうと結びつき、
//                                 次からは LINE だけでログインできる
//   - すでにログイン中の人が押した → その会員に LINE を結びつける（設定の「LINEと連携する」）
// LINE からメールアドレスは受け取らない（scope は openid profile だけ。LINE への申請が要らない）。
//
// 流れ:
//   GET  /api/auth/me?linelogin=start  … state と nonce を Cookie に入れて、LINE の認可画面へ送る
//   （LINE から https://<本番>/?code=…&state=… に戻る。画面が code と state を読み取って下へ送る）
//   POST /api/auth/me?linelogin=finish … { code, state } を確かめ、LINE に問い合わせて本人（ユーザーID）を確定する
// コールバックURL（LINE Developers に登録するもの）は、本番のアドレスそのもの: https://<本番>/
//
// 公式アカウント（Messaging API）と同じプロバイダーに LINE ログインのチャネルを作ること。
// プロバイダーが同じなら LINE のユーザーID が共通になり、リッチメニューの「アプリと連携」とも同じ結びつきを使える。
//
// 環境変数: LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getActiveSession, issueSession } from './auth.js';
import { createLinkToken, linkedEmail, linkLineUser } from './lineLink.js';
import { buildOrigin, parseCookies } from './session.js';

const AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize';
const TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
export const LINE_LOGIN_COOKIE = 'kimon_line_login';
const COOKIE_MAX_AGE_SEC = 10 * 60;

export function isLineLoginConfigured(env = process.env) {
  return Boolean(env.LINE_LOGIN_CHANNEL_ID && env.LINE_LOGIN_CHANNEL_SECRET);
}

const redirectUri = (req, env) => {
  const origin = buildOrigin(req, env);
  return origin ? `${origin}/` : null;
};

const sameText = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};

/** GET /api/auth/me?linelogin=start → LINE の認可画面へ */
export function startLineLogin(req, res, env = process.env) {
  const redirect = redirectUri(req, env);
  if (!isLineLoginConfigured(env) || !redirect) return res.status(503).json({ error: 'line_login_unavailable' });
  const state = randomBytes(16).toString('hex');
  const nonce = randomBytes(16).toString('hex');
  // 戻ってきたのが、この端末で始めたログインかを確かめるための控え（10分）。
  res.setHeader('Set-Cookie', `${LINE_LOGIN_COOKIE}=${state}.${nonce}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}`);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.LINE_LOGIN_CHANNEL_ID,
    redirect_uri: redirect,
    state,
    scope: 'openid profile',
    nonce,
    // 公式アカウントを友だちに追加するかを、同意画面でたずねる（チャネルに公式アカウントをつないでいるとき）
    bot_prompt: 'normal',
  });
  res.setHeader('Location', `${AUTHORIZE_URL}?${params}`);
  return res.status(302).end();
}

async function postForm(url, fields) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  if (!res.ok) return null;
  return res.json();
}

/** code を LINE に渡して、本人の { userId, name } を確定する。確かめられなければ null */
async function identify(code, nonce, redirect, env) {
  const token = await postForm(TOKEN_URL, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
    client_id: env.LINE_LOGIN_CHANNEL_ID,
    client_secret: env.LINE_LOGIN_CHANNEL_SECRET,
  });
  if (!token?.id_token) return null;
  // IDトークンの署名・宛先（client_id）・nonce の確認は LINE の検証用の入口に任せる。
  const claims = await postForm(VERIFY_URL, { id_token: token.id_token, client_id: env.LINE_LOGIN_CHANNEL_ID, nonce });
  if (!claims?.sub || claims.nonce !== nonce) return null;
  return { userId: String(claims.sub), name: String(claims.name || '') };
}

/** POST /api/auth/me?linelogin=finish  body: { code, state } */
export async function finishLineLogin(req, res, env = process.env) {
  const redirect = redirectUri(req, env);
  if (!isLineLoginConfigured(env) || !redirect) return res.status(503).json({ error: 'line_login_unavailable' });
  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ error: 'json_required' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const [state, nonce] = String(parseCookies(req.headers?.cookie)[LINE_LOGIN_COOKIE] || '').split('.');
  if (typeof body.code !== 'string' || !body.code || !nonce || !sameText(body.state, state)) {
    return res.status(400).json({ error: 'bad_state' });
  }

  let who = null;
  try {
    who = await identify(body.code, nonce, redirect, env);
  } catch {
    who = null;
  }
  if (!who) return res.status(400).json({ error: 'line_login_failed' });

  // すでにログイン中: その会員に LINE を結びつける。
  const active = await getActiveSession(req, env);
  if (active) {
    await linkLineUser(who.userId, active.email);
    return res.status(200).json({ loggedIn: true, linked: true });
  }

  const email = await linkedEmail(who.userId);
  if (email) {
    // 招待制で外された人などは issueSession が断る。
    if (!(await issueSession(res, email, req, env))) return res.status(403).json({ error: 'not_allowed' });
    return res.status(200).json({ loggedIn: true });
  }

  // はじめての人: メールのコードで1回ログインしてもらってから結びつける。
  // LINE での本人確認はこの端末で済んでいるので、確認の画面は出さずに結びつけてよい合言葉（trusted）にする。
  const token = await createLinkToken(who.userId, who.name, { trusted: true });
  return res.status(200).json({ loggedIn: false, needEmail: true, token });
}
