// lib/billingApi/portal.js
// POST /api/billing?action=portal → Stripe のカスタマーポータル（解約・カード変更・領収書）のURLを返す。ログイン必須。
import { getActiveSession } from '../auth.js';
import { buildOrigin } from '../session.js';
import { isBillingConfigured, stripe } from '../billing.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (!isBillingConfigured()) return res.status(503).json({ error: 'billing_unavailable' });

  const active = await getActiveSession(req);
  if (!active) return res.status(401).json({ error: 'not_logged_in' });
  const customer = active.user.stripeCustomerId;
  if (!customer) return res.status(400).json({ error: 'no_subscription' });

  const origin = buildOrigin(req);
  if (!origin) return res.status(500).json({ error: 'origin_unavailable' });

  try {
    const session = await stripe().billingPortal.sessions.create({ customer, return_url: `${origin}/?billing=portal` });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[billing] portal failed', err?.type || err?.message || 'unknown');
    return res.status(502).json({ error: 'portal_failed' });
  }
}
