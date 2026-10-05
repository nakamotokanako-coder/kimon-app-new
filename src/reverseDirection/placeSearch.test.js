import { describe, expect, it, vi } from 'vitest';
import { postalCodeOf, sanitizeQuery } from './mapSearch.js';
import { isMapLink, isShortMapLink, parseCoordinates, parseMapLink, splitLinkQuery } from '../../lib/mapLink.js';
import {
  findPlaces,
  normalizeNominatimCandidate,
  placeFromLink,
  rankCandidates,
} from './placeSearch.js';

// 実際に Nominatim が返した形（2026-10-05 に確認）をもとにした見本
const nom = (name, category, type, importance, address = {}, lat = 35.68, lon = 139.76, id = Math.random()) => ({
  name, category, type, importance, address, lat: String(lat), lon: String(lon), osm_type: 'node', osm_id: id, display_name: name,
});
const TOKYO_STATION_RAW = [
  nom('東京駅(改札外)', 'highway', 'footway', 0.04, { city: '千代田区', suburb: '丸の内一丁目' }, 35.6815, 139.7660),
  nom('東京駅;八重洲北口', 'highway', 'footway', 0.04, { city: '千代田区' }, 35.6820, 139.7690),
  nom('東京', 'railway', 'station', 0.61, { state: '東京都', city: '千代田区', suburb: '丸の内一丁目' }, 35.6812, 139.7671),
];
const ISE_RAW = [
  nom('伊勢神宮', 'amenity', 'place_of_worship', 0, { state: '高知県', city: '高知市' }, 33.50, 133.47),
  nom('伊勢神宮', 'information', 'board', 0, { state: '大阪府', city: '枚方市' }, 34.81, 135.70),
  nom('伊勢神宮 内宮', 'amenity', 'place_of_worship', 0, { state: '三重県', city: '伊勢市' }, 34.4550, 136.7253),
];
const ITABASHI_RAW = [
  nom('板橋区役所 志村坂上区民事務所', 'amenity', 'townhall', 0, { state: '東京都', city: '板橋区' }, 35.776, 139.695),
  nom('板橋区役所', 'amenity', 'townhall', 0.26, { state: '東京都', city: '板橋区', suburb: '板橋二丁目' }, 35.7512, 139.7092),
];
const names = (list) => list.map((c) => c.name);
const norm = (raw) => raw.map(normalizeNominatimCandidate);

