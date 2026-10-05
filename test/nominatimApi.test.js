import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/nominatim.js';

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
const call = async (query, method = 'GET') => {
  const res = createRes();
  await handler({ method, query }, res);
  return res;
};

afterEach(() => vi.unstubAllGlobals());

describe('nominatim の入口', () => {
  it('地図の範囲の中を探す（今までどおり）', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [{ name: 'A' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await call({ q: 'カフェ', viewbox: '139.7,35.7,139.8,35.6' });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('bounded')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('40');
    expect(url.searchParams.get('countrycodes')).toBe(null);
    expect(res.body).toEqual([{ name: 'A' }]);
  });

  it('scope=jp: 日本全国を、住所の内訳つきで10件。地図の範囲では絞らない', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await call({ q: '東京 駅', scope: 'jp', layer: 'poi', viewbox: '1,2,3,4' });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('countrycodes')).toBe('jp');
    expect(url.searchParams.get('addressdetails')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('accept-language')).toBe('ja');
    expect(url.searchParams.get('layer')).toBe('poi');
    expect(url.searchParams.get('viewbox')).toBe(null);
    expect(res.headers['Cache-Control']).toBe('s-maxage=3600');
  });

  it('GET だけ。q が無ければ 400', async () => {
    expect((await call({ q: 'x' }, 'POST')).statusCode).toBe(405);
    expect((await call({})).statusCode).toBe(400);
  });
});

describe('nominatim の入口: 地図のリンクをたどる（resolve）', () => {
  it('Googleマップ以外のリンクはたどらない', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await call({ resolve: 'https://evil.example/redirect?to=http://169.254.169.254/' });
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('長いリンクは、外へ問い合わせずに読む', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await call({ resolve: 'https://www.google.com/maps/place/Cafe/@35.7,139.7,17z/data=!3d35.7512!4d139.7098' });
    expect(res.body).toEqual({ latitude: 35.7512, longitude: 139.7098, name: 'Cafe' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('短いリンクをたどって、行き先のリンクから場所を読む', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      url: 'https://www.google.com/maps/place/%E3%82%AB%E3%83%8A/@35.70,139.70,17z/data=!3d35.7512!4d139.7098',
      text: async () => '',
    })));
    const res = await call({ resolve: 'https://maps.app.goo.gl/AbCdEf123' });
    expect(res.body).toEqual({ latitude: 35.7512, longitude: 139.7098, name: 'カナ' });
  });

  it('行き先のリンクに座標がなければ、中の文字だけを返す（ページの中身からは座標を拾わない）', async () => {
    // ページの中の center= は、その場所ではなくサーバーのいる場所のことがある（実際に1万km先にピンが立った）
    vi.stubGlobal('fetch', vi.fn(async () => ({
      url: 'https://www.google.com/maps?q=%E3%82%AB%E3%83%8A%E3%82%AC%E3%83%BC%E3%83%87%E3%83%B3&ftid=0x1:0x2',
      text: async () => '<meta content="https://maps.google.com/maps/api/staticmap?center=38.9072%2C-77.0369&zoom=16">',
    })));
    const res = await call({ resolve: 'https://maps.app.goo.gl/AbCdEf123' });
    expect(res.body).toEqual({ query: 'カナガーデン' });
  });

  it('行き先が Googleマップでなければ、場所なしとして返す', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ url: 'https://consent.example.com/', text: async () => '' })));
    expect((await call({ resolve: 'https://maps.app.goo.gl/AbCdEf123' })).body).toEqual({ error: 'no_location' });
  });
});
