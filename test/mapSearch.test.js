import { describe, expect, it } from 'vitest';
import {
  buildOverpassNameQuery,
  buildOverpassQuery,
  decoratePlaces,
  directionForPoint,
  favoriteKey,
  findFacilityPreset,
  normalizeOverpassElements,
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
    expect(query).toContain('out center 60');
  });

  it('sanitizes name searches before building Overpass regex queries', () => {
    expect(sanitizeOverpassRegex('A"B\\C')).toBe('ABC');
    expect(buildOverpassNameQuery('東京駅', bounds)).toContain('node["name"~"東京駅"]');
  });

  it('normalizes nodes and ways from Overpass elements', () => {
    const places = normalizeOverpassElements([
      { type: 'node', id: 1, lat: 35.11, lon: 139.11, tags: { name: 'A' } },
      { type: 'way', id: 2, center: { lat: 35.12, lon: 139.12 }, tags: { 'name:ja': 'B' } },
      { type: 'node', id: 3, tags: { name: 'missing' } },
    ]);
    expect(places).toHaveLength(2);
    expect(places[1]).toMatchObject({ id: 'way-2', name: 'B', latitude: 35.12, longitude: 139.12 });
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

  it('uses rounded coordinates as favorite identity', () => {
    expect(favoriteKey({ latitude: 35.123456, longitude: 139.987654 })).toBe('35.12346,139.98765');
  });
});

