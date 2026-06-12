// api/auth/logout.js
// POST /api/auth/logout → セッションCookieを失効
import { clearSessionCookie } from '../../lib/session.js';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ ok: true });
}
