// scripts/stripe_setup.mjs
// Stripe 側の初期設定を1回で行う（何度実行しても重複して作らない）。テスト環境でも本番でも同じ手順。
//
//   実行: node --env-file=.env.local scripts/stripe_setup.mjs [--webhook-secret-file <path>]
//   必要な環境変数: STRIPE_SECRET_KEY（または STRIPE_RESTRICTED_KEY）
//
// 作るもの:
//   1. 商品「奇門遁甲Z プロ版」と価格（月額980円・税込。lookup_key = kimon_pro_monthly）
//   2. カスタマーポータルの設定（解約は期間の終わりに・カード変更・領収書）
//   3. Webhook の送信先（https://<本番ドメイン>/api/billing?action=webhook）
//      Webhook の署名シークレットは画面に出さず、--webhook-secret-file で指定したファイルに書き出す
//      （Vercel の環境変数 STRIPE_WEBHOOK_SECRET に登録して使う。新しく作ったときだけ取得できる）
import Stripe from 'stripe';
import { writeFileSync } from 'node:fs';
import { PRO_PRICE_LOOKUP_KEY } from '../lib/billing.js';
import { WEBHOOK_EVENTS } from '../lib/billingApi/webhook.js';

const APP_URL = (process.env.APP_URL || 'https://kimon-tonko.vercel.app').replace(/\/+$/, '');
const WEBHOOK_URL = `${APP_URL}/api/billing?action=webhook`;
const PRODUCT_NAME = '奇門遁甲Z プロ版';
const PRICE_JPY = 980;

const key = process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('STRIPE_SECRET_KEY が見つかりません。node --env-file=.env.local で実行してください。');
  process.exit(1);
}
const mode = key.includes('_live_') ? '本番' : 'テスト';
const stripe = new Stripe(key);
const argFile = process.argv.indexOf('--webhook-secret-file');
const secretFile = argFile > -1 ? process.argv[argFile + 1] : null;

console.log(`Stripe の設定を確認します（${mode}環境）`);

// 1. 商品と価格
let price = (await stripe.prices.list({ lookup_keys: [PRO_PRICE_LOOKUP_KEY], active: true, limit: 1 })).data[0];
if (price) {
  console.log(`- 価格: 既にあります（${price.unit_amount}${price.currency} / ${price.recurring?.interval}）`);
} else {
  const product = await stripe.products.create({ name: PRODUCT_NAME });
  price = await stripe.prices.create({
    product: product.id,
    currency: 'jpy',
    unit_amount: PRICE_JPY,
    recurring: { interval: 'month' },
    tax_behavior: 'inclusive',
    lookup_key: PRO_PRICE_LOOKUP_KEY,
  });
  console.log(`- 価格: 作成しました（月額${PRICE_JPY}円・税込）`);
}

// 2. カスタマーポータル（解約・カード変更・領収書）
const portals = await stripe.billingPortal.configurations.list({ limit: 5 });
if (portals.data.some((c) => c.is_default || c.active)) {
  console.log('- カスタマーポータル: 既にあります');
} else {
  await stripe.billingPortal.configurations.create({
    business_profile: { headline: '奇門遁甲Z プロ版のお支払い' },
    features: {
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
    },
  });
  console.log('- カスタマーポータル: 作成しました（解約は期間の終わりに反映）');
}

// 3. Webhook の送信先
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const existing = endpoints.data.find((e) => e.url === WEBHOOK_URL);
if (existing) {
  const missing = WEBHOOK_EVENTS.filter((t) => !existing.enabled_events.includes(t));
  if (missing.length) {
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: WEBHOOK_EVENTS });
    console.log('- Webhook: 既にあります（購読するイベントを更新しました）');
  } else {
    console.log('- Webhook: 既にあります');
  }
  if (secretFile) console.log('  ※ 署名シークレットは作成時にしか取得できません。ファイルは書き出していません。');
} else {
  const created = await stripe.webhookEndpoints.create({ url: WEBHOOK_URL, enabled_events: WEBHOOK_EVENTS });
  if (secretFile) {
    writeFileSync(secretFile, created.secret, { mode: 0o600 });
    console.log('- Webhook: 作成しました。署名シークレットを指定のファイルに書き出しました（画面には出していません）');
  } else {
    console.log('- Webhook: 作成しました。署名シークレットは Stripe のダッシュボードで確認し、STRIPE_WEBHOOK_SECRET に登録してください');
  }
}

console.log(`送信先: ${WEBHOOK_URL}`);
