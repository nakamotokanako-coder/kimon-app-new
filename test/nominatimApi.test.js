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

  const hop = (location) => ({ status: 302, headers: { get: (name) => (name.toLowerCase() === 'location' ? location : null) } });

  it('短いリンクの「行き先」の文字から場所を読む（行き先のページは開かない）', async () => {
    const fetchMock = vi.fn(async () => hop('https://www.google.com/maps/place/%E3%82%AB%E3%83%8A/@35.70,139.70,17z/data=!3d35.7512!4d139.7098'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await call({ resolve: 'https://maps.app.goo.gl/AbCdEf123' });
    expect(res.body).toEqual({ latitude: 35.7512, longitude: 139.7098, name: 'カナ' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });

  it('行き先に座標がなければ、中の「住所＋名前」の文字を返す（スマホの共有リンク）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => hop('https://www.google.com/maps?q=%E3%80%92259-1215+%E7%A5%9E%E5%A5%88%E5%B7%9D%E7%9C%8C%E5%B9%B3%E5%A1%9A%E5%B8%82%E5%AF%BA%E7%94%B0%E7%B8%84%EF%BC%94%EF%BC%99%EF%BC%96%E2%88%92%EF%BC%91&ftid=0x1:0x2')));
    const res = await call({ resolve: 'https://maps.app.goo.gl/AbCdEf123' });
    expect(res.body).toEqual({ query: '〒259-1215 神奈川県平塚市寺田縄４９６−１' });
  });

  it('短いリンクが2段になっていても、たどる', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(hop('https://goo.gl/maps/XyZ'))
      .mockResolvedValueOnce(hop('https://www.google.com/maps/@35.6812,139.7671,15z'));
    vi.stubGlobal('fetch', fetchMock);
    expect((await call({ resolve: 'https://maps.app.goo.gl/AbCdEf123' })).body).toMatchObject({ latitude: 35.6812, longitude: 139.7671 });
  });

  it('行き先が Googleマップでなければ、場所なしとして返す（その結果は覚えておかない）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => hop('https://consent.example.com/')));
    const res = await call({ resolve: 'https://maps.app.goo.gl/AbCdEf123' });
    expect(res.body).toEqual({ error: 'no_location' });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
