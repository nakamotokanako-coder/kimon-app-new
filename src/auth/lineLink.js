// LINE との連携（画面側）。LINE の「アプリと連携」で届くリンク（?line=合言葉）を受け取り、
// ログイン後に「連携する」を押してもらうまで、合言葉を15分だけ端末に覚えておく。
// 結びつけの処理と保存はサーバー側（lib/lineLink.js。入口は /api/auth/me?line=1）。

const PENDING_KEY = 'kimon-line-link';
const PENDING_TTL_MS = 15 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const API = '/api/auth/me?line=1';

export function readPendingLineLink() {
  try {
    const p = JSON.parse(window.localStorage.getItem(PENDING_KEY) || 'null');
    if (TOKEN_RE.test(p?.token || '') && Date.now() - p.at < PENDING_TTL_MS) return p.token;
  } catch {
    // 保存領域が使えなくても通常どおり動く
  }
  return '';
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
  if (!TOKEN_RE.test(token)) return false;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {
    return false;
  }
  return true;
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
  if (ok) return { name: data.name || '' };
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
