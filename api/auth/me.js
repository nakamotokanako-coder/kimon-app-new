// api/auth/me.js
// GET /api/auth/me → { loggedIn, email, status }（未ログインは loggedIn:false）
import { kv } from '../../lib/kv.js';
import { getSessionFromReq } from '../../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  res.setHeader('Cache-Control', 'no-store');

  const secret = process.env.SESSION_SECRET;
  const session = secret ? getSessionFromReq(req, secret) : null;
  if (!session) return res.status(200).json({ loggedIn: false });

  let status = 'free';
  try {
    const user = await kv().get(`user:${session.email}`);
    if (user && typeof user.status === 'string') status = user.status;
  } catch {
    status = 'free';
  }

  return res.status(200).json({ loggedIn: true, email: session.email, status });
}