describe('地図のリンク・座標を読む', () => {
  it('Googleマップのリンクかどうか', () => {
    expect(isMapLink('https://maps.app.goo.gl/AbCdEf123')).toBe(true);
    expect(isMapLink('https://www.google.com/maps/place/x/@35.6,139.7,17z')).toBe(true);
    expect(isMapLink('https://www.google.co.jp/maps?q=35.6,139.7')).toBe(true);
    expect(isMapLink('https://example.com/maps/place/x')).toBe(false);
    expect(isMapLink('カナガーデン')).toBe(false);
    expect(isShortMapLink('https://maps.app.goo.gl/AbCdEf123')).toBe(true);
    expect(isShortMapLink('https://goo.gl/maps/AbCd')).toBe(true);
    expect(isShortMapLink('https://goo.gl/other')).toBe(false);
    expect(isShortMapLink('https://evil.example/maps.app.goo.gl')).toBe(false);
  });

  it('長いリンクから、その場所の座標と名前を取り出す（場所そのものの座標を優先）', () => {
    const link = 'https://www.google.com/maps/place/%E3%82%AB%E3%83%8A%E3%82%AC%E3%83%BC%E3%83%87%E3%83%B3/@35.7000,139.7000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d35.7512345!4d139.7098765!16s';
    expect(parseMapLink(link)).toEqual({ latitude: 35.7512345, longitude: 139.7098765, name: 'カナガーデン' });
    expect(parseMapLink('https://www.google.com/maps/@35.6812,139.7671,15z')).toEqual({ latitude: 35.6812, longitude: 139.7671, name: '' });
    expect(parseMapLink('https://www.google.com/maps?q=35.6812,139.7671')).toMatchObject({ latitude: 35.6812, longitude: 139.7671 });
  });

  it('座標がなく、名前と住所だけのリンクは、その文字を返す（その文字で探し直す）', () => {
    expect(parseMapLink('https://www.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E6%9D%BF%E6%A9%8B%E5%8C%BA%E6%9D%BF%E6%A9%8B2%E4%B8%81%E7%9B%AE&ftid=0x1:0x2'))
      .toEqual({ query: '東京都板橋区板橋2丁目' });
    expect(parseMapLink('https://example.com/?q=1,2')).toBe(null);
  });

  it('座標だけの文字も読める。おかしな値は読まない', () => {
    expect(parseCoordinates('35.6812, 139.7671')).toEqual({ latitude: 35.6812, longitude: 139.7671 });
    expect(parseCoordinates('35.6812 139.7671')).toEqual({ latitude: 35.6812, longitude: 139.7671 });
    expect(parseCoordinates('95, 139')).toBe(null);
    expect(parseCoordinates('173-8501')).toBe(null);
    expect(parseCoordinates('東京駅')).toBe(null);
  });

  it('共有リンクの中の「郵便番号＋住所＋名前」を、探す文字と表示する名前に分ける', () => {
    const got = splitLinkQuery('〒259-1215 神奈川県平塚市寺田縄４９６−１ 神奈川県立花と緑のふれあいセンター「花菜ガーデン」');
    expect(got.search).toBe('神奈川県平塚市寺田縄496-1 神奈川県立花と緑のふれあいセンター「花菜ガーデン」');
    expect(got.name).toBe('花菜ガーデン');
    expect(splitLinkQuery('東京都板橋区板橋2丁目').name).toBe('東京都板橋区板橋2丁目');
    expect(splitLinkQuery('東京都千代田区丸の内1-9-1 東京駅')).toEqual({ search: '東京都千代田区丸の内1-9-1 東京駅', name: '東京駅' });
  });
});

describe('候補の並べ替え', () => {
  it('東京駅: 通路・改札外ではなく、駅そのものを出す', () => {
    const ranked = rankCandidates('東京駅', norm(TOKYO_STATION_RAW));
    expect(names(ranked)).toEqual(['東京駅']);
    expect(ranked[0]).toMatchObject({ type: '駅', label: '駅・東京都千代田区丸の内一丁目', latitude: 35.6812 });
  });

  it('板橋区役所: 本庁舎を出張所より上に', () => {
    expect(names(rankCandidates('板橋区役所', norm(ITABASHI_RAW)))).toEqual(['板橋区役所', '板橋区役所 志村坂上区民事務所']);
  });

  it('伊勢神宮: 同じ名前の神社が全国にあるが、三重県のものを一番上に。ほかも候補として残す', () => {
    const ranked = rankCandidates('伊勢神宮', norm(ISE_RAW));
    expect(ranked[0]).toMatchObject({ name: '伊勢神宮 内宮', address: '三重県伊勢市' });
    expect(ranked.length).toBeGreaterThanOrEqual(2);
  });

  it('郵便番号: 郵便番号の場所を出す', () => {
    const raw = [nom('173-8501', 'place', 'postcode', 0.1, { state: '東京都', city: '板橋区' }, 35.7509, 139.7092)];
    expect(rankCandidates('173-8501', norm(raw))[0]).toMatchObject({ name: '173-8501', label: '郵便番号・東京都板橋区', latitude: 35.7509 });
  });

  it('同じ名前で近くにあるもの（同じ駅の別の路線など）は1つにまとめる。最大5件', () => {
    const many = norm([
      nom('新宿', 'railway', 'station', 0.59, { city: '新宿区' }, 35.6900, 139.7000),
      nom('新宿', 'railway', 'station', 0.59, { city: '新宿区' }, 35.6905, 139.7003),
      nom('新宿', 'railway', 'station', 0.59, { city: '渋谷区' }, 35.6890, 139.7010),
      ...Array.from({ length: 8 }, (_, i) => nom(`新宿${i}`, 'amenity', 'cafe', 0, {}, 35 + i, 139)),
    ]);
    const ranked = rankCandidates('新宿駅', many);
    expect(ranked.filter((c) => c.name === '新宿駅')).toHaveLength(1);
    expect(ranked.length).toBeLessThanOrEqual(5);
    expect(ranked[0].name).toBe('新宿駅');
  });

  it('同じ点数なら、今いる場所に近いほうを上に', () => {
    const list = norm([
      nom('スターバックス', 'amenity', 'cafe', 0, { city: '札幌市' }, 43.06, 141.35),
      nom('スターバックス', 'amenity', 'cafe', 0, { city: '板橋区' }, 35.75, 139.70),
    ]);
    expect(rankCandidates('スターバックス', list, [35.68, 139.76]).map((c) => c.address)).toEqual(['板橋区', '札幌市']);
  });
});

