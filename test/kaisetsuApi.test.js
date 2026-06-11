import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import handler from '../api/kaisetsu.js';

const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
const AXES = ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'];
const KNOWN_KEY = '陰1局丁卯';

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

describe('kaisetsu API (short delivery)', () => {
  beforeAll(() => {
    // 生成物は .gitignore 済（コミットしない）。未生成なら一度だけビルドして用意する。
    if (!existsSync(DATA_PATH)) {
      execFileSync('node', ['scripts/build_kaisetsu_text.mjs'], {
        cwd: fileURLToPath(ROOT),
        stdio: 'ignore',
      });
    }
  });

  it('returns 200 with all 8 palaces x 5 axes short for a known key', () => {
    const res = createRes();
    handler({ method: 'GET', query: { key: KNOWN_KEY } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.key).toBe(KNOWN_KEY);
    expect(res.body.version).toBe('2.0');
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

  it('never leaks mid or full in the response payload', () => {
    const res = createRes();
    handler({ method: 'GET', query: { key: KNOWN_KEY } }, res);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('full');
    expect(serialized).not.toContain('mid');
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
