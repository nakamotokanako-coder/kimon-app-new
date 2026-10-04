import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import billingHandler from '../api/billing.js';
import { handleEvent, WEBHOOK_EVENTS } from '../lib/billingApi/webhook.js';
import { entitlementFromSubscription, periodEndOf, planOfSubscription, setStripeClient, syncSubscription } from '../lib/billing.js';
import meHandler from '../api/auth/me.js';
import { isLongRangeLocked } from '../lib/accessPolicy.js';
import { hasFullAccess } from '../lib/accessPolicy.js';
import { setKvClient } from '../lib/kv.js';
import { signSession, SESSION_COOKIE } from '../lib/session.js';

const SECRET = 'billing-test-secret';
const EMAIL = 'pro@example.com';
const SID = 'sid-1';
const NOW_SEC = Math.floor(Date.now() / 1000);

function createRes() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(n, v) { this.headers[n] = v; },
    status(c) { this.statusCode = c; return this; },
    json(v) { this.body = v; return this; },
    end() { return this; },
  };
}

function makeFakeKv() {
  const store = new Map();
  return {
    store,
    async set(key, value) { store.set(key, value); return 'OK'; },
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async del(key) { store.delete(key); return 1; },
  };
}

function subscription(overrides = {}) {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: NOW_SEC + 30 * 86400 }] },
    ...overrides,
  };
}

function makeFakeStripe() {
  const calls = { checkout: [], portal: [], customers: [] };
  const subs = new Map([['sub_1', subscription()]]);
  return {
    calls,
    subs,
    prices: {
      list: async ({ lookup_keys: keys = [] } = {}) => ({
        data: keys.includes('kimon_pro_annual')
          ? [{ id: 'price_annual', unit_amount: 10000, currency: 'jpy' }]
          : [{ id: 'price_1', unit_amount: 980, currency: 'jpy' }],
      }),
    },
    customers: { create: async (params) => { calls.customers.push(params); return { id: 'cus_1' }; } },
    checkout: { sessions: { create: async (params) => { calls.checkout.push(params); return { url: 'https://checkout.stripe.test/c/1' }; } } },
    billingPortal: { sessions: { create: async (params) => { calls.portal.push(params); return { url: 'https://billing.stripe.test/p/1' }; } } },
    subscriptions: {
      retrieve: async (id) => subs.get(id),
      list: async ({ customer }) => ({ data: [...subs.values()].filter((s) => s.customer === customer) }),
    },
    charges: { retrieve: async () => ({ id: 'ch_1', customer: 'cus_1' }) },
    webhooks: {
      constructEvent: (raw, signature, secret) => {
        if (signature !== 'good-signature' || secret !== 'whsec_test') throw new Error('bad signature');
        return JSON.parse(raw.toString('utf8'));
      },
    },
  };
}

let kvFake;
let stripeFake;

function cookie() {
  return `${SESSION_COOKIE}=${signSession({ email: EMAIL, exp: Date.now() + 60_000, sid: SID }, SECRET)}`;
}

function seedUser(extra = {}) {
  const now = new Date().toISOString();
  kvFake.store.set(`user:${EMAIL}`, {
    status: 'free', sv: 0, createdAt: now,
    sessions: [{ sid: SID, label: 'iPhone・Safari', createdAt: now, lastSeenAt: now }],
    ...extra,
  });
}

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.APP_BASE_URL = 'https://test.example';
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

beforeEach(() => {
  kvFake = makeFakeKv();
  setKvClient(kvFake);
  stripeFake = makeFakeStripe();
  setStripeClient(stripeFake);
});

afterEach(() => {
  setKvClient(null);
  setStripeClient(null);
});

describe('サブスクの状態 → 会員状態', () => {
  it('active は有料で、期限は請求期間の終わり＋1日の猶予', () => {
    const e = entitlementFromSubscription(subscription());
    expect(e.status).toBe('paid');
    expect(Date.parse(e.paidUntil)).toBe((NOW_SEC + 31 * 86400) * 1000);
  });
  it('past_due は期間の終わりまで有料のまま、canceled / unpaid は無料', () => {
    expect(entitlementFromSubscription(subscription({ status: 'past_due' })).status).toBe('paid');
    expect(entitlementFromSubscription(subscription({ status: 'canceled' }))).toMatchObject({ status: 'free', paidUntil: null });
    expect(entitlementFromSubscription(subscription({ status: 'unpaid' })).status).toBe('free');
  });
  it('請求期間の終わりは、サブスク項目にあってもサブスク直下にあっても読める', () => {
    expect(periodEndOf({ items: { data: [{ current_period_end: 111 }] } })).toBe(111);
    expect(periodEndOf({ current_period_end: 222 })).toBe(222);
  });
});

