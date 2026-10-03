// lib/billingApi/webhook.js
// POST /api/billing?action=webhook → Stripe からの通知（Webhook）を受けて、会員状態を更新する。
//
//   - 署名（STRIPE_WEBHOOK_SECRET）を必ず検証する。検証には加工前の本文（raw body）が要るため、
//     api/billing.js で本文の自動解析を止めている（config.api.bodyParser = false）
//   - 通知の中身をそのまま信じず、Stripe からサブスクを取得し直して反映する（lib/billing.js）
//   - 同じ通知が何度届いても結果は同じ（反映は冪等）
//
// 扱うイベント:
//   checkout.session.completed / checkout.session.async_payment_succeeded … 申し込み完了
//   customer.subscription.created / updated / deleted … 更新・解約予約・解約・支払い遅延
//   invoice.paid / invoice.payment_failed … 毎月の更新の成否
//   charge.refunded / charge.dispute.created / radar.early_fraud_warning.created … 返金・異議・不正の警告
import { kv } from '../kv.js';
import { stripe, syncCustomer, syncSubscription } from '../billing.js';

/** この Webhook が購読するイベント（scripts/stripe_setup.mjs もこの一覧で登録する） */
export const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'radar.early_fraud_warning.created',
];

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  if (typeof req.rawBody === 'string' || Buffer.isBuffer(req.rawBody)) return Buffer.from(req.rawBody);
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

function idOf(value) {
  return typeof value === 'string' ? value : value?.id || null;
}

/** 返金・異議・不正の警告: 運営が確認できるよう記録する（180日保存） */
async function recordRiskEvent(event, customerId) {
  await kv().set(
    `billing_alert:${event.created}:${event.id}`,
    { type: event.type, customer: customerId, at: new Date(event.created * 1000).toISOString() },
    { ex: 180 * 24 * 60 * 60 },
  );
}

export async function handleEvent(event) {
  const object = event.data?.object || {};
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      // 支払いが確定したものだけ反映する。
      if (object.mode !== 'subscription' || object.payment_status === 'unpaid') return 'ignored';
      const sub = idOf(object.subscription);
      if (sub) await syncSubscription(sub);
      return 'synced';
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncSubscription(object.id);
      return 'synced';
    case 'invoice.paid':
    case 'invoice.payment_failed':
      await syncCustomer(idOf(object.customer));
      return 'synced';
    case 'charge.refunded':
    case 'charge.dispute.created': {
      let customerId = idOf(object.customer);
      if (!customerId && object.charge) {
        customerId = idOf((await stripe().charges.retrieve(idOf(object.charge))).customer);
      }
      await recordRiskEvent(event, customerId);
      await syncCustomer(customerId);
      return 'recorded';
    }
    case 'radar.early_fraud_warning.created': {
      const charge = object.charge ? await stripe().charges.retrieve(idOf(object.charge)) : null;
      await recordRiskEvent(event, idOf(charge?.customer));
      return 'recorded';
    }
    default:
      return 'ignored';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'webhook_not_configured' });

  let event;
  try {
    const raw = await readRawBody(req);
    event = stripe().webhooks.constructEvent(raw, req.headers['stripe-signature'], secret);
  } catch {
    return res.status(400).json({ error: 'invalid_signature' });
  }

  try {
    const result = await handleEvent(event);
    return res.status(200).json({ received: true, result });
  } catch (err) {
    // 失敗したら 500 を返して Stripe に再送させる。
    console.error('[billing] webhook handling failed', event.type, err?.type || err?.message || 'unknown');
    return res.status(500).json({ error: 'handler_failed' });
  }
}
