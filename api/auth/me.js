// api/auth/me.js
// GET /api/auth/me → { loggedIn, email, status, paidUntil, full, accessMode }（未ログインは loggedIn:false）
//   full: 全機能を使えるか（lib/accessPolicy.js の判定。ベータ期間はログインで true）
// GET / PUT / DELETE /api/auth/me?data=1 → アカウントに保存したお気に入りと基準点（lib/userData.js。利用者がオンにしたときだけ）
//   （Vercel の Hobby プランは関数が12個までのため、この関数に同居させている）
import { getActiveSession } from '../../lib/auth.js';
import { ACCESS_MODE } from '../../lib/accessPolicy.js';
import { isBillingConfigured } from '../../lib/billing.js';
import { handleUserData } from '../../lib/userData.js';
import { handleInvites } from '../../lib/invite.js';

export default async function handler(req, res) {
  const wantsData = req.query?.data === '1';
  // 招待の一覧（運営者だけ。lib/invite.js）
  const wantsInvites = req.query?.invites === '1';
  const allowed = wantsData ? ['GET', 'PUT', 'DELETE'] : (wantsInvites ? ['GET', 'PUT'] : ['GET']);
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    return res.status(405).end();
  }

  res.setHeader('Cache-Control', 'no-store');

  const active = await getActiveSession(req);
  if (wantsData) return handleUserData(req, res, active);
  if (wantsInvites) return handleInvites(req, res, active);
  if (!active) return res.status(200).json({ loggedIn: false, full: false, accessMode: ACCESS_MODE });

  return res.status(200).json({
    loggedIn: true,
    email: active.email,
    status: active.status,
    paidUntil: active.paidUntil,
    // 有料会員のプラン（'monthly' | 'annual'）。有料でなければ null。
    plan: active.status === 'paid' ? (active.user.plan || 'monthly') : null,
    full: active.full,
    // 招待した人（課金を始めたあともずっと全機能を使える）。運営者は招待の一覧を管理できる。
    invited: Boolean(active.invited),
    owner: Boolean(active.owner),
    accessMode: ACCESS_MODE,
    // 決済まわりの表示用（Stripe の顧客IDなどは返さない）
    billing: {
      available: isBillingConfigured(),
      subscribed: active.status === 'paid' && Boolean(active.user.stripeSubscriptionId),
      cancelAtPeriodEnd: Boolean(active.user.cancelAtPeriodEnd),
    },
  });
}
