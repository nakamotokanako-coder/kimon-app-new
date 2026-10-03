import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import meHandler from '../api/auth/me.js';
import { issueSession } from '../lib/auth.js';
import { setKvClient } from '../lib/kv.js';
import { MAX_FAVORITES, mergeFavorites, sanitizeBasePoint, sanitizeFavorites, saveUserData } from '../lib/userData.js';

function createRes() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { this.ended = true; return this; },
  };
}

function makeFakeKv() {
  const store = new Map();
  return {
    store,
    async set(key, value) { store.set(key, value); return 'OK'; },
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async del(key) { return store.delete(key) ? 1 : 0; },
  };
}

let kvFake;
beforeAll(() => { process.env.SESSION_SECRET = 'userdata-test-secret'; });
beforeEach(() => { kvFake = makeFakeKv(); setKvClient(kvFake); });
afterEach(() => setKvClient(null));

async function login(email) {
  if (!(await kvFake.get(`user:${email}`))) {
    await kvFake.set(`user:${email}`, { status: 'free', sv: 0, createdAt: new Date().toISOString() });
  }
  const res = createRes();
  await issueSession(res, email, { headers: {} });
  return res.headers['Set-Cookie'].split(';')[0];
}

const call = async (method, cookie, body, headers = {}) => {
  const res = createRes();
  await meHandler({
    method,
    query: { data: '1' },
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body,
  }, res);
  return res;
};

const TOKYO = { name: '東京駅', latitude: 35.681236, longitude: 139.767125, kind: 'home' };
const OSAKA = { name: '大阪駅', latitude: 34.702485, longitude: 135.495951 };
const KYOTO = { name: '京都駅', latitude: 34.985849, longitude: 135.758767 };

describe('お気に入り・基準点の取り込み（知っている項目だけ）', () => {
  it('知らない項目・壊れた座標・同じ場所の重複を落とす', () => {
    const out = sanitizeFavorites([
      { ...TOKYO, evil: '<script>', distanceM: 10, direction: { score: 70 } },
      { name: '壊れ', latitude: 'x', longitude: 1 },
      { name: '範囲外', latitude: 95, longitude: 10 },
      { ...TOKYO, name: '東京駅（重複）' },
      { ...OSAKA, label: '実家', addressLine: '大阪市北区' },
    ]);
    expect(out).toEqual([
      { name: '東京駅', latitude: 35.681236, longitude: 139.767125, kind: 'home' },
      { name: '大阪駅', latitude: 34.702485, longitude: 135.495951, kind: 'spot', label: '実家', addressLine: '大阪市北区' },
    ]);
  });

  it('配列でなければ null、上限は100件、文字は120字まで', () => {
    expect(sanitizeFavorites('x')).toBe(null);
    const many = Array.from({ length: 150 }, (_, i) => ({ name: `p${i}`, latitude: 10 + i * 0.001, longitude: 100 }));
    expect(sanitizeFavorites(many)).toHaveLength(MAX_FAVORITES);
    expect(sanitizeFavorites([{ ...TOKYO, name: 'あ'.repeat(500) }])[0].name).toHaveLength(120);
  });

  it('基準点は「お気に入り・検索」で選んだ場所だけ（現在地は端末ごとのものなので保存しない）', () => {
    expect(sanitizeBasePoint({ mode: 'gps', location: TOKYO })).toBe(null);
    expect(sanitizeBasePoint({ mode: 'search', location: { name: '東京駅', latitude: 'a', longitude: 1 } })).toBe(null);
    expect(sanitizeBasePoint({ mode: 'search', location: { ...TOKYO, extra: 1 }, selectedFavoriteId: null })).toEqual({
      mode: 'search',
      location: { name: '東京駅', latitude: 35.681236, longitude: 139.767125 },
      selectedFavoriteId: null,
    });
  });

  it('足し合わせは先のリストを優先し、同じ場所は1件にする', () => {
    expect(mergeFavorites([{ ...TOKYO, label: '職場' }], [TOKYO, OSAKA]).map((f) => f.label || f.name)).toEqual(['職場', '大阪駅']);
  });
});

