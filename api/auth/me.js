// api/auth/me.js
// GET /api/auth/me → { loggedIn, email, status, paidUntil, full, accessMode }（未ログインは loggedIn:false）
//   full: 全機能を使えるか（lib/accessPolicy.js の判定。ベータ期間はログインで true）
// GET / PUT / DELETE /api/auth/me?data=1 → アカウントに保存したお気に入りと基準点（lib/userData.js。利用者がオンにしたときだけ）
//   （Vercel の Hobby プランは関数が12個までのため、この関数に同居させている）
import { getActiveSession } from '../../lib/auth.js';
import { ACCESS_MODE } from '../../lib/accessPolicy.js';
import { isBillingConfigured } from '../../lib/billing.js';
import { handleUserData } from '../../lib/userData.js';

export default async function handler(req, res) {
  const wantsData = req.query?.data === '1';
  if (req.method !== 'GET' && !(wantsData && (req.method === 'PUT' || req.method === 'DELETE'))) {
    res.setHeader('Allow', wantsData ? 'GET, PUT, DELETE' : 'GET');
    return res.status(405).end();
  }

  res.setHeader('Cache-Control', 'no-store');

  const active = await getActiveSession(req);
  if (wantsData) return handleUserData(req, res, active);
  if (!active) return res.status(200).json({ loggedIn: false, full: false, accessMode: ACCESS_MODE });

  return res.status(200).json({
    loggedIn: true,
    email: active.email,
    status: active.status,
    paidUntil: active.paidUntil,
    full: active.full,
    accessMode: ACCESS_MODE,
    // 決済まわりの表示用（Stripe の顧客IDなどは返さない）
    billing: {
      available: isBillingConfigured(),
      subscribed: active.status === 'paid' && Boolean(active.user.stripeSubscriptionId),
      cancelAtPeriodEnd: Boolean(active.user.cancelAtPeriodEnd),
    },
  });
}
