// api/billing.js
// 決済（Stripe）の入口を1つにまとめたもの。Vercel の Hobby プランは関数が12個までのため、
// 申し込み・解約ページ・Webhook を action で振り分ける。
//   POST /api/billing?action=checkout → 申し込みページのURL（lib/billingApi/checkout.js）
//   POST /api/billing?action=portal   → 解約・カード変更ページのURL（lib/billingApi/portal.js）
//   POST /api/billing?action=webhook  → Stripe からの通知（lib/billingApi/webhook.js）
//
// Webhook の署名検証には加工前の本文が要るため、この関数は本文の自動解析を止めている。
// checkout / portal は本文を使わない。
import checkout from '../lib/billingApi/checkout.js';
import portal from '../lib/billingApi/portal.js';
import webhook from '../lib/billingApi/webhook.js';

export const config = { api: { bodyParser: false } };

const ACTIONS = { checkout, portal, webhook };

export default async function handler(req, res) {
  const action = typeof req.query?.action === 'string' ? req.query.action : '';
  const fn = ACTIONS[action];
  if (!fn) return res.status(404).json({ error: 'unknown_action' });
  return fn(req, res);
}