describe('保存（saveUserData）', () => {
  it('最後に受け取った版が同じなら、そのまま置き換える（削除も反映される）', async () => {
    const a = await saveUserData('u@example.com', { favorites: [TOKYO, OSAKA], favoritesBase: null }, 1000);
    const b = await saveUserData('u@example.com', { favorites: [OSAKA], favoritesBase: a.favoritesAt }, 2000);
    expect(b.favorites.map((f) => f.name)).toEqual(['大阪駅']);
    expect(b.favoritesAt).toBe(2000);
  });

  it('別の端末が先に書き換えていたら、上書きせず足し合わせる', async () => {
    const a = await saveUserData('u@example.com', { favorites: [TOKYO], favoritesBase: null }, 1000);
    await saveUserData('u@example.com', { favorites: [TOKYO, OSAKA], favoritesBase: a.favoritesAt }, 2000); // 端末A
    const c = await saveUserData('u@example.com', { favorites: [TOKYO, KYOTO], favoritesBase: a.favoritesAt }, 3000); // 古い版を持つ端末B
    expect(c.favorites.map((f) => f.name)).toEqual(['東京駅', '京都駅', '大阪駅']);
  });

  it('送らなかった項目は変えない', async () => {
    await saveUserData('u@example.com', { favorites: [TOKYO], favoritesBase: null }, 1000);
    const next = await saveUserData('u@example.com', { basePoint: { mode: 'search', location: OSAKA } }, 2000);
    expect(next.favorites).toHaveLength(1);
    expect(next.favoritesAt).toBe(1000);
    expect(next.basePoint.location.name).toBe('大阪駅');
  });
});

describe('GET / PUT /api/auth/me?data=1', () => {
  it('未ログインは 401、保存もされない', async () => {
    expect((await call('GET')).statusCode).toBe(401);
    expect((await call('PUT', null, { favorites: [TOKYO] })).statusCode).toBe(401);
    expect([...kvFake.store.keys()].some((k) => k.startsWith('userdata:'))).toBe(false);
  });

  it('保存した内容は、同じアカウントの別のログインから読める（他人のは読めない）', async () => {
    const phone = await login('me@example.com');
    const pc = await login('me@example.com');
    const other = await login('other@example.com');

    const saved = await call('PUT', phone, { favorites: [TOKYO], favoritesBase: null, basePoint: { mode: 'search', location: OSAKA } });
    expect(saved.statusCode).toBe(200);

    const mine = await call('GET', pc);
    expect(mine.body.favorites.map((f) => f.name)).toEqual(['東京駅']);
    expect(mine.body.basePoint.location.name).toBe('大阪駅');
    expect(mine.headers['Cache-Control']).toBe('no-store');

    expect((await call('GET', other)).body).toMatchObject({ enabled: false, favorites: [], basePoint: null });
  });

  it('最初はオフ（保存なし）。保存するとオン、DELETE でオフに戻り、中身はキーごと消える', async () => {
    const cookie = await login('me@example.com');
    expect((await call('GET', cookie)).body.enabled).toBe(false);
    expect(kvFake.store.has('userdata:me@example.com')).toBe(false);

    expect((await call('PUT', cookie, { favorites: [], favoritesBase: null })).body.enabled).toBe(true);
    expect((await call('GET', cookie)).body.enabled).toBe(true);

    const off = await call('DELETE', cookie);
    expect(off.body).toMatchObject({ enabled: false, favorites: [] });
    expect(kvFake.store.has('userdata:me@example.com')).toBe(false);
    expect(kvFake.store.has('user:me@example.com')).toBe(true); // 会員情報は消さない
  });

  it('DELETE は自分の分だけ消す。未ログインでは消せない', async () => {
    const me = await login('me@example.com');
    const other = await login('other@example.com');
    await call('PUT', other, { favorites: [TOKYO], favoritesBase: null });
    await call('DELETE', me);
    expect((await call('DELETE')).statusCode).toBe(401);
    expect((await call('GET', other)).body.favorites).toHaveLength(1);
  });

  it('JSON 以外・中身のない送信・壊れた内容は受け付けない', async () => {
    const cookie = await login('me@example.com');
    expect((await call('PUT', cookie, { favorites: [TOKYO] }, { 'content-type': 'text/plain' })).statusCode).toBe(415);
    expect((await call('PUT', cookie, { nothing: 1 })).statusCode).toBe(400);
    expect((await call('PUT', cookie, { favorites: 'x' })).statusCode).toBe(400);
    expect((await call('PUT', cookie, { basePoint: { mode: 'gps', location: TOKYO } })).statusCode).toBe(400);
    expect((await call('POST', cookie, { favorites: [TOKYO] })).statusCode).toBe(405);
  });

  it('data=1 を付けない /api/auth/me は今までどおり（GET だけ・会員情報だけ）', async () => {
    const cookie = await login('me@example.com');
    const res = createRes();
    await meHandler({ method: 'GET', headers: { cookie } }, res);
    expect(res.body).toMatchObject({ loggedIn: true, email: 'me@example.com' });
    expect(res.body.favorites).toBeUndefined();
    const put = createRes();
    await meHandler({ method: 'PUT', headers: { cookie } }, put);
    expect(put.statusCode).toBe(405);
  });
});
