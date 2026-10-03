import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import requestHandler from '../api/auth/request.js';
import verifyHandler from '../api/auth/verify.js';
import meHandler from '../api/auth/me.js';
import logoutHandler from '../api/auth/logout.js';
import logoutAllHandler from '../api/auth/logout-all.js';
import verifyCodeHandler from '../api/auth/verify-code.js';
import sessionsHandler from '../api/auth/sessions.js';
import { deviceLabel, MAX_DEVICES } from '../lib/auth.js';
import { SESSION_MAX_AGE_SEC } from '../lib/session.js';
import { setKvClient } from '../lib/kv.js';
import {
  setEmailSender,
  resolveMagicFrom,
  magicFromSource,
  DEFAULT_MAGIC_LINK_FROM,
} from '../lib/email.js';
import { SESSION_COOKIE } from '../lib/session.js';

const SECRET = 'auth-test-secret';

function createRes() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    html: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.html = value; return this; },
    end() { this.ended = true; return this; },
  };
}

/** set(nx/ex) / get / del を備えたインメモリ fake KV（TTLは無視）。 */
function makeFakeKv() {
  const store = new Map();
  return {
    store,
    async set(key, value, opts = {}) {
      if (opts.nx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async del(key) { const had = store.has(key); store.delete(key); return had ? 1 : 0; },
  };
}

let kvFake;
let sent;

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.APP_BASE_URL = 'https://test.example';
});

beforeEach(() => {
  kvFake = makeFakeKv();
  setKvClient(kvFake);
  sent = [];
  setEmailSender((email, url, code) => { sent.push({ email, url, code }); });
});

afterEach(() => {
  setKvClient(null);
  setEmailSender(null);
});

function tokenFromUrl(url) {
  return new URL(url).searchParams.get('token');
}

