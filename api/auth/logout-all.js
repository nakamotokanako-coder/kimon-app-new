// api/auth/logout-all.js
// POST /api/auth/logout-all → すべての端末のセッションを無効化（user.sv を進めて一覧を空に）＋この端末のCookieを失効
import { kv } from '../../lib/kv.js';
import { getActiveSession, sessionVersionOf } from '../../lib/auth.js';
import { clearSessionCookie } from '../../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  res.setHeader('Cache-Control', 'no-store');

  const active = await getActiveSession(req);
  if (!active) {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(401).json({ error: 'not_logged_in' });
  }

  await kv().set(`user:${active.email}`, { ...active.user, sv: sessionVersionOf(active.user) + 1, sessions: [] });
  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ ok: true });
}
