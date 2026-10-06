import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import meHandler from '../api/auth/me.js';
import { LINE_LOGIN_COOKIE } from '../lib/lineLogin.js';
import { createLinkToken, linkAccount, linkedEmail, peekLinkToken } from '../lib/lineLink.js';
import { clearInviteCache } from '../lib/invite.js';
import { setKvClient } from '../lib/kv.js';
import { parseCookies, signSession, SESSION_COOKIE, verifySession } from '../lib/session.js';

const SECRET = 'line-login-test-secret';
const EMAIL = 'kanako@example.com';
const SID = 'sid-1';
const ENV = {
  SESSION_SECRET: SECRET,
  LINE_LOGIN_CHANNEL_ID: '1234567890',
  LINE_LOGIN_CHANNEL_SECRET: 'login-secret',
  APP_BASE_URL: 'https://kimon.example',
};

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

let kvFake;
let fetchMock;
const saved = {};

function addUser(email) {
  const nowIso = new Date().toISOString();
  kvFake.store.set(`user:${email}`, {
    status: 'free', sv: 0, createdAt: nowIso,
    sessions: [{ sid: SID, label: 'test', createdAt: nowIso, lastSeenAt: nowIso }],
  });
}

const sessionCookie = (email) => `${SESSION_COOKIE}=${signSession({ email, exp: Date.now() + 60_000, sv: 0, sid: SID }, SECRET)}`;

async function start() {
  const res = createRes();
  await meHandler({ method: 'GET', query: { linelogin: 'start' }, headers: {} }, res);
  return res;
}

async function finish({ code = 'code-1', state, cookie, json = true } = {}) {
  const res = createRes();
  await meHandler({
    method: 'POST',
    query: { linelogin: 'finish' },
    headers: { ...(cookie ? { cookie } : {}), ...(json ? { 'content-type': 'application/json' } : {}) },
    body: { code, state },
  }, res);
  return res;
}

/** LINE の2つの入口（code の交換・IDトークンの検証）のまね。nonce は Cookie に入れたものをそのまま返す */
function lineReturns({ sub = 'U1', name = 'かなこ', nonce }) {
  fetchMock.mockImplementation(async (url, init) => {
    const fields = Object.fromEntries(new URLSearchParams(init.body));
    if (String(url).endsWith('/token')) return { ok: true, json: async () => ({ id_token: 'idt' }) };
    return { ok: true, json: async () => ({ sub, name, nonce: nonce ?? fields.nonce }) };
  });
}

/** start を呼んで、state と、戻ってきたブラウザが送る Cookie を作る */
async function begin() {
  const res = await start();
  const [pair] = res.headers['Set-Cookie'].split(';');
  const state = new URL(res.headers.Location).searchParams.get('state');
  return { state, cookie: pair };
}

