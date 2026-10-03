// api/auth/logout.js
// POST /api/auth/logout        → この端末のセッションを一覧から外し、Cookieを失効
// POST /api/auth/logout?all=1  → すべての端末のセッションを無効化（user.sv を進めて一覧を空に）＋この端末のCookieを失効
// （Vercel の Hobby プランは関数が12個までのため、2つのログアウトを1つの関数にまとめている）
import { kv } from '../../lib/kv.js';
import { clearSessionCookie } from '../../lib/session.js';
import { getActiveSession, revokeSession, sessionVersionOf } from '../../lib/auth.js';

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
