import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import meHandler from '../api/auth/me.js';
import { answer, maskEmail, MENU } from '../lib/billingApi/line.js';
import {
  createLinkToken, linkAccount, linkedEmail, memberOfLineUser, peekLinkToken, unlinkByLineUser,
} from '../lib/lineLink.js';
import { setKvClient } from '../lib/kv.js';
import { signSession, SESSION_COOKIE } from '../lib/session.js';

const SECRET = 'line-link-test-secret';
const EMAIL = 'kanako@example.com';
const SID = 'sid-1';
const APP = 'https://example.com';
const NOW = new Date('2026-10-06T10:00:00+09:00');

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

function addUser(email, extra = {}) {
  const nowIso = new Date().toISOString();
  kvFake.store.set(`user:${email}`, {
    status: 'free', sv: 0, createdAt: nowIso,
    sessions: [{ sid: SID, label: 'test', createdAt: nowIso, lastSeenAt: nowIso }],
    ...extra,
  });
}

function cookieFor(email) {
  return `${SESSION_COOKIE}=${signSession({ email, exp: Date.now() + 60_000, sv: 0, sid: SID }, SECRET)}`;
}

async function me(method, { email = EMAIL, body, loggedIn = true } = {}) {
  const res = createRes();
  await meHandler({
    method,
    query: { line: '1' },
    headers: { ...(loggedIn ? { cookie: cookieFor(email) } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body,
  }, res);
  return res;
}

const textEvent = (text, userId = 'U1') => ({ type: 'message', replyToken: 'rt', source: { userId }, message: { type: 'text', text } });
const postbackEvent = (data, userId = 'U1') => ({ type: 'postback', replyToken: 'rt', source: { userId }, postback: { data } });

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  kvFake = makeFakeKv();
  setKvClient(kvFake);
  addUser(EMAIL);
});

afterEach(() => {
  setKvClient(null);
  vi.unstubAllGlobals();
});

describe('連携用の合言葉', () => {
  it('作った合言葉から LINE のユーザーと表示名が引ける。形の違うものは引けない', async () => {
    const token = await createLinkToken('U1', 'かなこ');
    expect(await peekLinkToken(token)).toEqual({ userId: 'U1', name: 'かなこ' });
    expect(await peekLinkToken('short')).toBeNull();
    expect(await peekLinkToken(`${token}x`)).toBeNull();
  });

  it('結びつけると合言葉は使えなくなる（1回きり）', async () => {
    const token = await createLinkToken('U1');
    expect(await linkAccount(token, EMAIL)).toBe(true);
    expect(await linkedEmail('U1')).toBe(EMAIL);
    expect(await linkAccount(token, 'other@example.com')).toBe(false);
    expect(await linkedEmail('U1')).toBe(EMAIL);
  });

  it('1人の会員に LINE は1つ、1つの LINE に会員は1人（前の結びつきは外れる）', async () => {
    await linkAccount(await createLinkToken('U1'), EMAIL);
    await linkAccount(await createLinkToken('U2'), EMAIL);
    expect(await linkedEmail('U1')).toBeNull();
    expect(await linkedEmail('U2')).toBe(EMAIL);

    addUser('other@example.com');
    await linkAccount(await createLinkToken('U2'), 'other@example.com');
    expect(await linkedEmail('U2')).toBe('other@example.com');
    expect(kvFake.store.has(`line:user:${EMAIL}`)).toBe(false);
  });
});

