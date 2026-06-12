import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import handler from '../api/kaisetsu-full.js';
import { setKvClient } from '../lib/kv.js';
import { signSession, SESSION_COOKIE } from '../lib/session.js';

const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
const AXES = ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'];
const KNOWN_KEY = '陰1局丁卯';
const SECRET = 'test-session-secret';

const ROOT = new URL('..', import.meta.url);
const DATA_PATH = fileURLToPath(new URL('data/kaisetsu/generated/kaisetsu_text_v2.json', ROOT));

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

function fakeKvWithUser(email, status) {
  const store = new Map();
  if (email) store.set(`user:${email}`, { status, createdAt: '2026-01-01T00:00:00.000Z' });
  return { async get(key) { return store.has(key) ? store.get(key) : null; } };
}

function cookie(email) {
  return `${SESSION_COOKIE}=${signSession({ email, exp: Date.now() + 60_000 }, SECRET)}`;
}

const forged = `${SESSION_COOKIE}=eyJlbWFpbCI6InhAeS5jb20iLCJleHAiOjk5OTk5OTk5OTk5OTl9.deadbeef`;

describe('kaisetsu-full API (paid のみ / no-store / 非CDNキャッシュ)', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SECRET;
    if (!existsSync(DATA_PATH)) {
      execFileSync('node', ['scripts/build_kaisetsu_text.mjs'], {
        cwd: fileURLToPath(ROOT),
        stdio: 'ignore',
      });
    }
  });

  afterEach(() => { setKvClient(null); });

  async function call(headers) {
    const res = createRes();
    await handler({ method: 'GET', query: { key: KNOWN_KEY }, headers }, res);
    return res;
  }

  it('未認証は 403、かつ no-store（s-maxage を付けない）', async () => {
    const res = await call(undefined);
    expect(res.statusCode).toBe(403);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.headers['Cache-Control']).not.toContain('s-maxage');
  });

  it('偽造Cookie（署名不正）は 403', async () => {
    setKvClient(fakeKvWithUser('x@y.com', 'paid'));
    const res = await call({ cookie: forged });
    expect(res.statusCode).toBe(403);
  });

  it('有効Cookie + free は 403', async () => {
    setKvClient(fakeKvWithUser('free@example.com', 'free'));
    const res = await call({ cookie: cookie('free@example.com') });
    expect(res.statusCode).toBe(403);
  });

  it('有効Cookie + paid は 200 で mid/full を含む', async () => {
    setKvClient(fakeKvWithUser('paid@example.com', 'paid'));
    const res = await call({ cookie: cookie('paid@example.com') });
    expect(res.statusCode).toBe(200);
    expect(res.body.key).toBe(KNOWN_KEY);
    expect(Object.keys(res.body.palaces).sort()).toEqual([...PALACES].sort());
    const cell = res.body.palaces.kan.goen;
    expect(typeof cell.short).toBe('string');
    expect(typeof cell.mid).toBe('string');
    expect(typeof cell.full).toBe('string');
    const serialized = JSON.stringify(res.body);
    expect(serialized).toContain('mid');
    expect(serialized).toContain('full');
  });

  // 本丸: paid（mid/full入り）レスポンスのヘッダに CDN キャッシュ指示が無いことを固定する。
  it('paid レスポンスのヘッダに s-maxage / public が無く no-store であること（再発防止）', async () => {
    setKvClient(fakeKvWithUser('paid@example.com', 'paid'));
    const res = await call({ cookie: cookie('paid@example.com') });
    expect(res.statusCode).toBe(200);
    const cc = res.headers['Cache-Control'];
    expect(cc).toBe('private, no-store');
    expect(cc).not.toContain('s-maxage');
    expect(cc).not.toContain('stale-while-revalidate');
    expect(cc).not.toContain('public');
    expect(res.headers.Vary).toBe('Cookie');
  });

  it('rejects non-GET with 405（ヘッダは no-store のまま）', async () => {
    const res = createRes();
    await handler({ method: 'POST', query: { key: KNOWN_KEY }, headers: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
});
