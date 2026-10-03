// src/sync/userDataSync.js
// お気に入りと基準点を、アカウント（/api/auth/me?data=1。lib/userData.js）と端末の間で合わせる。
//
// 画面は今までどおり端末の保存（localStorage）を読み書きする。ここはその裏で、
//   - ログイン直後・アプリに戻ってきたとき: サーバーの内容を取りに行き、端末に反映する
//   - 端末で変えたとき: 少し待ってからサーバーへ送る
// だけを行う。通信に失敗しても画面は端末の保存で動き続け、次の機会に送り直す。
//
// 端末側の控え（SYNC_META_KEY）:
//   { email, favoritesAt, basePointAt, favoritesDirty, basePointDirty }
//   *At は「この端末が最後に受け取ったサーバーの版」。Dirty は「端末で変えて、まだ送れていない」。
import { MAP_SEARCH_STORAGE_KEY, favoriteKey } from '../reverseDirection/mapSearch.js';

export const BASE_POINT_STORAGE_KEY = 'kimon_go_base_point_v1';
export const SYNC_META_KEY = 'kimon_sync_meta_v1';
export const FAVORITES_CHANGED_EVENT = 'kimon-map-favorites-changed';
/** 端末で基準点を変えたとき（ReverseDirectionView が出す） */
export const BASE_POINT_CHANGED_EVENT = 'kimon-base-point-changed';
/** サーバーの内容を端末に反映したとき（画面はこれを受けて読み直す） */
export const USER_DATA_SYNCED_EVENT = 'kimon-userdata-synced';

const PUSH_DELAY_MS = 1500;
const ENDPOINT = '/api/auth/me?data=1';

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const readMeta = () => readJson(SYNC_META_KEY, null) || {};
const readLocalFavorites = () => {
  const list = readJson(MAP_SEARCH_STORAGE_KEY, []);
  return Array.isArray(list) ? list : [];
};
/** 現在地（gps）の基準点は端末ごとのものなので送らない */
const syncableBasePoint = (bp) => (bp && (bp.mode === 'favorite' || bp.mode === 'search') && bp.location ? bp : null);

/** 2つのお気に入りを足し合わせる（先のリストを優先。同じ場所は1件に） */
export function unionFavorites(first, second) {
  const seen = new Set();
  const out = [];
  for (const fav of [...(first || []), ...(second || [])]) {
    if (!fav || !Number.isFinite(Number(fav.latitude)) || !Number.isFinite(Number(fav.longitude))) continue;
    const key = favoriteKey(fav);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fav);
  }
  return out;
}

const sameFavorites = (a, b) => a.length === b.length && a.every((f, i) => JSON.stringify(f) === JSON.stringify(b[i]));

/**
 * サーバーの内容と端末の内容から、「端末に書くもの」と「サーバーへ送るもの」を決める（通信はしない）。
 * @returns {{ local: { favorites?: object[], basePoint?: object }, push: object, meta: object }}
 */
export function planSync({ email, server, meta, localFavorites, localBasePoint }) {
  const sameAccount = meta.email === email;
  const firstTime = !meta.email;
  const local = {};
  const push = {};
  const nextMeta = { email, favoritesAt: server.favoritesAt ?? null, basePointAt: server.basePointAt ?? null };

  // ---- お気に入り ----
  if (firstTime) {
    // この端末で初めて同期する: どちらも失わないよう足し合わせる。
    const merged = unionFavorites(server.favorites, localFavorites);
    if (!sameFavorites(merged, localFavorites)) local.favorites = merged;
    if (!sameFavorites(merged, server.favorites || [])) push.favorites = merged;
  } else if (!sameAccount) {
    // 別のアカウントでログインし直した: 前の人のお気に入りを混ぜない。
    local.favorites = server.favorites || [];
  } else if (meta.favoritesDirty) {
    push.favorites = localFavorites;
  } else if ((server.favoritesAt ?? null) !== (meta.favoritesAt ?? null)) {
    local.favorites = server.favorites || [];
  }
  if (push.favorites) push.favoritesBase = sameAccount ? (meta.favoritesAt ?? null) : (server.favoritesAt ?? null);

  // ---- 基準点 ----
  const mine = syncableBasePoint(localBasePoint);
  if (sameAccount && meta.basePointDirty && mine) {
    push.basePoint = mine;
  } else if (server.basePoint && (!sameAccount || (server.basePointAt ?? null) !== (meta.basePointAt ?? null))) {
    // 現在地を基準点にしている端末は、そのまま（他の端末の選択で上書きしない）。
    if (!localBasePoint || localBasePoint.mode !== 'gps') local.basePoint = server.basePoint;
  } else if (firstTime && !server.basePoint && mine) {
    push.basePoint = mine;
  }

  return { local, push, meta: nextMeta };
}

