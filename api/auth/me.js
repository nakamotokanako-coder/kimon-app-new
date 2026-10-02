// api/auth/me.js
// GET /api/auth/me → { loggedIn, email, status, full, accessMode }（未ログインは loggedIn:false）
//   full: 全機能を使えるか（lib/accessPolicy.js の判定。ベータ期間はログインで true）
import { getActiveSession } from '../../lib/auth.js';
import { ACCESS_MODE } from '../../lib/accessPolicy.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  res.setHeader('Cache-Control', 'no-store');

  const active = await getActiveSession(req);
  if (!active) return res.status(200).json({ loggedIn: false, full: false, accessMode: ACCESS_MODE });

  return res.status(200).json({
    loggedIn: true,
    email: active.email,
    status: active.status,
    full: active.full,
    accessMode: ACCESS_MODE,
  });
}
