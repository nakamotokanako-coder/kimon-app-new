import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import handler from '../api/kaisetsu.js';
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
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

/** user:{email} のみ持つインメモリ fake KV。 */
function fakeKvWithUser(email, status) {
  const store = new Map();
  if (email) store.set(`user:${email}`, { status, createdAt: '2026-01-01T00:00:00.000Z' });
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
  };
}

/** 指定 email/status の有効セッション Cookie ヘッダを作る。 */
function sessionCookie(email) {
  const token = signSession({ email, exp: Date.now() + 60_000 }, SECRET);
  return `${SESSION_COOKIE}=${token}`;
}

describe('kaisetsu API (short delivery + paid unlock)', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SECRET;
    // 生成物は .gitignore 済（コミットしない）。未生成なら一度だけビルドして用意する。
    if (!existsSync(DATA_PATH)) {
      execFileSync('node', ['scripts/build_kaisetsu_text.mjs'], {
        cwd: fileURLToPath(ROOT),
        stdio: 'ignore',
      });
    }
  });

  afterEach(() => {
    setKvClient(null); // 実クライアントに戻す（次テストが明示的に差し替える）
  });

  it('returns 200 with all 8 palaces x 5 axes short for a known key', async () => {
    const res = createRes();
    await handler({ method: 'GET', query: { key: KNOWN_KEY } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.key).toBe(KNOWN_KEY);
    expect(res.body.version).toBe('2.1');
    expect(res.headers['Cache-Control']).toBe(
      'public, s-maxage=86400, stale-while-revalidate=604800',
    );

    expect(Object.keys(res.body.palaces).sort()).toEqual([...PALACES].sort());
    for (const palace of PALACES) {
      const axes = res.body.palaces[palace];
      expect(Object.keys(axes).sort()).toEqual([...AXES].sort());
      for (const axis of AXES) {
        expect(typeof axes[axis].short).toBe('string');
        expect(axes[axis].short.length).toBeGreaterThan(0);
      }
    }
  });

  // (a) 未認証: mid/full 不在（現行維持）
  it('(a) never leaks mid or full for an unauthenticated request', async () => {
    const res = createRes();
    await handler({ method: 'GET', query: { key: KNOWN_KEY } }, res);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('full');
    expect(serialized).not.toContain('mid');
  });

  // (b) 署名不正の偽造Cookie: (a) と同じ
  it('(b) never leaks mid or full for a forged (bad-signature) cookie', async () => {
    setKvClient(fakeKvWithUser('attacker@example.com', 'paid'));
    const forged = `${SESSION_COOKIE}=eyJlbWFpbCI6ImF0dGFja2VyQGV4YW1wbGUuY29tIiwiZXhwIjo5OTk5OTk5OTk5OTk5fQ.deadbeef`;
    const res = createRes();
    await handler({ method: 'GET', query: { key: KNOWN_KEY }, headers: { cookie: forged } }, res);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('full');
    expect(serialized).not.toContain('mid');
  });

  // (c) 有効Cookie + status=free: (a) と同じ
  it('(c) never leaks mid or full for a valid cookie with status=free', async () => {
    const email = 'free@example.com';
    setKvClient(fakeKvWithUser(email, 'free'));
    const res = createRes();
    await handler(
      { method: 'GET', query: { key: KNOWN_KEY }, headers: { cookie: sessionCookie(email) } },
      res,
    );

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('full');
    expect(serialized).not.toContain('mid');
  });

  // (d) 有効Cookie + status=paid: mid / full を含む
  it('(d) includes mid and full for a valid cookie with status=paid', async () => {
    const email = 'paid@example.com';
    setKvClient(fakeKvWithUser(email, 'paid'));
    const res = createRes();
    await handler(
      { method: 'GET', query: { key: KNOWN_KEY }, headers: { cookie: sessionCookie(email) } },
      res,
    );

    expect(res.statusCode).toBe(200);
    const cell = res.body.palaces.kan.goen;
    expect(typeof cell.short).toBe('string');
    expect(typeof cell.mid).toBe('string');
    expect(typeof cell.full).toBe('string');
    expect(cell.mid.length).toBeGreaterThan(0);
    expect(cell.full.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(res.body);
    expect(serialized).toContain('mid');
    expect(serialized).toContain('full');
  });

  it('returns 404 for an unknown key', async () => {
    const res = createRes();
    await handler({ method: 'GET', query: { key: '存在しない局key' } }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'unknown_key' });
  });

  it('returns 400 when key is missing or blank', async () => {
    const resMissing = createRes();
    await handler({ method: 'GET', query: {} }, resMissing);
    expect(resMissing.statusCode).toBe(400);
    expect(resMissing.body).toEqual({ error: 'bad_request' });

    const resBlank = createRes();
    await handler({ method: 'GET', query: { key: '   ' } }, resBlank);
    expect(resBlank.statusCode).toBe(400);
    expect(resBlank.body).toEqual({ error: 'bad_request' });
  });

  it('rejects non-GET methods with 405', async () => {
    const res = createRes();
    await handler({ method: 'POST', query: { key: KNOWN_KEY } }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });
});