beforeEach(() => {
  for (const key of Object.keys(ENV)) { saved[key] = process.env[key]; process.env[key] = ENV[key]; }
  kvFake = makeFakeKv();
  setKvClient(kvFake);
  clearInviteCache();
  addUser(EMAIL);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  for (const key of Object.keys(ENV)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  setKvClient(null);
  vi.unstubAllGlobals();
});

describe('LINE でログイン: はじめ（/api/auth/me?linelogin=start）', () => {
  it('state と nonce を Cookie に入れて、LINE の認可画面へ送る', async () => {
    const res = await start();
    expect(res.statusCode).toBe(302);
    const url = new URL(res.headers.Location);
    expect(`${url.origin}${url.pathname}`).toBe('https://access.line.me/oauth2/v2.1/authorize');
    expect(url.searchParams.get('client_id')).toBe(ENV.LINE_LOGIN_CHANNEL_ID);
    expect(url.searchParams.get('redirect_uri')).toBe('https://kimon.example/');
    expect(url.searchParams.get('scope')).toBe('openid profile');

    const cookie = res.headers['Set-Cookie'];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const [state, nonce] = parseCookies(cookie.split(';')[0])[LINE_LOGIN_COOKIE].split('.');
    expect(state).toBe(url.searchParams.get('state'));
    expect(nonce).toBe(url.searchParams.get('nonce'));
  });

  it('鍵が設定されていなければ 503。me の応答でもボタンを出さない', async () => {
    delete process.env.LINE_LOGIN_CHANNEL_SECRET;
    expect((await start()).statusCode).toBe(503);
    const res = createRes();
    await meHandler({ method: 'GET', query: {}, headers: {} }, res);
    expect(res.body.lineLogin).toBe(false);
  });

  it('鍵が設定されていれば、me の応答で lineLogin が true', async () => {
    const res = createRes();
    await meHandler({ method: 'GET', query: {}, headers: {} }, res);
    expect(res.body).toMatchObject({ loggedIn: false, lineLogin: true });
  });
});

describe('LINE でログイン: 戻ってきたあと（/api/auth/me?linelogin=finish）', () => {
  it('連携済みの人は、その会員としてログインする', async () => {
    await linkAccount(await createLinkToken('U1'), EMAIL);
    const { state, cookie } = await begin();
    lineReturns({ sub: 'U1' });
    const res = await finish({ state, cookie });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ loggedIn: true });
    const session = parseCookies(res.headers['Set-Cookie'].split(';')[0])[SESSION_COOKIE];
    expect(verifySession(session, SECRET).email).toBe(EMAIL);

    // LINE には、登録したコールバックURLと鍵を渡している
    const tokenCall = Object.fromEntries(new URLSearchParams(fetchMock.mock.calls[0][1].body));
    expect(tokenCall).toMatchObject({ grant_type: 'authorization_code', code: 'code-1', redirect_uri: 'https://kimon.example/' });
  });

  it('はじめての人には、確認なしで結びつけてよい合言葉を返す（ログインはまだ）', async () => {
    const { state, cookie } = await begin();
    lineReturns({ sub: 'U9', name: 'はじめて' });
    const res = await finish({ state, cookie });
    expect(res.body).toMatchObject({ loggedIn: false, needEmail: true });
    expect(res.headers['Set-Cookie']).toBeUndefined();
    expect(await peekLinkToken(res.body.token)).toEqual({ userId: 'U9', name: 'はじめて', trusted: true });
  });

  it('その合言葉は、メールでログインしたあとに確認なしで結びつく合図（trusted）を返す', async () => {
    const token = await createLinkToken('U9', 'はじめて', { trusted: true });
    const res = createRes();
    await meHandler({
      method: 'POST', query: { line: '1' },
      headers: { cookie: sessionCookie(EMAIL), 'content-type': 'application/json' }, body: { token },
    }, res);
    expect(res.body).toEqual({ name: 'はじめて', trusted: true });
  });

  it('ログイン中の人が押したら、その会員に LINE を結びつける', async () => {
    const { state, cookie } = await begin();
    lineReturns({ sub: 'U5' });
    const res = await finish({ state, cookie: `${cookie}; ${sessionCookie(EMAIL)}` });
    expect(res.body).toEqual({ loggedIn: true, linked: true });
    expect(await linkedEmail('U5')).toBe(EMAIL);
  });

  it('state が合わなければ断る（LINE には問い合わせない）', async () => {
    const { cookie } = await begin();
    const res = await finish({ state: 'x'.repeat(32), cookie });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'bad_state' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Cookie が無い（別の端末で始めたログイン）なら断る', async () => {
    const { state } = await begin();
    expect((await finish({ state })).statusCode).toBe(400);
  });

  it('LINE が返した nonce が違えば断る', async () => {
    await linkAccount(await createLinkToken('U1'), EMAIL);
    const { state, cookie } = await begin();
    lineReturns({ sub: 'U1', nonce: 'other' });
    const res = await finish({ state, cookie });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'line_login_failed' });
  });

  it('LINE が code を受け付けなければ断る', async () => {
    const { state, cookie } = await begin();
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({}) }));
    expect((await finish({ state, cookie })).body).toEqual({ error: 'line_login_failed' });
  });

  it('JSON 以外の POST と、GET は受け付けない', async () => {
    const { state, cookie } = await begin();
    expect((await finish({ state, cookie, json: false })).statusCode).toBe(415);
    const res = createRes();
    await meHandler({ method: 'GET', query: { linelogin: 'finish' }, headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});
