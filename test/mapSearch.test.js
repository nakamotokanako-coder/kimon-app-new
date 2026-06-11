import { describe, expect, it } from 'vitest';
import {
  boundsToNominatimViewbox,
  buildOverpassNameQuery,
  buildOverpassQuery,
  classifyQuery,
  decoratePlaces,
  deleteFavorite,
  directionForPoint,
  favoriteDisplayName,
  favoriteKind,
  favoriteKey,
  filterKichiPlaces,
  findFacilityPreset,
  nominatimSearch,
  NOMINATIM_PROXY_PATH,
  normalizeNominatimResults,
  normalizeOverpassElements,
  overpassFetch,
  OVERPASS_PROXY_PATH,
  pickNearestAddressCandidate,
  renameFavorite,
  sanitizeQuery,
  sanitizeOverpassRegex,
} from '../src/reverseDirection/mapSearch.js';

const bounds = {
  getSouth: () => 35.1,
  getWest: () => 139.1,
  getNorth: () => 35.2,
  getEast: () => 139.2,
};

const rankings = [
  { palace: 'north', label: '北', angle: 0, tone: 'great', score: 70 },
  { palace: 'east', label: '東', angle: 90, tone: 'bad', score: -40 },
  { palace: 'south', label: '南', angle: 180, tone: 'weak', score: 10 },
  { palace: 'west', label: '西', angle: 270, tone: 'neutral', score: 0 },
];