describe('findPlaces（日本全国から探す）', () => {
  const makeFetch = ({ nominatim = [], stations = [], gsi = [] }) => vi.fn(async (url) => {
    const text = String(url);
    if (text.startsWith('https://msearch.gsi.go.jp')) return { ok: true, json: async () => gsi };
    if (text.includes('layer=poi')) return { ok: true, json: async () => stations };
    return { ok: true, json: async () => nominatim };
  });

  it('駅は「東京 駅」の形でも探して、駅そのものを拾う', async () => {
    const fetchImpl = makeFetch({ nominatim: TOKYO_STATION_RAW.slice(0, 2), stations: [TOKYO_STATION_RAW[2]] });
    const found = await findPlaces('東京駅', { fetchImpl });
    expect(names(found)).toEqual(['東京駅']);
    const urls = fetchImpl.mock.calls.map((call) => decodeURIComponent(String(call[0])));
    expect(urls.some((u) => u.includes('scope=jp'))).toBe(true);
    expect(urls.some((u) => u.includes('q=東京+駅') && u.includes('layer=poi'))).toBe(true);
  });

  it('住所は国土地理院の候補を使い、1件に決め打ちしない', async () => {
    const gsi = [
      { geometry: { coordinates: [139.71109, 35.748165] }, properties: { title: '東京都板橋区板橋二丁目' } },
      { geometry: { coordinates: [139.70, 35.75] }, properties: { title: '東京都板橋区板橋' } },
    ];
    const found = await findPlaces('東京都板橋区板橋2丁目', { fetchImpl: makeFetch({ gsi }) });
    expect(names(found)).toEqual(['東京都板橋区板橋二丁目', '東京都板橋区板橋']);
    expect(found[0]).toMatchObject({ source: 'gsi', latitude: 35.748165, longitude: 139.71109 });
  });

  it('名前で探したとき、国土地理院の「名前の一部が合うだけの地名」は混ぜない', async () => {
    const gsi = [{ geometry: { coordinates: [141.36, 43.07] }, properties: { title: '北海道札幌市東区' } }];
    const found = await findPlaces('東京駅', { fetchImpl: makeFetch({ stations: [TOKYO_STATION_RAW[2]], gsi }) });
    expect(names(found)).toEqual(['東京駅']);
  });

  it('どこにも載っていない名前は、0件（見つからないと正直に返す）', async () => {
    expect(await findPlaces('カナガーデン', { fetchImpl: makeFetch({}) })).toEqual([]);
  });

  it('片方の検索が失敗しても、もう片方で続ける。両方だめなら失敗を伝える', async () => {
    const half = vi.fn(async (url) => (String(url).startsWith('https://msearch.gsi.go.jp')
      ? { ok: false, status: 500 }
      : { ok: true, json: async () => ITABASHI_RAW }));
    expect(names(await findPlaces('板橋区役所', { fetchImpl: half }))[0]).toBe('板橋区役所');
    const none = vi.fn(async () => ({ ok: false, status: 502 }));
    await expect(findPlaces('板橋区役所', { fetchImpl: none })).rejects.toThrow();
  });
});