describe('連携した会員がどこまで使えるか（memberOfLineUser）', () => {
  const link = async () => linkAccount(await createLinkToken('U1'), EMAIL);

  it('連携していなければ null', async () => {
    expect(await memberOfLineUser('U1')).toBeNull();
  });

  it('有料で期限内なら paid', async () => {
    addUser(EMAIL, { status: 'paid', paidUntil: new Date(Date.now() + 86_400_000).toISOString() });
    await link();
    expect(await memberOfLineUser('U1')).toMatchObject({ email: EMAIL, status: 'paid', full: true });
  });

  it('解約して期限が切れたら、無料に戻る', async () => {
    addUser(EMAIL, { status: 'paid', paidUntil: new Date(Date.now() - 1000).toISOString() });
    await link();
    const member = await memberOfLineUser('U1');
    expect(member.status).toBe('free');
    expect(member.paidUntil).toBeNull();
  });

  it('LINE 側から連携をやめると null に戻る', async () => {
    await link();
    await unlinkByLineUser('U1');
    expect(await memberOfLineUser('U1')).toBeNull();
    expect(kvFake.store.has(`line:user:${EMAIL}`)).toBe(false);
  });
});

describe('/api/auth/me?line=1', () => {
  it('ログインしていなければ 401', async () => {
    expect((await me('GET', { loggedIn: false })).statusCode).toBe(401);
  });

  it('合言葉を送ると相手の名前が返り、まだ結びつかない', async () => {
    const token = await createLinkToken('U1', 'かなこ');
    const res = await me('POST', { body: { token } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ name: 'かなこ', trusted: false });
    expect(await linkedEmail('U1')).toBeNull();
    expect((await me('GET')).body).toEqual({ linked: false });
  });

  it('confirm を付けて送ると結びつく。DELETE でやめられる', async () => {
    const token = await createLinkToken('U1');
    expect((await me('POST', { body: { token, confirm: true } })).body).toEqual({ linked: true });
    expect(await linkedEmail('U1')).toBe(EMAIL);
    expect((await me('GET')).body).toEqual({ linked: true });

    expect((await me('DELETE')).body).toEqual({ linked: false });
    expect(await linkedEmail('U1')).toBeNull();
  });

  it('期限切れ・使用済みの合言葉は 404', async () => {
    const res = await me('POST', { body: { token: 'a'.repeat(32), confirm: true } });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'expired' });
  });

  it('JSON 以外の POST は受け付けない', async () => {
    const res = createRes();
    await meHandler({ method: 'POST', query: { line: '1' }, headers: { cookie: cookieFor(EMAIL) }, body: {} }, res);
    expect(res.statusCode).toBe(415);
  });
});

describe('LINE の「アプリと連携」', () => {
  it('会員のアドレスは伏せて出す', () => {
    expect(maskEmail('kanako@example.com')).toBe('ka***@example.com');
  });

  it('連携していない人には、合言葉つきのリンクを返す（表示名も合言葉に入れる）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ displayName: 'かなこ' }) })));
    const message = await answer(textEvent(MENU.link), NOW, APP, 'channel-token');
    const token = message.text.match(/\?line=([A-Za-z0-9_-]+)$/)?.[1];
    expect(token).toBeTruthy();
    expect(message.text).toContain('15分');
    expect(await peekLinkToken(token)).toEqual({ userId: 'U1', name: 'かなこ' });
  });

  it('表示名が取れなくても、リンクは返す', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    const message = await answer(textEvent(MENU.link), NOW, APP, 'channel-token');
    expect(message.text).toMatch(/\?line=/);
  });

  it('連携済みの人には、会員の状態と「連携をやめる」を返す', async () => {
    addUser(EMAIL, { status: 'paid', paidUntil: new Date(Date.now() + 86_400_000).toISOString() });
    await linkAccount(await createLinkToken('U1'), EMAIL);
    const message = await answer(textEvent(MENU.link), NOW, APP);
    expect(message.text).toContain('アプリと連携しています（ka***@example.com）。');
    expect(message.text).toContain('プロ版をご利用中です。');
    expect(message.quickReply.items[0].action.data).toBe('link:clear');

    const cleared = await answer(postbackEvent('link:clear'), NOW, APP);
    expect(cleared.text).toBe('アプリとの連携をやめました。');
    expect(await linkedEmail('U1')).toBeNull();
  });
});
