// LINE との連携と、LINE でのログイン（画面側）。
//   連携   … LINE の「アプリと連携」で届くリンク（?line=合言葉）を受け取り、ログイン後に「連携する」を
//            押してもらうまで、合言葉を15分だけ端末に覚えておく。
//   ログイン … 「LINEでログイン」を押すと LINE の画面へ行き、?code=…&state=… が付いて戻ってくる。
//            それをサーバーへ渡してログインする。はじめての人は合言葉を受け取り、メールのコードで
//            1回ログインすると結びつく（次からは LINE だけでログインできる）。
// 処理と保存はサーバー側（lib/lineLink.js・lib/lineLogin.js。入口は /api/auth/me）。

const PENDING_KEY = 'kimon-line-link';
const PENDING_TTL_MS = 15 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const API = '/api/auth/me?line=1';
/** 「LINEでログイン」「LINEと連携する」の行き先 */
export const LINE_LOGIN_START = '/api/auth/me?linelogin=start';
const LINE_LOGIN_FINISH = '/api/auth/me?linelogin=finish';

function readPending() {
  try {
    const p = JSON.parse(window.localStorage.getItem(PENDING_KEY) || 'null');
    if (TOKEN_RE.test(p?.token || '') && Date.now() - p.at < PENDING_TTL_MS) return p;
  } catch {
    // 保存領域が使えなくても通常どおり動く
  }
  return null;
}

export function readPendingLineLink() {
  return readPending()?.token || '';
}

/** 覚えている合言葉が、「LINEでログイン」から来たものか（メールアドレスの登録を案内する） */
export function isPendingFromLineLogin() {
  return Boolean(readPending()?.login);
}

/** 合言葉を15分だけ覚える。覚えられたら true */
export function storePendingLineLink(token, { login = false } = {}) {
  if (!TOKEN_RE.test(token || '')) return false;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ token, at: Date.now(), ...(login ? { login: true } : {}) }));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingLineLink() {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // 保存領域が使えなくても通常どおり動く
  }
}

/** アドレスに ?line=合言葉 が付いていたら覚えて、アドレスからは消す。付いていたら true */
export function capturePendingLineLink() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('line');
  if (token === null) return false;
  params.delete('line');
  const rest = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
  return storePendingLineLink(token);
}

/**
 * LINE の画面から戻ってきたとき（アドレスに state が付いている）: code と state を取り出して、アドレスからは消す。
 * 戻ってきたのでなければ null。利用者が LINE の画面で「キャンセル」したときは { cancelled: true }。
 */
export function captureLineLoginCallback() {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state');
  const code = params.get('code');
  if (!state || (!code && !params.has('error'))) return null;
  for (const key of ['code', 'state', 'error', 'error_description', 'friendship_status_changed', 'liffClientId', 'liffRedirectUri']) {
    params.delete(key);
  }
  const rest = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
  return code ? { code, state } : { cancelled: true };
}

/** LINE から受け取った code でログインする → { loggedIn } | { needEmail } | { error } */
export async function finishLineLogin({ code, state }) {
  try {
    const res = await fetch(LINE_LOGIN_FINISH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || 'failed' };
    if (data.needEmail) return { needEmail: storePendingLineLink(data.token, { login: true }) };
    return { loggedIn: Boolean(data.loggedIn), linked: Boolean(data.linked) };
  } catch {
    return { error: 'failed' };
  }
}

async function call(method, body) {
  const res = await fetch(API, {
    method,
    credentials: 'same-origin',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** 今のアカウントが LINE と連携しているか */
export async function fetchLineLinked() {
  const { ok, data } = await call('GET');
  return ok && Boolean(data.linked);
}

/** 合言葉の相手（LINE の表示名）を確かめる。期限切れなら { expired: true } */
export async function peekLineLink(token) {
  const { ok, status, data } = await call('POST', { token });
  if (ok) return { name: data.name || '', trusted: Boolean(data.trusted) };
  return status === 404 ? { expired: true } : { error: true };
}

export async function confirmLineLink(token) {
  const { ok, status } = await call('POST', { token, confirm: true });
  if (ok) return { linked: true };
  return status === 404 ? { expired: true } : { error: true };
}

export async function unlinkLine() {
  const { ok } = await call('DELETE');
  return ok;
}
