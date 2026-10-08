// lib/accountDeletion.js
// アカウントの削除（退会）。本人がログイン中の端末から行う。入口は POST /api/auth/logout?delete=1。
//   1. 有料プランが続いていれば、先に Stripe で解約する（解約できなければ、何も消さずに止める。
//      アカウントだけ消えて請求が続くのを防ぐ）
//   2. LINE との連携、アカウントに保存したお気に入りと基準点、Stripe の顧客との対応、会員の記録を消す
// Stripe 側の顧客と支払いの記録は消さない（取引の記録として残す）。
import { kv } from './kv.js';
import { isBillingConfigured, stripe } from './billing.js';
import { unlinkByEmail } from './lineLink.js';
import { deleteUserData } from './userData.js';

/** もう請求が起きない状態 */
const ENDED = new Set(['canceled', 'incomplete_expired']);

/** 続いているサブスクがあれば、すぐに解約する。もう終わっている・見つからないときは何もしない。 */
async function cancelSubscription(user, env) {
  const id = user?.stripeSubscriptionId;
  if (!id) return;
  if (!isBillingConfigured(env)) throw new Error('billing_unavailable');
  try {
    const subscription = await stripe(env).subscriptions.retrieve(id);
    if (ENDED.has(subscription?.status)) return;
    await stripe(env).subscriptions.cancel(id);
  } catch (err) {
    if (err?.code === 'resource_missing') return;
    throw err;
  }
}

/** アカウントを消す。解約に失敗したときは例外を投げ、何も消さない。 */
export async function deleteAccount(email, user, env = process.env) {
  await cancelSubscription(user, env);
  await unlinkByEmail(email);
  await deleteUserData(email);
  if (user?.stripeCustomerId) await kv().del(`stripe_customer:${user.stripeCustomerId}`);
  await kv().del(`user:${email}`);
}