describe('POST /api/auth/request', () => {
  it('validates and normalizes email, sends a magic link, conceals existence', async () => {
    const res = createRes();
    await requestHandler({ method: 'POST', body: { email: '  USER@Example.COM ' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].email).toBe('user@example.com'); // trim + lowercase
    const token = tokenFromUrl(sent[0].url);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(kvFake.store.get(`magic:${token}`)).toBe('user@example.com');
  });

  it('rejects invalid email with 400', async () => {
    const res = createRes();
    await requestHandler({ method: 'POST', body: { email: 'not-an-email' }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('rate-limits a second request within the cooldown window (429)', async () => {
    const body = { email: 'rl@example.com' };
    const res1 = createRes();
    await requestHandler({ method: 'POST', body, headers: {} }, res1);
    expect(res1.statusCode).toBe(200);

    const res2 = createRes();
    await requestHandler({ method: 'POST', body, headers: {} }, res2);
    expect(res2.statusCode).toBe(429);
    expect(sent).toHaveLength(1); // 2回目は送信しない
  });

  it('rejects non-POST with 405', async () => {
    const res = createRes();
    await requestHandler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('同じIPからは1時間に10通まで（アドレスを変えても11通目は 429）', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' };
    for (let i = 0; i < 10; i += 1) {
      const res = createRes();
      await requestHandler({ method: 'POST', body: { email: `ip${i}@example.com` }, headers }, res);
      expect(res.statusCode).toBe(200);
    }
    const res = createRes();
    await requestHandler({ method: 'POST', body: { email: 'ip10@example.com' }, headers }, res);
    expect(res.statusCode).toBe(429);
    expect(sent).toHaveLength(10);
  });

  it('resolves from-address: env overrides, else onboarding@resend.dev fallback', () => {
    expect(DEFAULT_MAGIC_LINK_FROM).toBe('onboarding@resend.dev');
    expect(resolveMagicFrom({ MAGIC_LINK_FROM: 'login@verified.example' })).toBe('login@verified.example');
    expect(resolveMagicFrom({})).toBe('onboarding@resend.dev'); // 架空ドメインにしない
    expect(magicFromSource({ MAGIC_LINK_FROM: 'x@y.com' })).toBe('env');
    expect(magicFromSource({})).toBe('fallback');
    expect(magicFromSource({ MAGIC_LINK_FROM: '' })).toBe('fallback');
  });

  it('keeps 200 (existence concealment) even when sending fails', async () => {
    // 送信失敗（lib が throw する状況を sender 差し替えで再現）でも 200 を返す。
    setEmailSender(() => { throw new Error('resend_error:invalid_from_address'); });
    const res = createRes();
    await requestHandler({ method: 'POST', body: { email: 'fail@example.com' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

async function issueToken(email) {
  const res = createRes();
  await requestHandler({ method: 'POST', body: { email }, headers: {} }, res);
  return tokenFromUrl(sent.at(-1).url);
}

describe('GET /api/auth/verify（確認ページ・トークンを消費しない）', () => {
  it('有効なトークンなら「ログインする」ボタンのページを返し、トークンは残る（メールの事前チェック対策）', async () => {
    const token = await issueToken('scan@example.com');
    const res = createRes();
    await verifyHandler({ method: 'GET', query: { token }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.html).toContain('method="POST"');
    expect(res.html).toContain(token);
    expect(res.headers['Set-Cookie']).toBeUndefined();
    expect(kvFake.store.get(`magic:${token}`)).toBe('scan@example.com');
  });

  it('無効なトークンは「リンクが無効です」', async () => {
    const res = createRes();
    await verifyHandler({ method: 'GET', query: { token: 'a'.repeat(64) }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.html).toContain('リンクが無効です');
  });
});

describe('POST /api/auth/verify (one-time token)', () => {
  it('creates a free user, sets a session cookie, and redirects', async () => {
    const token = await issueToken('new@example.com');
    const res = createRes();
    await verifyHandler({ method: 'POST', body: { token }, headers: {} }, res);

    expect(res.statusCode).toBe(303);
    const cookie = res.headers['Set-Cookie'];
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(res.headers.Location).toBe('https://test.example/');
    expect(kvFake.store.get('user:new@example.com')).toMatchObject({ status: 'free' });
  });

  it('is single-use: the second verify with the same token is invalid', async () => {
    const token = await issueToken('once@example.com');

    const res1 = createRes();
    await verifyHandler({ method: 'POST', body: { token }, headers: {} }, res1);
    expect(res1.statusCode).toBe(303);

    const res2 = createRes();
    await verifyHandler({ method: 'POST', body: { token }, headers: {} }, res2);
    expect(res2.statusCode).toBe(400);
    expect(res2.html).toContain('リンクが無効です');
  });

  it('preserves an existing user status (does not reset paid → free)', async () => {
    const token = await issueToken('vip@example.com');
    kvFake.store.set('user:vip@example.com', { status: 'paid', createdAt: 'x' });
    const res = createRes();
    await verifyHandler({ method: 'POST', body: `token=${token}`, headers: {} }, res); // フォーム送信（urlencoded 文字列）
    expect(res.statusCode).toBe(303);
    expect(kvFake.store.get('user:vip@example.com')).toMatchObject({ status: 'paid' });
  });
});

describe('GET /api/auth/me & POST /api/auth/logout', () => {
  async function login(email) {
    const r = createRes();
    await requestHandler({ method: 'POST', body: { email }, headers: {} }, r);
    const token = tokenFromUrl(sent.at(-1).url);
    const v = createRes();
    await verifyHandler({ method: 'POST', body: { token }, headers: {} }, v);
    return v.headers['Set-Cookie'].split(';')[0]; // "kimon_session=..."
  }

  it('reports loggedIn:false without a cookie', async () => {
    const res = createRes();
    await meHandler({ method: 'GET', headers: {} }, res);
    expect(res.body).toEqual({ loggedIn: false, full: false, accessMode: 'beta' });
  });

  it('reports loggedIn + email + status + full（ベータ期間はログインで全機能） with a valid cookie', async () => {
    const cookie = await login('me@example.com');
    const res = createRes();
    await meHandler({ method: 'GET', headers: { cookie } }, res);
    expect(res.body).toEqual({ loggedIn: true, email: 'me@example.com', status: 'free', full: true, accessMode: 'beta' });
  });

  it('壊れた %エンコードのCookieでも 500 にならず未ログイン扱い', async () => {
    const res = createRes();
    await meHandler({ method: 'GET', headers: { cookie: 'kimon_session=%E0%A4%A' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.loggedIn).toBe(false);
  });

  it('すべての端末からログアウト: それ以前のCookieはすべて無効になる', async () => {
    const cookieA = await login('multi@example.com');
    kvFake.store.delete('cooldown:multi@example.com');
    const cookieB = await login('multi@example.com');

    const out = createRes();
    await logoutAllHandler({ method: 'POST', headers: { cookie: cookieA } }, out);
    expect(out.statusCode).toBe(200);
    expect(out.headers['Set-Cookie']).toContain('Max-Age=0');

    for (const cookie of [cookieA, cookieB]) {
      const res = createRes();
      await meHandler({ method: 'GET', headers: { cookie } }, res);
      expect(res.body.loggedIn).toBe(false);
    }

    kvFake.store.delete('cooldown:multi@example.com');
    const cookieC = await login('multi@example.com');
    const res = createRes();
    await meHandler({ method: 'GET', headers: { cookie: cookieC } }, res);
    expect(res.body.loggedIn).toBe(true);
  });

  it('logout returns a clearing cookie', async () => {
    const res = createRes();
    await logoutHandler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Set-Cookie']).toContain('Max-Age=0');
  });
});

describe('POST /api/auth/verify-code（ホーム画面のアプリ内でコード入力してログイン）', () => {
  async function requestCode(email) {
    const res = createRes();
    await requestHandler({ method: 'POST', body: { email }, headers: {} }, res);
    return sent.at(-1);
  }

  it('メールに6桁のコードが載り、平文では保存されない', async () => {
    const mail = await requestCode('code@example.com');
    expect(mail.code).toMatch(/^\d{6}$/);
    const stored = kvFake.store.get('otp:code@example.com');
    expect(stored.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(mail.code);
  });

  it('正しいコードでログインでき、コードと同じメールのリンクは使えなくなる', async () => {
    const mail = await requestCode('ok@example.com');
    const res = createRes();
    await verifyCodeHandler({ method: 'POST', body: { email: 'OK@example.com ', code: mail.code }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Set-Cookie']).toContain(`${SESSION_COOKIE}=`);

    const me = createRes();
    await meHandler({ method: 'GET', headers: { cookie: res.headers['Set-Cookie'].split(';')[0] } }, me);
    expect(me.body).toMatchObject({ loggedIn: true, email: 'ok@example.com' });

    const link = createRes();
    await verifyHandler({ method: 'POST', body: { token: tokenFromUrl(mail.url) }, headers: {} }, link);
    expect(link.statusCode).toBe(400);

    const again = createRes();
    await verifyCodeHandler({ method: 'POST', body: { email: 'ok@example.com', code: mail.code }, headers: {} }, again);
    expect(again.statusCode).toBe(400);
  });

  it('リンクでログインしたら、同じメールのコードは使えなくなる', async () => {
    const mail = await requestCode('link@example.com');
    const link = createRes();
    await verifyHandler({ method: 'POST', body: { token: tokenFromUrl(mail.url) }, headers: {} }, link);
    expect(link.statusCode).toBe(303);
    const res = createRes();
    await verifyCodeHandler({ method: 'POST', body: { email: 'link@example.com', code: mail.code }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('間違いは5回まで。5回目でコードが無効になり、正しいコードでも入れなくなる', async () => {
    const mail = await requestCode('brute@example.com');
    const wrong = mail.code === '000000' ? '111111' : '000000';
    for (let i = 1; i <= 4; i += 1) {
      const res = createRes();
      await verifyCodeHandler({ method: 'POST', body: { email: 'brute@example.com', code: wrong }, headers: {} }, res);
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_code', remaining: 5 - i });
    }
    const fifth = createRes();
    await verifyCodeHandler({ method: 'POST', body: { email: 'brute@example.com', code: wrong }, headers: {} }, fifth);
    expect(fifth.body).toEqual({ error: 'too_many_attempts' });

    const right = createRes();
    await verifyCodeHandler({ method: 'POST', body: { email: 'brute@example.com', code: mail.code }, headers: {} }, right);
    expect(right.statusCode).toBe(400);
    expect(right.headers['Set-Cookie']).toBeUndefined();
  });

  it('形式が違うコードや GET は受け付けない', async () => {
    const bad = createRes();
    await verifyCodeHandler({ method: 'POST', body: { email: 'x@example.com', code: '12ab' }, headers: {} }, bad);
    expect(bad.statusCode).toBe(400);
    const get = createRes();
    await verifyCodeHandler({ method: 'GET', headers: {} }, get);
    expect(get.statusCode).toBe(405);
  });
});

describe('端末の上限（3台）と有効期間（30日）', () => {
  const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  };

  async function loginOn(email, ua) {
    kvFake.store.delete(`cooldown:${email}`);
    const r = createRes();
    await requestHandler({ method: 'POST', body: { email }, headers: {} }, r);
    const mail = sent.at(-1);
    const v = createRes();
    await verifyCodeHandler({ method: 'POST', body: { email, code: mail.code }, headers: { 'user-agent': ua } }, v);
    return v.headers['Set-Cookie'].split(';')[0];
  }

  async function isLoggedIn(cookie) {
    const res = createRes();
    await meHandler({ method: 'GET', headers: { cookie } }, res);
    return res.body.loggedIn;
  }

  it('有効期間は30日', () => {
    expect(SESSION_MAX_AGE_SEC).toBe(30 * 24 * 60 * 60);
  });

  it('4台目でログインすると、一番使っていない端末がログアウトされる', async () => {
    expect(MAX_DEVICES).toBe(3);
    const email = 'share@example.com';
    const c1 = await loginOn(email, UA.iphone);
    const c2 = await loginOn(email, UA.mac);
    const c3 = await loginOn(email, UA.iphone);
    // 1台目を「一番使っていない」状態にする
    const user = kvFake.store.get(`user:${email}`);
    user.sessions[0].lastSeenAt = '2026-01-01T00:00:00.000Z';
    const c4 = await loginOn(email, UA.mac);

    expect(await isLoggedIn(c1)).toBe(false);
    expect(await isLoggedIn(c2)).toBe(true);
    expect(await isLoggedIn(c3)).toBe(true);
    expect(await isLoggedIn(c4)).toBe(true);
    expect(kvFake.store.get(`user:${email}`).sessions).toHaveLength(3);
  });

  it('30日を過ぎたセッションは無効', async () => {
    const email = 'old@example.com';
    const c1 = await loginOn(email, UA.iphone);
    const user = kvFake.store.get(`user:${email}`);
    user.sessions[0].createdAt = new Date(Date.now() - (SESSION_MAX_AGE_SEC + 60) * 1000).toISOString();
    expect(await isLoggedIn(c1)).toBe(false);
  });

  it('端末の一覧と、他の端末だけのログアウト', async () => {
    const email = 'list@example.com';
    const phone = await loginOn(email, UA.iphone);
    const mac = await loginOn(email, UA.mac);

    const list = createRes();
    await sessionsHandler({ method: 'GET', headers: { cookie: phone } }, list);
    expect(list.body.max).toBe(3);
    expect(list.body.sessions.map((s) => s.label).sort()).toEqual(['Mac・Chrome', 'iPhone・Safari']);
    const macEntry = list.body.sessions.find((s) => !s.current);

    const revoke = createRes();
    await sessionsHandler({ method: 'POST', body: { id: macEntry.id }, headers: { cookie: phone } }, revoke);
    expect(revoke.statusCode).toBe(200);
    expect(await isLoggedIn(mac)).toBe(false);
    expect(await isLoggedIn(phone)).toBe(true);
  });

  it('この端末のログアウトは他の端末に影響しない', async () => {
    const email = 'single@example.com';
    const phone = await loginOn(email, UA.iphone);
    const mac = await loginOn(email, UA.mac);
    const out = createRes();
    await logoutHandler({ method: 'POST', headers: { cookie: phone } }, out);
    expect(await isLoggedIn(phone)).toBe(false);
    expect(await isLoggedIn(mac)).toBe(true);
  });

  it('端末名は User-Agent から', () => {
    expect(deviceLabel(UA.iphone)).toBe('iPhone・Safari');
    expect(deviceLabel(UA.mac)).toBe('Mac・Chrome');
    expect(deviceLabel('')).toBe('その他の端末');
  });
});
