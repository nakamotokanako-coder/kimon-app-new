// lib/billingApi/checkout.js
// POST /api/billing?action=checkout → プロ版（月額）の申し込みページ（Stripe Checkout）のURLを返す。ログイン必須。
import { getActiveSession } from '../auth.js';
import { buildOrigin } from '../session.js';
import { isPaidActive } from '../accessPolicy.js';
import { ensureCustomer, getProPrice, isBillingConfigured, stripe } from '../billing.js';

// Stripe のダッシュボードで、この申し込み導線を見分けるための目印。
const CHECKOUT_FLOW_LABEL = 'kimon_pro_monthly_qhzvktrm';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (!isBillingConfigured()) return res.status(503).json({ error: 'billing_unavailable' });

  const active = await getActiveSession(req);
  if (!active) return res.status(401).json({ error: 'not_logged_in' });
  if (isPaidActive(active.user) && active.user.stripeSubscriptionId) {
    return res.status(409).json({ error: 'already_subscribed' });
  }

  const origin = buildOrigin(req);
  if (!origin) return res.status(500).json({ error: 'origin_unavailable' });

  try {
    const price = await getProPrice();
    if (!price) return res.status(503).json({ error: 'price_not_found' });
    const customer = await ensureCustomer(active.email, active.user);
    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancel`,
      integration_identifier: CHECKOUT_FLOW_LABEL,
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    // キーや顧客情報はログに出さない。
    console.error('[billing] checkout failed', err?.type || err?.message || 'unknown');
    return res.status(502).json({ error: 'checkout_failed' });
  }
}
