import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import requestHandler from '../api/auth/request.js';
import meHandler from '../api/auth/me.js';
import { getActiveSession, issueSession } from '../lib/auth.js';
import { clearInviteCache, isInvited, loadInvites, mayLogin, updateInvites } from '../lib/invite.js';
import { isLongRangeLocked } from '../lib/accessPolicy.js';
import { setKvClient } from '../lib/kv.js';
import { setEmailSender } from '../lib/email.js';

const OWNER = 'owner@example.com';
const FRIEND = 'friend@example.com';
const STRANGER = 'stranger@example.com';

function createRes() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

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
    async del(key) { return store.delete(key) ? 1 : 0; },
  };
}

let kvFake;
let sent;

beforeAll(() => {
  process.env.SESSION_SECRET = 'invite-test-secret';
  process.env.APP_BASE_URL = 'https://test.example';
});

beforeEach(() => {
  process.env.OWNER_EMAIL = OWNER;
  kvFake = makeFakeKv();
  setKvClient(kvFake);
  clearInviteCache();
  sent = [];
  setEmailSender((email) => { sent.push(email); });
});

afterEach(() => {
  setKvClient(null);
  setEmailSender(null);
  clearInviteCache();
  delete process.env.OWNER_EMAIL;
});

async function login(email) {
  const res = createRes();
  const ok = await issueSession(res, email, { headers: {} });
  return ok ? res.headers['Set-Cookie'].split(';')[0] : null;
}
const sessionOf = (cookie) => getActiveSession({ headers: { cookie } });
const requestLogin = async (email, ip) => {
  const res = createRes();
  await requestHandler({ method: 'POST', body: { email }, headers: { 'x-forwarded-for': ip, host: 'test.example' } }, res);
  return res;
};
const invitesApi = async (method, cookie, body) => {
  const res = createRes();
  await meHandler({
    method,
    query: { invites: '1' },
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body,
  }, res);
  return res;
};

describe('招待の一覧', () => {
  it('最初は招待制ではない（誰でもログインできる）。運営者は常に招待扱い', async () => {
    const invites = await loadInvites();
    expect(invites).toEqual({ restricted: false, emails: [] });
    expect(mayLogin(STRANGER, invites)).toBe(true);
    expect(isInvited(OWNER, invites)).toBe(true);
    expect(isInvited(STRANGER, invites)).toBe(false);
  });

  it('足す・外す・招待制にする。メールアドレスは小文字にそろえ、重複しない', async () => {
    await updateInvites({ add: '  Friend@Example.com ' });
    await updateInvites({ add: FRIEND });
    expect((await updateInvites({ restricted: true })).emails).toEqual([FRIEND]);
    const invites = await loadInvites({ fresh: true });
    expect(mayLogin(FRIEND, invites)).toBe(true);
    expect(mayLogin(OWNER, invites)).toBe(true);
    expect(mayLogin(STRANGER, invites)).toBe(false);
    expect((await updateInvites({ remove: FRIEND })).emails).toEqual([]);
    await expect(updateInvites({ add: 'not-an-email' })).rejects.toThrow('invalid_email');
  });
});

describe('招待制のときのログイン', () => {
  beforeEach(async () => {
    await updateInvites({ add: FRIEND });
    await updateInvites({ restricted: true });
  });

  it('招待されていない人にはログインのメールを送らない（招待した人と運営者には送る）', async () => {
    const no = await requestLogin(STRANGER, '10.0.0.1');
    expect(no.statusCode).toBe(403);
    expect(no.body).toEqual({ error: 'invite_only' });
    expect((await requestLogin(FRIEND, '10.0.0.2')).statusCode).toBe(200);
    expect((await requestLogin(OWNER, '10.0.0.3')).statusCode).toBe(200);
    expect(sent).toEqual([FRIEND, OWNER]);
  });

  it('招待されていない人にはログインを発行しない', async () => {
    expect(await login(STRANGER)).toBe(null);
    expect(await login(FRIEND)).toBeTruthy();
  });

  it('ログイン中でも、一覧から外されたら使えなくなる', async () => {
    const cookie = await login(FRIEND);
    expect((await sessionOf(cookie)).email).toBe(FRIEND);
    await updateInvites({ remove: FRIEND });
    expect(await sessionOf(cookie)).toBe(null);
  });

  it('招待制をやめれば、誰でもログインできる', async () => {
    await updateInvites({ restricted: false });
    expect((await requestLogin(STRANGER, '10.0.0.4')).statusCode).toBe(200);
    expect(await login(STRANGER)).toBeTruthy();
  });
});

describe('招待した人は、ずっと全機能を使える', () => {
  it('/api/auth/me に invited が付き、年額の機能の鍵も開く。招待していない人は今までどおり', async () => {
    await updateInvites({ add: FRIEND });
    const me = async (email) => {
      const res = createRes();
      await meHandler({ method: 'GET', headers: { cookie: await login(email) } }, res);
      return res.body;
    };
    const friend = await me(FRIEND);
    expect(friend).toMatchObject({ loggedIn: true, invited: true, owner: false, full: true });
    expect(isLongRangeLocked(friend, true)).toBe(false);

    const stranger = await me(STRANGER);
    expect(stranger).toMatchObject({ invited: false, owner: false });
    expect(isLongRangeLocked(stranger, true)).toBe(true);

    expect(await me(OWNER)).toMatchObject({ invited: true, owner: true });
  });

  it('有料でなくても full になる（課金を始めたあとも使える根拠）', async () => {
    await updateInvites({ add: FRIEND });
    const session = await sessionOf(await login(FRIEND));
    expect(session.status).toBe('free');
    expect(session.invited).toBe(true);
    expect(session.full).toBe(true);
  });
});

describe('招待の管理（運営者だけ）', () => {
  it('運営者は一覧を見て、足して、外して、招待制を切り替えられる', async () => {
    const owner = await login(OWNER);
    expect((await invitesApi('GET', owner)).body).toEqual({ restricted: false, emails: [] });
    expect((await invitesApi('PUT', owner, { add: FRIEND })).body.emails).toEqual([FRIEND]);
    expect((await invitesApi('PUT', owner, { restricted: true })).body.restricted).toBe(true);
    expect((await invitesApi('PUT', owner, { remove: FRIEND })).body.emails).toEqual([]);
    expect((await invitesApi('PUT', owner, { add: 'x' })).statusCode).toBe(400);
    expect((await invitesApi('PUT', owner, { nothing: 1 })).statusCode).toBe(400);
  });

  it('運営者以外は見ることも変えることもできない', async () => {
    const friend = await login(FRIEND);
    expect((await invitesApi('GET', friend)).statusCode).toBe(403);
    expect((await invitesApi('PUT', friend, { add: STRANGER })).statusCode).toBe(403);
    expect((await invitesApi('GET', null)).statusCode).toBe(401);
    expect((await loadInvites({ fresh: true })).emails).toEqual([]);
  });

  it('運営者のメールアドレスが設定されていなければ、誰も管理できない', async () => {
    const cookie = await login(OWNER);
    delete process.env.OWNER_EMAIL;
    expect((await invitesApi('GET', cookie)).statusCode).toBe(403);
  });
});
