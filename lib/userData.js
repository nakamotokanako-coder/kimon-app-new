// lib/userData.js
// お気に入りと基準点をアカウントに保存して、端末をまたいで使えるようにする。
//
//   保存先: KV の userdata:{email}（会員情報 user:{email} とは別のキー。決済の Webhook の書き込みと競合させない）
//   形: { favorites: [...], favoritesAt, basePoint: {...}|null, basePointAt }
//   入口: GET / PUT /api/auth/me?data=1（Hobby プランの関数12個制限のため me に同居。処理はこのファイル）
//
// 受け取った内容はそのまま保存せず、知っている項目だけを型と長さを確かめて取り込む。
import { kv } from './kv.js';

export const MAX_FAVORITES = 100;
const FAVORITE_TEXT_FIELDS = ['name', 'label', 'branch', 'brand', 'operator', 'addressLine', 'subLabel'];
const BASE_POINT_MODES = new Set(['favorite', 'search']); // 現在地（gps）は端末ごとのものなので保存しない
const TEXT_MAX = 120;

const text = (v) => (typeof v === 'string' ? v.trim().slice(0, TEXT_MAX) : '');
const validLatLng = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** 同じ場所かどうかの鍵（画面側 mapSearch.js の favoriteKey と同じ: 小数5桁） */
export function favoriteKey(place) {
  return `${Number(place.latitude).toFixed(5)},${Number(place.longitude).toFixed(5)}`;
}

export function sanitizeFavorite(raw) {
  const latitude = Number(raw?.latitude);
  const longitude = Number(raw?.longitude);
  if (!validLatLng(latitude, longitude)) return null;
  const out = { name: text(raw.name) || 'お気に入り', latitude, longitude, kind: raw.kind === 'home' ? 'home' : 'spot' };
  for (const f of FAVORITE_TEXT_FIELDS.slice(1)) {
    const v = text(raw[f]);
    if (v) out[f] = v;
  }
  return out;
}

/** 配列でなければ null。同じ場所は最初の1件だけ残し、上限で切る。 */
export function sanitizeFavorites(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const fav = sanitizeFavorite(raw);
    if (!fav || seen.has(favoriteKey(fav))) continue;
    seen.add(favoriteKey(fav));
    out.push(fav);
    if (out.length >= MAX_FAVORITES) break;
  }
  return out;
}

export function sanitizeBasePoint(raw) {
  const latitude = Number(raw?.location?.latitude);
  const longitude = Number(raw?.location?.longitude);
  if (!BASE_POINT_MODES.has(raw?.mode) || !validLatLng(latitude, longitude)) return null;
  return {
    mode: raw.mode,
    location: { name: text(raw.location.name) || '基準点', latitude, longitude },
    selectedFavoriteId: text(raw.selectedFavoriteId) || null,
  };
}

/** 2つのお気に入りを足し合わせる（先のリストを優先。同じ場所は1件に） */
export function mergeFavorites(first, second) {
  return sanitizeFavorites([...(first || []), ...(second || [])]) || [];
}

const EMPTY = { favorites: [], favoritesAt: null, basePoint: null, basePointAt: null };

export async function loadUserData(email) {
  return { ...EMPTY, ...((await kv().get(`userdata:${email}`)) || {}) };
}

/**
 * 保存する。patch に含まれる項目だけを書き換える。
 *   favorites: この端末が最後に受け取った版（favoritesBase）とサーバーの版が違えば、別の端末が先に書き換えているので
 *              上書きせず足し合わせる（どちらかの端末で追加した場所を失わないため）。
 *   basePoint: 後から保存したほうを採る。
 * @returns {Promise<object>} 保存後の全体
 */
export async function saveUserData(email, patch, now = Date.now()) {
  const current = await loadUserData(email);
  const next = { ...current };
  let changed = false;

  if ('favorites' in patch) {
    const incoming = sanitizeFavorites(patch.favorites);
    if (incoming === null) throw new Error('bad_favorites');
    const conflict = current.favoritesAt !== null && current.favoritesAt !== (patch.favoritesBase ?? null);
    next.favorites = conflict ? mergeFavorites(incoming, current.favorites) : incoming;
    next.favoritesAt = now;
    changed = true;
  }
  if ('basePoint' in patch) {
    const incoming = sanitizeBasePoint(patch.basePoint);
    if (incoming === null) throw new Error('bad_base_point');
    next.basePoint = incoming;
    next.basePointAt = now;
    changed = true;
  }
  if (changed) await kv().set(`userdata:${email}`, next);
  return next;
}

/** GET / PUT /api/auth/me?data=1 の処理。active は getActiveSession の結果。 */
export async function handleUserData(req, res, active) {
  if (!active) return res.status(401).json({ error: 'not_logged_in' });
  // 端末間の同期は全機能を使える人向け（lib/accessPolicy.js。ベータ期間はログインで可）。
  if (!active.full) return res.status(403).json({ error: 'forbidden' });

  if (req.method === 'GET') return res.status(200).json(await loadUserData(active.email));

  // PUT: JSON だけ受け付ける（他サイトのフォームからの送信を受けない）。
  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ error: 'json_required' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : null;
  if (!body || (!('favorites' in body) && !('basePoint' in body))) return res.status(400).json({ error: 'bad_request' });
  try {
    return res.status(200).json(await saveUserData(active.email, body));
  } catch (err) {
    if (err.message === 'bad_favorites' || err.message === 'bad_base_point') return res.status(400).json({ error: err.message });
    throw err;
  }
}