let currentEmail = null;
let startedAt = 0;
let pushTimer = null;
let running = null;
let applying = false; // サーバーの内容を端末に書いている間は、自分の書き込みを「端末での変更」と数えない

function applyLocal(local) {
  applying = true;
  try {
    if (local.favorites) {
      writeJson(MAP_SEARCH_STORAGE_KEY, local.favorites);
      window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT, { detail: local.favorites }));
    }
    if (local.basePoint) writeJson(BASE_POINT_STORAGE_KEY, local.basePoint);
    if (local.favorites || local.basePoint) {
      window.dispatchEvent(new CustomEvent(USER_DATA_SYNCED_EVENT, { detail: { favorites: Boolean(local.favorites), basePoint: Boolean(local.basePoint) } }));
    }
  } finally {
    applying = false;
  }
}

async function request(method, body) {
  const res = await fetch(ENDPOINT, {
    method,
    credentials: 'same-origin',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`userdata_${res.status}`);
  return res.json();
}

async function runSync(email) {
  const server = await request('GET');
  const plan = planSync({
    email,
    server,
    meta: readMeta(),
    localFavorites: readLocalFavorites(),
    localBasePoint: readJson(BASE_POINT_STORAGE_KEY, null),
  });
  applyLocal(plan.local);
  let meta = plan.meta;
  if (Object.keys(plan.push).length > 0) {
    const saved = await request('PUT', plan.push);
    // サーバーが足し合わせた結果（別の端末と重なったとき）を端末にも反映する。
    if (plan.push.favorites && !sameFavorites(saved.favorites || [], readLocalFavorites())) {
      applyLocal({ favorites: saved.favorites || [] });
    }
    meta = { email, favoritesAt: saved.favoritesAt ?? null, basePointAt: saved.basePointAt ?? null };
  }
  // 通信の途中で端末側がまた変わっていたら、その印は残す（次の送信で送る）。
  const latest = readMeta();
  writeJson(SYNC_META_KEY, {
    ...meta,
    ...(latest.dirtySince && latest.dirtySince > startedAt ? { favoritesDirty: latest.favoritesDirty, basePointDirty: latest.basePointDirty, dirtySince: latest.dirtySince } : {}),
  });
}

/** サーバーと合わせる。同時に2回は走らせない。失敗しても投げない（次の機会にやり直す）。 */
export function syncUserData(email = currentEmail) {
  if (!email || typeof window === 'undefined') return Promise.resolve(false);
  if (running) return running;
  startedAt = Date.now();
  running = runSync(email)
    .then(() => true)
    .catch(() => false)
    .finally(() => { running = null; });
  return running;
}

function markDirty(field) {
  if (applying || !currentEmail) return;
  const meta = readMeta();
  if (meta.email !== currentEmail) return; // まだ一度も同期していない間は、最初の同期が足し合わせる
  writeJson(SYNC_META_KEY, { ...meta, [`${field}Dirty`]: true, dirtySince: Date.now() });
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => { syncUserData(); }, PUSH_DELAY_MS);
}

/**
 * 同期を始める。戻り値は後始末の関数。
 * @param {string} email - ログイン中のメールアドレス
 */
export function startUserDataSync(email) {
  currentEmail = email;
  const onFavorites = () => markDirty('favorites');
  const onBasePoint = () => markDirty('basePoint');
  let lastPull = Date.now();
  const onVisible = () => {
    // 別の端末での変更を取り込む。戻ってくるたびに通信しないよう、1分に1回まで。
    if (document.visibilityState !== 'visible' || Date.now() - lastPull < 60000) return;
    lastPull = Date.now();
    syncUserData();
  };
  window.addEventListener(FAVORITES_CHANGED_EVENT, onFavorites);
  window.addEventListener(BASE_POINT_CHANGED_EVENT, onBasePoint);
  document.addEventListener('visibilitychange', onVisible);
  syncUserData(email);
  return () => {
    window.removeEventListener(FAVORITES_CHANGED_EVENT, onFavorites);
    window.removeEventListener(BASE_POINT_CHANGED_EVENT, onBasePoint);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearTimeout(pushTimer);
    currentEmail = null;
  };
}
