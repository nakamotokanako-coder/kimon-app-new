// lib/invite.js
// 招待した人だけが使えるようにする仕組み。
//
//   保存先: KV の access:invites → { restricted: boolean, emails: string[] }
//   運営者: 環境変数 OWNER_EMAIL のメールアドレス。常に使え、招待の一覧を管理できる（設定画面）。
//
//   restricted = true のとき:
//     - 招待した人（と運営者）だけがログインできる。ほかの人にはログインのメールを送らない
//     - すでにログイン中でも、招待されていない人は次の操作からログアウト扱いになる
//   招待した人は、課金を始めたあと（ACCESS_MODE='paid'）も、ずっと全機能を使える（年額の機能も含む）。
//   restricted = false でも、この「ずっと使える」は有効（招待＝特別に使える人の一覧）。
//
// 入口: GET / PUT /api/auth/me?invites=1（運営者だけ。関数12個制限のため me に同居）
import { kv } from './kv.js';

const KEY = 'access:invites';
const MAX_INVITES = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CACHE_MS = 20 * 1000; // ログイン中の確認のたびに読みに行かないための、短い覚え書き

let cache = null;

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function ownerEmail(env = process.env) {
  return normalizeEmail(env.OWNER_EMAIL);
}

/** テスト用: 覚え書きを消す */
export function clearInviteCache() {
  cache = null;
}

export async function loadInvites({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const stored = (await kv().get(KEY)) || {};
  const value = {
    restricted: Boolean(stored.restricted),
    emails: Array.isArray(stored.emails) ? stored.emails.map(normalizeEmail).filter(Boolean) : [],
  };
  cache = { at: Date.now(), value };
  return value;
}

async function saveInvites(value) {
  await kv().set(KEY, value);
  cache = { at: Date.now(), value };
  return value;
}

/** 招待されているか（運営者は常に true） */
export function isInvited(email, invites, env = process.env) {
  const target = normalizeEmail(email);
  if (!target) return false;
  return target === ownerEmail(env) || invites.emails.includes(target);
}

/** この人はログインしてよいか（招待制でなければ誰でも。招待制なら招待した人だけ） */
export function mayLogin(email, invites, env = process.env) {
  return !invites.restricted || isInvited(email, invites, env);
}

/**
 * 一覧を変える。patch: { restricted?: boolean, add?: string, remove?: string }
 * @returns {Promise<{restricted:boolean, emails:string[]}>}
 */
export async function updateInvites(patch) {
  const current = await loadInvites({ fresh: true });
  const next = { restricted: current.restricted, emails: [...current.emails] };
  if (typeof patch.restricted === 'boolean') next.restricted = patch.restricted;
  if (patch.add !== undefined) {
    const email = normalizeEmail(patch.add);
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) throw new Error('invalid_email');
    if (!next.emails.includes(email)) {
      if (next.emails.length >= MAX_INVITES) throw new Error('too_many');
      next.emails.push(email);
    }
  }
  if (patch.remove !== undefined) {
    const email = normalizeEmail(patch.remove);
    next.emails = next.emails.filter((e) => e !== email);
  }
  return saveInvites(next);
}

/** GET / PUT /api/auth/me?invites=1 の処理（運営者だけ）。active は getActiveSession の結果。 */
export async function handleInvites(req, res, active, env = process.env) {
  if (!active) return res.status(401).json({ error: 'not_logged_in' });
  const owner = ownerEmail(env);
  if (!owner || active.email !== owner) return res.status(403).json({ error: 'forbidden' });

  if (req.method === 'GET') return res.status(200).json(await loadInvites({ fresh: true }));

  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ error: 'json_required' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : null;
  if (!body || !['restricted', 'add', 'remove'].some((k) => k in body)) return res.status(400).json({ error: 'bad_request' });
  try {
    return res.status(200).json(await updateInvites(body));
  } catch (err) {
    if (err.message === 'invalid_email' || err.message === 'too_many') return res.status(400).json({ error: err.message });
    throw err;
  }
}
