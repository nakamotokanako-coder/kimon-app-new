import { describe, it, expect, beforeEach } from 'vitest';
import feedbackHandler from '../api/feedback.js';
import { setKvClient } from '../lib/kv.js';
import { buildOmamoriNotice, buildFavoriteNotices } from '../src/notifications/dynamicNotices.js';
import { buildReverseBoard } from '../src/reverseDirection/reverseDirection.js';

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

describe('設定の通知（アプリを開いたときのお知らせ）', () => {
  it('お守りリマインド: 今日まだ引いていなければ出す・引いていれば出さない', () => {
    expect(buildOmamoriNotice({ today: '2026-10-03', openedDate: '2026-10-02' })).toMatchObject({ id: 'omamori-2026-10-03' });
    expect(buildOmamoriNotice({ today: '2026-10-03', openedDate: null })).toBeTruthy();
    expect(buildOmamoriNotice({ today: '2026-10-03', openedDate: '2026-10-03' })).toBe(null);
  });

  it('お気に入りが最高方位: 最高方位にあるお気に入りだけ知らせる', () => {
    const { rankings } = buildReverseBoard({ date: '2026-10-03', hour: 10 });
    const best = rankings[0];
    expect(best.score).toBeGreaterThan(0);
    const base = { name: '東京', latitude: 35.6812, longitude: 139.7671 };
    // 最高方位の向きに約5km離した場所と、その反対側の場所
    const rad = (best.angle * Math.PI) / 180;
    const inBest = { name: '吉の場所', latitude: base.latitude + 0.045 * Math.cos(rad), longitude: base.longitude + 0.055 * Math.sin(rad) };
    const opposite = { name: '反対の場所', latitude: base.latitude - 0.045 * Math.cos(rad), longitude: base.longitude - 0.055 * Math.sin(rad) };
    const notices = buildFavoriteNotices({ today: '2026-10-03', slotHour: 10, rankings, base, favorites: [inBest, opposite] });
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toContain('吉の場所');
    expect(notices[0].body).toContain(best.label);
  });
});

describe('POST /api/feedback', () => {
  let kvFake;
  beforeEach(() => {
    kvFake = makeFakeKv();
    setKvClient(kvFake);
    delete process.env.FEEDBACK_TO;
  });

  it('本文を保存する（未ログインでも送れる）', async () => {
    const res = createRes();
    await feedbackHandler({ method: 'POST', body: { message: ' 地図が見やすいです ' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    const saved = [...kvFake.store.entries()].find(([k]) => k.startsWith('feedback:'));
    expect(saved[1]).toMatchObject({ message: '地図が見やすいです', email: null });
  });

  it('空・長すぎる本文は 400、同じIPは1時間に5件まで', async () => {
    const empty = createRes();
    await feedbackHandler({ method: 'POST', body: { message: '  ' }, headers: {} }, empty);
    expect(empty.statusCode).toBe(400);
    const long = createRes();
    await feedbackHandler({ method: 'POST', body: { message: 'あ'.repeat(2001) }, headers: {} }, long);
    expect(long.statusCode).toBe(400);
    for (let i = 0; i < 5; i += 1) {
      const res = createRes();
      await feedbackHandler({ method: 'POST', body: { message: `意見${i}` }, headers: {} }, res);
      expect(res.statusCode).toBe(200);
    }
    const sixth = createRes();
    await feedbackHandler({ method: 'POST', body: { message: '6件目' }, headers: {} }, sixth);
    expect(sixth.statusCode).toBe(429);
  });
});
