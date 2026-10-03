/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BASE_POINT_STORAGE_KEY, FAVORITES_CHANGED_EVENT, SYNC_META_KEY, USER_DATA_SYNCED_EVENT,
  planSync, startUserDataSync, syncUserData, unionFavorites,
} from '../src/sync/userDataSync.js';
import { MAP_SEARCH_STORAGE_KEY } from '../src/reverseDirection/mapSearch.js';

const TOKYO = { name: '東京駅', latitude: 35.681236, longitude: 139.767125, kind: 'home' };
const OSAKA = { name: '大阪駅', latitude: 34.702485, longitude: 135.495951, kind: 'spot' };
const KYOTO = { name: '京都駅', latitude: 34.985849, longitude: 135.758767, kind: 'spot' };
const EMAIL = 'me@example.com';
const BP = (loc, mode = 'search') => ({ mode, location: loc, selectedFavoriteId: null });
const emptyServer = { favorites: [], favoritesAt: null, basePoint: null, basePointAt: null };
const names = (list) => list.map((f) => f.name);

describe('planSync（何を端末に書き、何をサーバーへ送るか）', () => {
  it('初めての同期: 端末とサーバーを足し合わせ、どちらも失わない', () => {
    const plan = planSync({ email: EMAIL, server: { ...emptyServer, favorites: [TOKYO], favoritesAt: 10 }, meta: {}, localFavorites: [OSAKA], localBasePoint: null });
    expect(names(plan.local.favorites)).toEqual(['東京駅', '大阪駅']);
    expect(names(plan.push.favorites)).toEqual(['東京駅', '大阪駅']);
    expect(plan.push.favoritesBase).toBe(10);
  });

  it('初めての同期で中身が同じなら、何も送らない', () => {
    const plan = planSync({ email: EMAIL, server: { ...emptyServer, favorites: [TOKYO], favoritesAt: 10 }, meta: {}, localFavorites: [TOKYO], localBasePoint: null });
    expect(plan.local).toEqual({});
    expect(plan.push).toEqual({});
  });

  it('別の端末で変わっていたら（版が違う）、サーバーの内容を端末に入れる（削除も届く）', () => {
    const plan = planSync({ email: EMAIL, server: { ...emptyServer, favorites: [OSAKA], favoritesAt: 20 }, meta: { email: EMAIL, favoritesAt: 10 }, localFavorites: [TOKYO, OSAKA], localBasePoint: null });
    expect(names(plan.local.favorites)).toEqual(['大阪駅']);
    expect(plan.push).toEqual({});
  });

  it('端末で変えてまだ送れていなければ、端末の内容を送る', () => {
    const plan = planSync({ email: EMAIL, server: { ...emptyServer, favorites: [TOKYO], favoritesAt: 10 }, meta: { email: EMAIL, favoritesAt: 10, favoritesDirty: true }, localFavorites: [TOKYO, KYOTO], localBasePoint: null });
    expect(plan.local).toEqual({});
    expect(names(plan.push.favorites)).toEqual(['東京駅', '京都駅']);
    expect(plan.push.favoritesBase).toBe(10);
  });

  it('変わっていなければ何もしない', () => {
    const plan = planSync({ email: EMAIL, server: { ...emptyServer, favorites: [TOKYO], favoritesAt: 10 }, meta: { email: EMAIL, favoritesAt: 10 }, localFavorites: [TOKYO], localBasePoint: null });
    expect(plan).toMatchObject({ local: {}, push: {} });
  });

  it('別のアカウントでログインし直したら、前の人のお気に入りを混ぜない', () => {
    const plan = planSync({ email: 'b@example.com', server: { ...emptyServer, favorites: [KYOTO], favoritesAt: 5 }, meta: { email: EMAIL, favoritesAt: 10, favoritesDirty: true }, localFavorites: [TOKYO], localBasePoint: BP(TOKYO) });
    expect(names(plan.local.favorites)).toEqual(['京都駅']);
    expect(plan.push).toEqual({});
  });

  it('基準点: 現在地（gps）は送らず、他の端末の選択でも上書きしない', () => {
    const push = planSync({ email: EMAIL, server: emptyServer, meta: {}, localFavorites: [], localBasePoint: BP(TOKYO, 'gps') });
    expect(push.push.basePoint).toBeUndefined();
    const pull = planSync({ email: EMAIL, server: { ...emptyServer, basePoint: BP(OSAKA), basePointAt: 30 }, meta: { email: EMAIL, basePointAt: 10 }, localFavorites: [], localBasePoint: BP(TOKYO, 'gps') });
    expect(pull.local.basePoint).toBeUndefined();
  });

  it('基準点: 初めてならサーバー優先、サーバーが空なら端末のものを送る。変えたら送る', () => {
    expect(planSync({ email: EMAIL, server: { ...emptyServer, basePoint: BP(OSAKA), basePointAt: 30 }, meta: {}, localFavorites: [], localBasePoint: BP(TOKYO) }).local.basePoint.location.name).toBe('大阪駅');
    expect(planSync({ email: EMAIL, server: emptyServer, meta: {}, localFavorites: [], localBasePoint: BP(TOKYO) }).push.basePoint.location.name).toBe('東京駅');
    expect(planSync({ email: EMAIL, server: { ...emptyServer, basePoint: BP(OSAKA), basePointAt: 30 }, meta: { email: EMAIL, basePointAt: 30, basePointDirty: true }, localFavorites: [], localBasePoint: BP(KYOTO) }).push.basePoint.location.name).toBe('京都駅');
  });

  it('unionFavorites は同じ場所を1件にする', () => {
    expect(names(unionFavorites([TOKYO], [{ ...TOKYO, name: '別名' }, OSAKA]))).toEqual(['東京駅', '大阪駅']);
  });
});

