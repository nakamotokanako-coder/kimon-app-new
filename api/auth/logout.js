// api/auth/logout.js
// POST /api/auth/logout → この端末のセッションを一覧から外し、Cookieを失効
import { clearSessionCookie } from '../../lib/session.js';
import { getActiveSession, revokeSession } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  try {
    const active = await getActiveSession(req);
    if (active) await revokeSession(active.email, active.sid);
  } catch {
    // 一覧の更新に失敗しても、この端末のCookieは必ず消す
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ ok: true });
}
