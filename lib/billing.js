// lib/billing.js
// Stripe の月額サブスク（プロ版・月額980円）と、アプリの会員状態（user:{email}）の橋渡し。
//
//   - 申し込み: Checkout Sessions（mode: 'subscription'）。支払い方法は Stripe に任せる（payment_method_types は渡さない）
//   - 解約・カード変更: Stripe のカスタマーポータル
//   - 状態の反映: Webhook（api/billing/webhook.js）がサブスクの状態を取得し直して user に書き込む
//     成功ページの表示では有料にしない（決済は非同期に確定するため）
//   - Stripe の顧客IDとアプリのユーザーの対応は KV の stripe_customer:{id} → email で持つ（metadata に頼らない）
//
// 有料の判定は lib/accessPolicy.js（status==='paid' かつ paidUntil が未来）。
// ここでは paidUntil を「今の請求期間の終わり＋猶予」にする。更新が止まれば期限切れで自動的に無料に戻る。
import Stripe from 'stripe';
import { kv } from './kv.js';

export const PRO_PRICE_LOOKUP_KEY = 'kimon_pro_monthly';
/** 更新日の決済が少し遅れても途切れないようにする猶予 */
const GRACE_MS = 24 * 60 * 60 * 1000;

let client = null;

/** テスト用: Stripe クライアントを差し替える */
export function setStripeClient(fake) {
  client = fake;
}

/** Stripe クライアント（インスタンス）。キーは環境変数から読む（コードに書かない・ログに出さない）。 */
export function stripe(env = process.env) {
  if (client) return client;
  // 権限を絞った制限付きキー（rk_）があればそれを優先する。
  const key = env.STRIPE_RESTRICTED_KEY || env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('stripe_not_configured');
  client = new Stripe(key);
  return client;
}

export function isBillingConfigured(env = process.env) {
  return Boolean(env.STRIPE_RESTRICTED_KEY || env.STRIPE_SECRET_KEY);
}

/** プロ版の価格（lookup_key で引く。価格IDをコードや環境変数に持たない） */
export async function getProPrice() {
  const list = await stripe().prices.list({ lookup_keys: [PRO_PRICE_LOOKUP_KEY], active: true, limit: 1 });
  return list.data[0] || null;
}

/** ユーザーの Stripe 顧客を用意する（無ければ作り、対応を KV に保存） */
export async function ensureCustomer(email, user) {
  if (user?.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({ email });
  await kv().set(`stripe_customer:${customer.id}`, email);
  await kv().set(`user:${email}`, { ...user, stripeCustomerId: customer.id });
  return customer.id;
}

/** サブスクの今の請求期間の終わり（秒）。API の版によって置き場所が違うので両方見る。 */
export function periodEndOf(subscription) {
  const item = subscription?.items?.data?.[0];
  return item?.current_period_end ?? subscription?.current_period_end ?? null;
}

/** サブスクの状態 → アプリの会員状態 */
export function entitlementFromSubscription(subscription) {
  const status = subscription?.status;
  const end = periodEndOf(subscription);
  // active / trialing: 有料。past_due: 再請求中なので、期間の終わり（＋猶予）までは有料のまま。
  const entitled = ['active', 'trialing', 'past_due'].includes(status) && Number.isFinite(end);
  return {
    status: entitled ? 'paid' : 'free',
    paidUntil: entitled ? new Date(end * 1000 + GRACE_MS).toISOString() : null,
    stripeSubscriptionId: subscription?.id || null,
    stripeSubscriptionStatus: status || null,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end || subscription?.cancel_at),
  };
}

/**
 * Stripe のサブスクを取得し直して、対応するユーザーに反映する（何度呼んでも同じ結果になる）。
 * @returns {Promise<string|null>} 反映したユーザーのメールアドレス。対応が見つからなければ null
 */
export async function syncSubscription(subscriptionOrId) {
  const subscription = typeof subscriptionOrId === 'string'
    ? await stripe().subscriptions.retrieve(subscriptionOrId)
    : subscriptionOrId;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const email = customerId ? await kv().get(`stripe_customer:${customerId}`) : null;
  if (!email) return null;
  const key = `user:${email}`;
  const user = (await kv().get(key)) || { status: 'free', sv: 0, createdAt: new Date().toISOString() };

  // 別の古いサブスクの「解約」通知で、今のサブスクの有料状態を消さない。
  if (user.stripeSubscriptionId && user.stripeSubscriptionId !== subscription.id) {
    const next = entitlementFromSubscription(subscription);
    if (next.status !== 'paid') return email;
  }

  await kv().set(key, { ...user, stripeCustomerId: customerId, ...entitlementFromSubscription(subscription) });
  return email;
}

/** 顧客の最新のサブスクを反映する（請求書・返金などのイベントから呼ぶ） */
export async function syncCustomer(customerId) {
  if (!customerId) return null;
  const list = await stripe().subscriptions.list({ customer: customerId, status: 'all', limit: 5 });
  const current = list.data.find((s) => ['active', 'trialing', 'past_due'].includes(s.status)) || list.data[0];
  return current ? syncSubscription(current) : null;
}