describe('POST /api/billing?action=checkout', () => {
  it('未ログインは 401', async () => {
    const res = createRes();
    await billingHandler({ method: 'POST', query: { action: 'checkout' }, headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('ログイン済みなら顧客を作り、サブスクの申し込みページのURLを返す（支払い方法は指定しない）', async () => {
    seedUser();
    const res = createRes();
    await billingHandler({ method: 'POST', query: { action: 'checkout' }, headers: { cookie: cookie() } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.url).toBe('https://checkout.stripe.test/c/1');
    const params = stripeFake.calls.checkout[0];
    expect(params).toMatchObject({ mode: 'subscription', customer: 'cus_1', line_items: [{ price: 'price_1', quantity: 1 }] });
    expect(params).not.toHaveProperty('payment_method_types');
    expect(params.success_url).toBe('https://test.example/?billing=success');
    expect(kvFake.store.get('stripe_customer:cus_1')).toBe(EMAIL);
    expect(kvFake.store.get(`user:${EMAIL}`).stripeCustomerId).toBe('cus_1');
  });

  it('すでに有効なサブスクがあれば 409（二重申し込みを防ぐ）', async () => {
    seedUser({ status: 'paid', paidUntil: new Date(Date.now() + 86400000).toISOString(), stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    const res = createRes();
    await billingHandler({ method: 'POST', query: { action: 'checkout' }, headers: { cookie: cookie() } }, res);
    expect(res.statusCode).toBe(409);
    expect(stripeFake.calls.checkout).toHaveLength(0);
  });

  it('知らない action は 404', async () => {
    const res = createRes();
    await billingHandler({ method: 'POST', query: { action: 'nope' }, headers: {} }, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/billing?action=portal', () => {
  it('顧客がいなければ 400、いれば解約ページのURLを返す', async () => {
    seedUser();
    const none = createRes();
    await billingHandler({ method: 'POST', query: { action: 'portal' }, headers: { cookie: cookie() } }, none);
    expect(none.statusCode).toBe(400);

    seedUser({ stripeCustomerId: 'cus_1' });
    const res = createRes();
    await billingHandler({ method: 'POST', query: { action: 'portal' }, headers: { cookie: cookie() } }, res);
    expect(res.body.url).toBe('https://billing.stripe.test/p/1');
    expect(stripeFake.calls.portal[0]).toMatchObject({ customer: 'cus_1' });
  });
});

describe('Webhook', () => {
  function webhookReq(event, signature = 'good-signature') {
    return {
      method: 'POST',
      query: { action: 'webhook' },
      headers: { 'stripe-signature': signature },
      body: Buffer.from(JSON.stringify(event)),
    };
  }

  beforeEach(() => {
    seedUser({ stripeCustomerId: 'cus_1' });
    kvFake.store.set('stripe_customer:cus_1', EMAIL);
  });

  it('署名が正しくなければ 400 で何も変えない', async () => {
    const res = createRes();
    await billingHandler(webhookReq({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } }, 'forged'), res);
    expect(res.statusCode).toBe(400);
    expect(kvFake.store.get(`user:${EMAIL}`).status).toBe('free');
  });

  it('申し込み完了で有料になり、期限が入る（販売開始後のモードで全機能が使える）', async () => {
    const res = createRes();
    await billingHandler(webhookReq({
      id: 'evt_2', type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', payment_status: 'paid', subscription: 'sub_1', customer: 'cus_1' } },
    }), res);
    expect(res.statusCode).toBe(200);
    const user = kvFake.store.get(`user:${EMAIL}`);
    expect(user).toMatchObject({ status: 'paid', stripeSubscriptionId: 'sub_1', cancelAtPeriodEnd: false });
    expect(hasFullAccess({ loggedIn: true, status: user.status, paidUntil: user.paidUntil }, 'paid')).toBe(true);
    // ログイン中の端末の記録は消さない
    expect(user.sessions).toHaveLength(1);
  });

  it('支払いが未確定の申し込み完了は反映しない', async () => {
    const result = await handleEvent({ id: 'evt_3', type: 'checkout.session.completed', data: { object: { mode: 'subscription', payment_status: 'unpaid', subscription: 'sub_1' } } });
    expect(result).toBe('ignored');
    expect(kvFake.store.get(`user:${EMAIL}`).status).toBe('free');
  });

  it('解約予約は期限まで有料のまま、解約されたら無料に戻る', async () => {
    stripeFake.subs.set('sub_1', subscription({ cancel_at_period_end: true }));
    await handleEvent({ id: 'evt_4', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } });
    expect(kvFake.store.get(`user:${EMAIL}`)).toMatchObject({ status: 'paid', cancelAtPeriodEnd: true });

    stripeFake.subs.set('sub_1', subscription({ status: 'canceled' }));
    await handleEvent({ id: 'evt_5', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
    expect(kvFake.store.get(`user:${EMAIL}`)).toMatchObject({ status: 'free', paidUntil: null });
  });

  it('毎月の更新（invoice.paid）で期限が延びる', async () => {
    await syncSubscription('sub_1');
    const before = kvFake.store.get(`user:${EMAIL}`).paidUntil;
    stripeFake.subs.set('sub_1', subscription({ items: { data: [{ current_period_end: NOW_SEC + 60 * 86400 }] } }));
    await handleEvent({ id: 'evt_6', type: 'invoice.paid', data: { object: { customer: 'cus_1' } } });
    expect(Date.parse(kvFake.store.get(`user:${EMAIL}`).paidUntil)).toBeGreaterThan(Date.parse(before));
  });

  it('古いサブスクの解約通知で、今のサブスクの有料状態を消さない', async () => {
    stripeFake.subs.set('sub_2', subscription({ id: 'sub_2' }));
    await syncSubscription('sub_2');
    stripeFake.subs.set('sub_1', subscription({ status: 'canceled' }));
    await handleEvent({ id: 'evt_7', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
    expect(kvFake.store.get(`user:${EMAIL}`)).toMatchObject({ status: 'paid', stripeSubscriptionId: 'sub_2' });
  });

  it('返金・異議は記録を残す', async () => {
    await handleEvent({ id: 'evt_8', type: 'charge.dispute.created', created: NOW_SEC, data: { object: { charge: 'ch_1' } } });
    expect([...kvFake.store.keys()].some((k) => k.startsWith('billing_alert:'))).toBe(true);
  });

  it('対応するユーザーがいない顧客の通知は、何も壊さず無視する', async () => {
    stripeFake.subs.set('sub_x', subscription({ id: 'sub_x', customer: 'cus_unknown' }));
    await handleEvent({ id: 'evt_9', type: 'customer.subscription.updated', data: { object: { id: 'sub_x' } } });
    expect(kvFake.store.get(`user:${EMAIL}`).status).toBe('free');
  });

  it('購読するイベントの一覧に、更新・失敗・解約・返金・異議が入っている', () => {
    for (const type of ['customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed', 'charge.refunded', 'charge.dispute.created']) {
      expect(WEBHOOK_EVENTS).toContain(type);
    }
  });
});

describe('年額プラン（年額10,000円）', () => {
  const yearly = (overrides = {}) => subscription({
    items: { data: [{ current_period_end: NOW_SEC + 365 * 86400, price: { recurring: { interval: 'year' } } }] },
    ...overrides,
  });

  it('plan=annual なら年額の価格で申し込む。指定なし・知らない値は月額', async () => {
    seedUser();
    for (const [plan, price] of [['annual', 'price_annual'], [undefined, 'price_1'], ['lifetime', 'price_1']]) {
      const res = createRes();
      await billingHandler({ method: 'POST', query: { action: 'checkout', ...(plan ? { plan } : {}) }, headers: { cookie: cookie() } }, res);
      expect(res.statusCode).toBe(200);
      expect(stripeFake.calls.checkout.at(-1).line_items).toEqual([{ price, quantity: 1 }]);
    }
  });

  it('請求の間隔が1年のサブスクは年額、それ以外は月額。有料でなくなったらプランも消える', () => {
    expect(planOfSubscription(yearly())).toBe('annual');
    expect(planOfSubscription(subscription())).toBe('monthly');
    expect(entitlementFromSubscription(yearly())).toMatchObject({ status: 'paid', plan: 'annual' });
    expect(entitlementFromSubscription(subscription())).toMatchObject({ status: 'paid', plan: 'monthly' });
    expect(entitlementFromSubscription(yearly({ status: 'canceled' }))).toMatchObject({ status: 'free', plan: null });
  });

  it('年額の人だけ、/api/auth/me が plan: annual を返す（3ヶ月以上の検索の鍵の判定に使う）', async () => {
    seedUser({ stripeCustomerId: 'cus_1' });
    kvFake.store.set('stripe_customer:cus_1', EMAIL);
    const me = async () => {
      const res = createRes();
      await meHandler({ method: 'GET', headers: { cookie: cookie() } }, res);
      return res.body;
    };
    expect((await me()).plan).toBe(null);

    await syncSubscription(yearly());
    expect(await me()).toMatchObject({ status: 'paid', plan: 'annual' });
    expect(isLongRangeLocked(await me(), true)).toBe(false);

    await syncSubscription(subscription());
    expect(await me()).toMatchObject({ status: 'paid', plan: 'monthly' });
    expect(isLongRangeLocked(await me(), true)).toBe(true);

    await syncSubscription(subscription({ status: 'canceled' }));
    expect((await me()).plan).toBe(null);
  });
});
