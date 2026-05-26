import { bearingFor, directionIndexFor, initialBearing } from './mapFan.js';

export const MAP_SEARCH_STORAGE_KEY = 'kimon_map_favorites_v1';

export const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export const FACILITY_PRESETS = [
  {
    label: 'コンビニ',
    keywords: ['コンビニ', 'convenience', 'セブン', 'ローソン', 'ファミマ'],
    selectors: ['node["shop"="convenience"]', 'way["shop"="convenience"]'],
  },
  {
    label: '駅',
    keywords: ['駅', 'station', 'railway'],
    selectors: ['node["railway"="station"]', 'way["railway"="station"]'],
  },
  {
    label: 'カフェ',
    keywords: ['カフェ', 'cafe', '喫茶'],
    selectors: ['node["amenity"="cafe"]', 'way["amenity"="cafe"]'],
  },
  {
    label: 'スーパー',
    keywords: ['スーパー', 'supermarket'],
    selectors: ['node["shop"="supermarket"]', 'way["shop"="supermarket"]'],
  },
  {
    label: '公園',
    keywords: ['公園', 'park'],
    selectors: ['node["leisure"="park"]', 'way["leisure"="park"]'],
  },
  {
    label: '神社',
    keywords: ['神社', 'jinja', 'shrine'],
    selectors: [
      'node["amenity"="place_of_worship"]["religion"="shinto"]',
      'way["amenity"="place_of_worship"]["religion"="shinto"]',
    ],
  },
];

export function findFacilityPreset(word) {
  const normalized = (word || '').trim().toLowerCase();
  if (!normalized) return null;
  return FACILITY_PRESETS.find((preset) => (
    preset.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  )) || null;
}

export function sanitizeOverpassRegex(word) {
  return (word || '').replace(/[\\"]/g, '').trim();
}

export function buildOverpassQuery(selectors, bounds, limit = 60) {
  const bbox = [
    bounds.getSouth(),
    bounds.getWest(),
    bounds.getNorth(),
    bounds.getEast(),
  ].map((value) => Number(value).toFixed(5)).join(',');
  const body = selectors.map((selector) => `${selector}(${bbox});`).join('');
  return `[out:json][timeout:20];(${body});out center ${limit};`;
}

export function buildOverpassNameQuery(word, bounds, limit = 40) {
  const safe = sanitizeOverpassRegex(word);
  const bbox = [
    bounds.getSouth(),
    bounds.getWest(),
    bounds.getNorth(),
    bounds.getEast(),
  ].map((value) => Number(value).toFixed(5)).join(',');
  return `[out:json][timeout:20];(node["name"~"${safe}"](${bbox});way["name"~"${safe}"](${bbox}););out center ${limit};`;
}

export function normalizeOverpassElements(elements) {
  return (elements || [])
    .map((item) => {
      const latitude = Number(item.lat ?? item.center?.lat);
      const longitude = Number(item.lon ?? item.center?.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        id: `${item.type || 'poi'}-${item.id || `${latitude},${longitude}`}`,
        name: item.tags?.['name:ja'] || item.tags?.name || '名称なし',
        latitude,
        longitude,
      };
    })
    .filter(Boolean);
}

export function distanceMeters(from, to) {
  const earthRadius = 6371000;
  const dLat = (to[0] - from[0]) * Math.PI / 180;
  const dLon = (to[1] - from[1]) * Math.PI / 180;
  const lat1 = from[0] * Math.PI / 180;
  const lat2 = to[0] * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function overpassFetch(query, fetchImpl = fetch) {
  let lastError;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: query,
      });
      if (!response.ok) {
        lastError = new Error(`Overpass API error: HTTP ${response.status}`);
        continue;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('All Overpass endpoints failed');
}

export function pickNearestAddressCandidate(candidates, home) {
  if (!candidates?.length) return null;
  if (!home || candidates.length === 1) return candidates[0];
  return candidates
    .map((candidate) => {
      const coords = candidate?.geometry?.coordinates;
      if (!coords || coords.length < 2) return null;
      const longitude = Number(coords[0]);
      const latitude = Number(coords[1]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        candidate,
        distance: distanceMeters(home, [latitude, longitude]),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance)[0]?.candidate || candidates[0];
}

function circularDistance(a, b) {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

export function directionForPoint(center, latlng, rankings, bearingOptions = {}) {
  if (!rankings?.length) return null;
  const bearing = initialBearing(center, latlng);
  return rankings.reduce((best, item) => {
    const angle = bearingFor(directionIndexFor(item), bearingOptions);
    const delta = circularDistance(bearing, angle);
    if (!best || delta < best.delta) return { item, delta };
    return best;
  }, null)?.item || null;
}

export function decoratePlaces(places, center, rankings, bearingOptions = {}) {
  return (places || [])
    .map((place) => {
      const latlng = [place.latitude, place.longitude];
      const direction = directionForPoint(center, latlng, rankings, bearingOptions);
      return {
        ...place,
        distanceM: distanceMeters(center, latlng),
        direction,
      };
    })
    .sort((a, b) => {
      const scoreDiff = (b.direction?.score ?? -999) - (a.direction?.score ?? -999);
      if (scoreDiff !== 0) return scoreDiff;
      return a.distanceM - b.distanceM;
    });
}

export function favoriteKey(place) {
  return `${Number(place.latitude).toFixed(5)},${Number(place.longitude).toFixed(5)}`;
}
