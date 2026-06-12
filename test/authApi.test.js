import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import requestHandler from '../api/auth/request.js';
import verifyHandler from '../api/auth/verify.js';
import meHandler from '../api/auth/me.js';
import logoutHandler from '../api/auth/logout.js';
import { setKvClient } from '../lib/kv.js';
import { setEmailSender } from '../lib/email.js';
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
  setEmailSender((email, url) => { sent.push({ email, url }); });
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
});

describe('GET /api/auth/verify (one-time token)', () => {
  async function issueToken(email) {
    const res = createRes();
    await requestHandler({ method: 'POST', body: { email }, headers: {} }, res);
    return tokenFromUrl(sent.at(-1).url);
  }

  it('creates a free user, sets a session cookie, and redirects', async () => {
    const token = await issueToken('new@example.com');
    const res = createRes();
    await verifyHandler({ method: 'GET', query: { token }, headers: {} }, res);

    expect(res.statusCode).toBe(302);
    const cookie = res.headers['Set-Cookie'];
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(res.headers.Location).toBe('https://test.example/');
    expect(kvFake.store.get('user:new@example.com')).toMatchObject({ status: 'free' });
  });

  it('is single-use: the second verify with the same token is invalid', async () => {
    const token = await issueToken('once@example.com');

    const res1 = createRes();
    await verifyHandler({ method: 'GET', query: { token }, headers: {} }, res1);
    expect(res1.statusCode).toBe(302);

    const res2 = createRes();
    await verifyHandler({ method: 'GET', query: { token }, headers: {} }, res2);
    expect(res2.statusCode).toBe(400);
    expect(res2.html).toContain('リンクが無効です');
  });

  it('preserves an existing user status (does not reset paid → free)', async () => {
    const token = await issueToken('vip@example.com');
    kvFake.store.set('user:vip@example.com', { status: 'paid', createdAt: 'x' });
    const res = createRes();
    await verifyHandler({ method: 'GET', query: { token }, headers: {} }, res);
    expect(kvFake.store.get('user:vip@example.com')).toMatchObject({ status: 'paid' });
  });
});

describe('GET /api/auth/me & POST /api/auth/logout', () => {
  async function login(email) {
    const r = createRes();
    await requestHandler({ method: 'POST', body: { email }, headers: {} }, r);
    const token = tokenFromUrl(sent.at(-1).url);
    const v = createRes();
    await verifyHandler({ method: 'GET', query: { token }, headers: {} }, v);
    return v.headers['Set-Cookie'].split(';')[0]; // "kimon_session=..."
  }

  it('reports loggedIn:false without a cookie', async () => {
    const res = createRes();
    await meHandler({ method: 'GET', headers: {} }, res);
    expect(res.body).toEqual({ loggedIn: false });
  });

  it('reports loggedIn + email + status with a valid cookie', async () => {
    const cookie = await login('me@example.com');
    const res = createRes();
    await meHandler({ method: 'GET', headers: { cookie } }, res);
    expect(res.body).toEqual({ loggedIn: true, email: 'me@example.com', status: 'free' });
  });

  it('logout returns a clearing cookie', async () => {
    const res = createRes();
    await logoutHandler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Set-Cookie']).toContain('Max-Age=0');
  });
});
