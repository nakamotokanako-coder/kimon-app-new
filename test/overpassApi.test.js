import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/overpass.js';

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

describe('overpass API proxy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts only POST requests', async () => {
    const res = createRes();

    await handler({ method: 'GET', body: '' }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('rejects an empty query', async () => {
    const res = createRes();

    await handler({ method: 'POST', body: '   ' }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'empty overpass query' });
  });

  it('forwards raw Overpass QL and retries the fallback upstream', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) return { ok: false, status: 504 };
      return { ok: true, json: async () => ({ elements: [{ id: 1 }] }) };
    }));
    const res = createRes();

    await handler({ method: 'POST', body: '[out:json];node(1);out;' }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ elements: [{ id: 1 }] });
    expect(res.headers['Cache-Control']).toBe('s-maxage=300');
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://overpass-api.de/api/interpreter');
    expect(calls[0].options).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
      body: '[out:json];node(1);out;',
    });
  });
});
