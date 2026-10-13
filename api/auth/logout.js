// api/auth/logout.js
// POST /api/auth/logout        → この端末のセッションを一覧から外し、Cookieを失効
// POST /api/auth/logout?all=1  → すべての端末のセッションを無効化（user.sv を進めて一覧を空に）＋この端末のCookieを失効
// POST /api/auth/logout?delete=1 （本文 { confirm: 'delete' }）→ アカウントを削除（lib/accountDeletion.js）＋この端末のCookieを失効
// （Vercel の Hobby プランは関数が12個までのため、ログアウトと削除を1つの関数にまとめている）
import { kv } from '../../lib/kv.js';
import { clearSessionCookie } from '../../lib/session.js';
import { getActiveSession, revokeSession, sessionVersionOf } from '../../lib/auth.js';
import { deleteAccount } from '../../lib/accountDeletion.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  res.setHeader('Cache-Control', 'no-store');
  const all = req.query?.all === '1' || req.query?.all === 'true';

  let active = null;
  try {
    active = await getActiveSession(req);
  } catch {
    active = null;
  }

  if (req.query?.delete === '1') {
    if (!active) return res.status(401).json({ error: 'not_logged_in' });
    // 押し間違いで消えないよう、画面で確かめた印が付いているときだけ受け付ける。
    if (req.body?.confirm !== 'delete') return res.status(400).json({ error: 'confirm_required' });
    // 運営者のアカウントは、招待の管理に使うので消せない。
    if (active.owner) return res.status(403).json({ error: 'owner_account' });
    try {
      await deleteAccount(active.email, active.user);
    } catch (err) {
      // キーや顧客情報はログに出さない。
      console.error('[auth] account delete failed', err?.type || err?.message || 'unknown');
      return res.status(502).json({ error: 'delete_failed' });
    }
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ ok: true, deleted: true });
  }

  if (all) {
    if (!active) {
      res.setHeader('Set-Cookie', clearSessionCookie());
      return res.status(401).json({ error: 'not_logged_in' });
    }
    await kv().set(`user:${active.email}`, { ...active.user, sv: sessionVersionOf(active.user) + 1, sessions: [] });
  } else if (active) {
    try {
      await revokeSession(active.email, active.sid);
    } catch {
      // 一覧の更新に失敗しても、この端末のCookieは必ず消す
    }
  }

  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ ok: true });
}