describe('map search helpers', () => {
  it('maps facility words to search presets', () => {
    expect(findFacilityPreset('近くのコンビニ')?.label).toBe('コンビニ');
    expect(findFacilityPreset('station')?.label).toBe('駅');
    expect(findFacilityPreset('東京都庁')).toBeNull();
  });

  it('builds bounded Overpass queries', () => {
    const query = buildOverpassQuery(['node["shop"="convenience"]'], bounds);
    expect(query).toContain('node["shop"="convenience"](35.10000,139.10000,35.20000,139.20000);');
    expect(query).toContain('[timeout:15]');
    expect(query).toContain('out center 60');
  });

  it('builds Nominatim viewboxes in lon-lat order', () => {
    expect(boundsToNominatimViewbox(bounds)).toBe('139.10000,35.20000,139.20000,35.10000');
  });

  it('sanitizes pasted map queries without stripping address block numbers', () => {
    expect(sanitizeQuery('〒115-0055　東京都北区赤羽西4丁目35-6')).toBe('東京都北区赤羽西4丁目35-6');
    expect(sanitizeQuery('  1150055 東京都北区赤羽西4-35-6  ')).toBe('東京都北区赤羽西4-35-6');
    expect(sanitizeQuery('赤羽西4-35-6')).toBe('赤羽西4-35-6');
  });

  it('classifies addresses and poi search terms', () => {
    expect(classifyQuery('東京都北区赤羽西4丁目35-6')).toBe('address');
    expect(classifyQuery('赤羽西4-35-6')).toBe('address');
    expect(classifyQuery('図書館')).toBe('poi');
    expect(classifyQuery('ライフ仲宿店')).toBe('poi');
  });

  it('sanitizes name searches before building Overpass regex queries', () => {
    expect(sanitizeOverpassRegex('A"B\\C')).toBe('ABC');
    expect(buildOverpassNameQuery('東京駅', bounds)).toContain('node["name"~"東京駅"]');
  });

  it('normalizes nodes and ways from Overpass elements', () => {
    const places = normalizeOverpassElements([
      {
        type: 'node',
        id: 1,
        lat: 35.11,
        lon: 139.11,
        tags: {
          name: 'A',
          branch: 'A支店',
          brand: 'Aブランド',
          operator: 'A運営',
          'addr:province': '東京都',
          'addr:city': '千代田区',
          'addr:neighbourhood': '丸の内一丁目',
          'addr:housenumber': '1',
          'addr:housename': 'Aビル',
        },
      },
      {
        type: 'way',
        id: 2,
        center: { lat: 35.12, lon: 139.12 },
        tags: {
          'name:ja': 'B',
          'addr:city': '渋谷区',
          'addr:neighbourhood': '道玄坂',
        },
      },
      { type: 'node', id: 3, tags: { name: 'missing' } },
    ]);
    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({
      branch: 'A支店',
      brand: 'Aブランド',
      operator: 'A運営',
      addressLine: '東京都 千代田区 丸の内一丁目 1 Aビル',
      subLabel: 'A支店',
    });
    expect(places[1]).toMatchObject({ id: 'way-2', name: 'B', latitude: 35.12, longitude: 139.12 });
    expect(places[1]).toMatchObject({
      addressLine: '渋谷区 道玄坂',
      subLabel: '渋谷区 道玄坂',
    });
  });

  it('normalizes Nominatim results into internal places', () => {
    const places = normalizeNominatimResults([
      { osm_type: 'node', osm_id: 10, lat: '35.12', lon: '139.13', name: '図書館' },
      { osm_type: 'way', osm_id: 11, lat: 'bad', lon: '139.14', display_name: 'missing' },
      { lat: '35.15', lon: '139.16', display_name: 'カフェ, 東京都' },
    ]);
    expect(places).toEqual([
      { id: 'nominatim-node-10', name: '図書館', latitude: 35.12, longitude: 139.13 },
      { id: 'nominatim-poi-35.15,139.16', name: 'カフェ', latitude: 35.15, longitude: 139.16 },
    ]);
  });

  it('returns the same direction bucket as the map fan angles', () => {
    const center = [35, 139];
    expect(directionForPoint(center, [35.01, 139], rankings, { mode: 'plane', declination: false })?.label).toBe('北');
    expect(directionForPoint(center, [35, 139.01], rankings, { mode: 'plane', declination: false })?.label).toBe('東');
  });

  it('decorates and sorts places by score, then distance', () => {
    const center = [35, 139];
    const decorated = decoratePlaces([
      { name: 'bad east', latitude: 35, longitude: 139.01 },
      { name: 'good north', latitude: 35.01, longitude: 139 },
    ], center, rankings, { mode: 'plane', declination: false });
    expect(decorated[0].name).toBe('good north');
    expect(decorated[0].direction.score).toBe(70);
    expect(decorated[0].distanceM).toBeGreaterThan(0);
  });

  it('filters places to positive direction scores only when enabled', () => {
    const places = [
      { name: 'good', direction: { score: 80 } },
      { name: 'neutral', direction: { score: 0 } },
      { name: 'bad', direction: { score: -15 } },
      { name: 'missing' },
    ];

    expect(filterKichiPlaces(places, false)).toBe(places);
    expect(filterKichiPlaces(places, true).map((place) => place.name)).toEqual(['good']);
  });

  it('uses rounded coordinates as favorite identity', () => {
    expect(favoriteKey({ latitude: 35.123456, longitude: 139.987654 })).toBe('35.12346,139.98765');
  });

  it('uses label as the favorite display name when present', () => {
    expect(favoriteDisplayName({ name: '東京都板橋区幸町66番4号', label: '実家' })).toBe('実家');
    expect(favoriteDisplayName({ name: '東京都板橋区幸町66番4号' })).toBe('東京都板橋区幸町66番4号');
    expect(favoriteDisplayName({ name: '東京都板橋区幸町66番4号', label: '   ' })).toBe('東京都板橋区幸町66番4号');
  });

  it('treats favorites without kind as spot favorites', () => {
    expect(favoriteKind({ name: '既存お気に入り' })).toBe('spot');
    expect(favoriteKind({ name: '自宅', kind: 'home' })).toBe('home');
    expect(favoriteKind({ name: '不明', kind: 'other' })).toBe('spot');
  });

  it('renames a favorite by storing label without changing existing fields', () => {
    const favorites = [
      { name: 'A address', latitude: 35.1, longitude: 139.1 },
      { name: 'B address', latitude: 35.2, longitude: 139.2 },
    ];

    const renamed = renameFavorite(favorites, favoriteKey(favorites[0]), '  会社  ');

    expect(renamed[0]).toEqual({ name: 'A address', latitude: 35.1, longitude: 139.1, label: '会社' });
    expect(renamed[1]).toBe(favorites[1]);
    expect(favoriteDisplayName(renamed[0])).toBe('会社');
  });

  it('clears favorite label when the renamed value is blank', () => {
    const favorites = [{ name: 'A address', latitude: 35.1, longitude: 139.1, label: '会社' }];

    const renamed = renameFavorite(favorites, favoriteKey(favorites[0]), '   ');

    expect(renamed[0]).toEqual({ name: 'A address', latitude: 35.1, longitude: 139.1 });
    expect(favoriteDisplayName(renamed[0])).toBe('A address');
  });

  it('deletes only the targeted favorite', () => {
    const favorites = [
      { name: 'A address', latitude: 35.1, longitude: 139.1 },
      { name: 'B address', latitude: 35.2, longitude: 139.2 },
    ];

    expect(deleteFavorite(favorites, favoriteKey(favorites[0]))).toEqual([favorites[1]]);
  });

  it('posts raw Overpass QL to the same-origin proxy', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ elements: [{ id: 1 }] }) };
    };

    const data = await overpassFetch('[out:json];node(1);out;', fetchImpl);

    expect(data.elements).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OVERPASS_PROXY_PATH);
    expect(calls[0].options).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: '[out:json];node(1);out;',
    });
    expect(calls[0].options.body.startsWith('data=')).toBe(false);
  });

  it('throws when the Overpass proxy returns an error', async () => {
    const fetchImpl = async () => ({ ok: false, status: 502 });

    await expect(overpassFetch('[out:json];node(1);out;', fetchImpl)).rejects.toThrow('HTTP 502');
  });

  it('searches Nominatim through the same-origin proxy', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => [{ osm_type: 'node', osm_id: 1, lat: '35.1', lon: '139.1', name: '図書館' }],
      };
    };

    const data = await nominatimSearch('〒115-0055 図書館', bounds, fetchImpl);

    expect(data[0]).toMatchObject({ name: '図書館', latitude: 35.1, longitude: 139.1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].startsWith(`${NOMINATIM_PROXY_PATH}?`)).toBe(true);
    expect(calls[0]).toContain('q=%E5%9B%B3%E6%9B%B8%E9%A4%A8');
    expect(calls[0]).toContain('viewbox=139.10000%2C35.20000%2C139.20000%2C35.10000');
  });

  it('throws when the Nominatim proxy returns an error', async () => {
    const fetchImpl = async () => ({ ok: false, status: 502 });

    await expect(nominatimSearch('図書館', bounds, fetchImpl)).rejects.toThrow('HTTP 502');
  });

  it('picks the address search candidate nearest to the home point', () => {
    const home = [35.681236, 139.767125];
    const candidates = [
      {
        geometry: { coordinates: [145.3609, 43.3301] },
        properties: { title: 'Nemuro Kawagishi' },
      },
      {
        geometry: { coordinates: [139.7035, 35.6909] },
        properties: { title: 'Saitama Kawagishi' },
      },
    ];

    expect(pickNearestAddressCandidate(candidates, home)?.properties.title).toBe('Saitama Kawagishi');
  });

  it('uses the first address candidate when home is unavailable or the list is empty', () => {
    const first = { geometry: { coordinates: [139, 35] }, properties: { title: 'First' } };

    expect(pickNearestAddressCandidate([first], null)).toBe(first);
    expect(pickNearestAddressCandidate([], [35, 139])).toBeNull();
  });
});
