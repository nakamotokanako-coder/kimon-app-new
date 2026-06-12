import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import handler from '../api/kaisetsu.js';
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

function paidCookie(email = 'paid@example.com') {
  const token = signSession({ email, exp: Date.now() + 60_000 }, SECRET);
  return `${SESSION_COOKIE}=${token}`;
}

function getBody(headers) {
  const res = createRes();
  handler({ method: 'GET', query: { key: KNOWN_KEY }, headers }, res);
  return res;
}

describe('kaisetsu API (short-only / 認証非依存 / CDNキャッシュ可)', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SECRET;
    if (!existsSync(DATA_PATH)) {
      execFileSync('node', ['scripts/build_kaisetsu_text.mjs'], {
        cwd: fileURLToPath(ROOT),
        stdio: 'ignore',
      });
    }
  });

  it('returns 200 with all 8 palaces x 5 axes short for a known key', () => {
    const res = getBody(undefined);
    expect(res.statusCode).toBe(200);
    expect(res.body.key).toBe(KNOWN_KEY);
    expect(res.body.version).toBe('2.1');
    expect(Object.keys(res.body.palaces).sort()).toEqual([...PALACES].sort());
    for (const palace of PALACES) {
      const axes = res.body.palaces[palace];
      expect(Object.keys(axes).sort()).toEqual([...AXES].sort());
      for (const axis of AXES) {
        // 各セルは short のみ（mid/full キーを持たない）= 3a-1 と同一構造。
        expect(Object.keys(axes[axis])).toEqual(['short']);
        expect(typeof axes[axis].short).toBe('string');
        expect(axes[axis].short.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the CDN cache header (s-maxage) — このURLは認証非依存なのでキャッシュ可', () => {
    const res = getBody(undefined);
    expect(res.headers['Cache-Control']).toBe(
      'public, s-maxage=86400, stale-while-revalidate=604800',
    );
  });

  // 漏洩4ケース: 未認証 / 偽造Cookie / 有効Cookie(free相当) / 有効Cookie(paid相当)
  // いずれも /api/kaisetsu は short のみ（mid/full 不在）。paid でも変わらないのが本丸。
  const forged = `${SESSION_COOKIE}=eyJlbWFpbCI6ImF0dGFja2VyQGV4YW1wbGUuY29tIiwiZXhwIjo5OTk5OTk5OTk5OTk5fQ.deadbeef`;
  const cases = [
    ['(a) unauthenticated', undefined],
    ['(b) forged (bad-signature) cookie', { cookie: forged }],
    ['(c) valid cookie (free相当)', { cookie: paidCookie('free@example.com') }],
    ['(d) valid cookie (paid相当)', { cookie: paidCookie('paid@example.com') }],
  ];
  for (const [label, headers] of cases) {
    it(`never leaks mid or full: ${label}`, () => {
      const res = getBody(headers);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('full');
      expect(serialized).not.toContain('mid');
    });
  }

  it('認証で中身が変わらない＝3a-1 とバイト同一（auth-independent ハッシュロック）', () => {
    // 同一URL・同一keyのレスポンスは Cookie 状態に依らず完全一致でなければならない
    // （CDN が Cookie を見ずキャッシュしても安全であることの保証）。
    const hash = (headers) => createHash('sha256')
      .update(JSON.stringify(getBody(headers).body)).digest('hex');
    const anon = hash(undefined);
    expect(hash({ cookie: forged })).toBe(anon);
    expect(hash({ cookie: paidCookie('free@example.com') })).toBe(anon);
    expect(hash({ cookie: paidCookie('paid@example.com') })).toBe(anon);
  });

  it('returns 404 for an unknown key', () => {
    const res = createRes();
    handler({ method: 'GET', query: { key: '存在しない局key' } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'unknown_key' });
  });

  it('returns 400 when key is missing or blank', () => {
    const resMissing = createRes();
    handler({ method: 'GET', query: {} }, resMissing);
    expect(resMissing.statusCode).toBe(400);
    expect(resMissing.body).toEqual({ error: 'bad_request' });

    const resBlank = createRes();
    handler({ method: 'GET', query: { key: '   ' } }, resBlank);
    expect(resBlank.statusCode).toBe(400);
    expect(resBlank.body).toEqual({ error: 'bad_request' });
  });

  it('rejects non-GET methods with 405', () => {
    const res = createRes();
    handler({ method: 'POST', query: { key: KNOWN_KEY } }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });
});