describe('placeFromLink（リンク・座標から場所を出す）', () => {
  it('長いリンクは、その場で読む（外へ問い合わせない）', async () => {
    const fetchImpl = vi.fn();
    const got = await placeFromLink('https://www.google.com/maps/place/Cafe/@35.7,139.7,17z/data=!3d35.7512!4d139.7098', fetchImpl);
    expect(got.place).toMatchObject({ name: 'Cafe', latitude: 35.7512, longitude: 139.7098, source: 'local' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('短いリンクは、入口にたどってもらう', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ latitude: 35.7512, longitude: 139.7098, name: 'カナガーデン' }) }));
    const got = await placeFromLink('https://maps.app.goo.gl/AbCdEf123', fetchImpl);
    expect(got.place).toMatchObject({ name: 'カナガーデン', latitude: 35.7512 });
    expect(decodeURIComponent(String(fetchImpl.mock.calls[0][0]))).toBe('/api/nominatim?resolve=https://maps.app.goo.gl/AbCdEf123');
  });

  it('座標も読める。リンクでも座標でもなければ null', async () => {
    expect((await placeFromLink('35.6812, 139.7671')).place).toMatchObject({ latitude: 35.6812, longitude: 139.7671 });
    expect(await placeFromLink('東京駅')).toBe(null);
  });

  it('スマホの共有リンク（座標がなく「住所＋名前」だけ）は、その住所で場所を出す', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const text = String(url);
      if (text.startsWith('/api/nominatim')) {
        return { ok: true, json: async () => ({ query: '〒259-1215 神奈川県平塚市寺田縄４９６−１ 神奈川県立花と緑のふれあいセンター「花菜ガーデン」' }) };
      }
      return { ok: true, json: async () => [{ geometry: { coordinates: [139.309372, 35.357536] }, properties: { title: '神奈川県平塚市寺田縄４９６番地' } }] };
    });
    const got = await placeFromLink('https://maps.app.goo.gl/4MrU4gV7xxxx', fetchImpl);
    expect(got.place).toMatchObject({ name: '花菜ガーデン', latitude: 35.357536, longitude: 139.309372, address: '神奈川県平塚市寺田縄４９６番地' });
    // 住所検索には、郵便番号を外して、数字とハイフンを半角にそろえた文字を渡す
    expect(decodeURIComponent(String(fetchImpl.mock.calls[1][0]))).toContain('q=神奈川県平塚市寺田縄496-1');
  });

  it('住所でも見つからないリンクは、名前の文字を返す（名前で探し直す）', async () => {
    const fetchImpl = vi.fn(async (url) => (String(url).startsWith('/api/nominatim')
      ? { ok: true, json: async () => ({ query: 'どこかの 「なぞの店」' }) }
      : { ok: true, json: async () => [] }));
    expect(await placeFromLink('https://maps.app.goo.gl/NoCoords', fetchImpl)).toEqual({ query: 'なぞの店' });
  });
});

describe('郵便番号の入力', () => {
  it('郵便番号だけのときは、消さずに郵便番号で探す。住所の前の郵便番号は今までどおり取る', () => {
    expect(postalCodeOf('173-8501')).toBe('173-8501');
    expect(postalCodeOf('〒1738501')).toBe('173-8501');
    expect(postalCodeOf('東京駅')).toBe('');
    expect(sanitizeQuery('〒173-8501')).toBe('173-8501');
    expect(sanitizeQuery('〒173-8501 東京都板橋区板橋2丁目')).toBe('東京都板橋区板橋2丁目');
  });
});