describe('同期の通し（サーバーは偽物）', () => {
  let server;
  let stop;
  const readLocal = (key) => JSON.parse(window.localStorage.getItem(key) || 'null');

  beforeEach(() => {
    window.localStorage.clear();
    server = { ...emptyServer };
    let clock = 100;
    global.fetch = vi.fn(async (url, opts = {}) => {
      if (opts.method === 'PUT') {
        const body = JSON.parse(opts.body);
        clock += 1;
        if (body.favorites) server = { ...server, favorites: body.favorites, favoritesAt: clock };
        if (body.basePoint) server = { ...server, basePoint: body.basePoint, basePointAt: clock };
      }
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(server)) };
    });
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
    delete global.fetch;
  });

  it('新しい端末でログインすると、アカウントのお気に入りと基準点が入る', async () => {
    server = { favorites: [TOKYO, OSAKA], favoritesAt: 50, basePoint: BP(OSAKA), basePointAt: 50 };
    const synced = vi.fn();
    window.addEventListener(USER_DATA_SYNCED_EVENT, synced);
    stop = startUserDataSync(EMAIL);
    await syncUserData();
    expect(names(readLocal(MAP_SEARCH_STORAGE_KEY))).toEqual(['東京駅', '大阪駅']);
    expect(readLocal(BASE_POINT_STORAGE_KEY).location.name).toBe('大阪駅');
    expect(readLocal(SYNC_META_KEY)).toMatchObject({ email: EMAIL, favoritesAt: 50, basePointAt: 50 });
    expect(synced).toHaveBeenCalled();
    expect(global.fetch.mock.calls.filter(([, o]) => o?.method === 'PUT')).toHaveLength(0);
    window.removeEventListener(USER_DATA_SYNCED_EVENT, synced);
  });

  it('今まで端末にあったお気に入りは、最初の同期でアカウントに上がる', async () => {
    window.localStorage.setItem(MAP_SEARCH_STORAGE_KEY, JSON.stringify([KYOTO]));
    stop = startUserDataSync(EMAIL);
    await syncUserData();
    expect(names(server.favorites)).toEqual(['京都駅']);
    expect(readLocal(SYNC_META_KEY).favoritesAt).toBe(server.favoritesAt);
  });

  it('端末でお気に入りを変えると、少し待ってからアカウントに送られる', async () => {
    stop = startUserDataSync(EMAIL);
    await syncUserData();
    vi.useFakeTimers();
    window.localStorage.setItem(MAP_SEARCH_STORAGE_KEY, JSON.stringify([TOKYO]));
    window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT));
    expect(readLocal(SYNC_META_KEY).favoritesDirty).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    vi.useRealTimers();
    await syncUserData();
    expect(names(server.favorites)).toEqual(['東京駅']);
    expect(readLocal(SYNC_META_KEY).favoritesDirty).toBeUndefined();
  });

  it('通信に失敗しても端末の内容はそのまま、送れていない印も残る', async () => {
    stop = startUserDataSync(EMAIL);
    await syncUserData();
    window.localStorage.setItem(MAP_SEARCH_STORAGE_KEY, JSON.stringify([TOKYO]));
    window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT));
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await syncUserData()).toBe(false);
    expect(names(readLocal(MAP_SEARCH_STORAGE_KEY))).toEqual(['東京駅']);
    expect(readLocal(SYNC_META_KEY).favoritesDirty).toBe(true);
  });
});
