import { bearingFor, directionIndexFor, initialBearing } from './mapFan.js';

export const MAP_SEARCH_STORAGE_KEY = 'kimon_map_favorites_v1';

export const OVERPASS_PROXY_PATH = '/api/overpass';
export const NOMINATIM_PROXY_PATH = '/api/nominatim';

const PREFECTURES = [
  '北海道',
  '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

const ADDRESS_COMPONENT_RE = /(丁目|番地|[0-9０-９]+番([0-9０-９]+号)?|[0-9０-９]+号|郡|区|市|町|村)/;
const ADDRESS_BLOCK_RE = /[0-9０-９]+[-－ー][0-9０-９]+/;
const ADDRESS_LIKE_RE = /^[0-9０-９\s 　\-－ー]+$/;

export function sanitizeQuery(raw) {
  return String(raw ?? '')
    .replace(/〒/g, '')
    .replace(/^\s*\d{3}[-－ー]?\d{4}\s*/, '')
    .replace(/\u3000/g, ' ')
    .trim();
}

export function classifyQuery(text) {
  const query = sanitizeQuery(text);
  if (!query) return 'poi';
  if (PREFECTURES.some((prefecture) => query.includes(prefecture))) return 'address';
  if (ADDRESS_COMPONENT_RE.test(query)) return 'address';
  if (ADDRESS_BLOCK_RE.test(query)) return 'address';
  if (ADDRESS_LIKE_RE.test(query)) return 'address';
  return 'poi';
}

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
  return `[out:json][timeout:15];(${body});out center ${limit};`;
}

export function boundsToNominatimViewbox(bounds) {
  return [
    bounds.getWest(),
    bounds.getNorth(),
    bounds.getEast(),
    bounds.getSouth(),
  ].map((value) => Number(value).toFixed(5)).join(',');
}

export function buildOverpassNameQuery(word, bounds, limit = 40) {
  const safe = sanitizeOverpassRegex(word);
  const bbox = [
    bounds.getSouth(),
    bounds.getWest(),
    bounds.getNorth(),
    bounds.getEast(),
  ].map((value) => Number(value).toFixed(5)).join(',');
  return `[out:json][timeout:15];(node["name"~"${safe}"](${bbox});way["name"~"${safe}"](${bbox}););out center ${limit};`;
}

function cleanTagValue(value) {
  return String(value ?? '').trim();
}

function joinTags(tags, keys) {
  return keys
    .map((key) => cleanTagValue(tags?.[key]))
    .filter(Boolean)
    .join(' ');
}

export function normalizeOverpassElements(elements) {
  return (elements || [])
    .map((item) => {
      const latitude = Number(item.lat ?? item.center?.lat);
      const longitude = Number(item.lon ?? item.center?.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      const tags = item.tags || {};
      const branch = cleanTagValue(tags.branch || tags['branch:ja']);
      const brand = cleanTagValue(tags.brand || tags['brand:ja']);
      const operator = cleanTagValue(tags.operator);
      const addressLine = joinTags(tags, [
        'addr:province',
        'addr:city',
        'addr:suburb',
        'addr:neighbourhood',
        'addr:street',
        'addr:block_number',
        'addr:housenumber',
        'addr:housename',
      ]);
      const subLabel = branch || joinTags(tags, ['addr:city', 'addr:neighbourhood']);
      return {
        id: `${item.type || 'poi'}-${item.id || `${latitude},${longitude}`}`,
        name: tags['name:ja'] || tags.name || '名称なし',
        branch,
        brand,
        operator,
        addressLine,
        subLabel,
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
  const response = await fetchImpl(OVERPASS_PROXY_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: query,
  });
  if (!response.ok) {
    throw new Error(`Overpass proxy error: HTTP ${response.status}`);
  }
  return response.json();
}

export function normalizeNominatimResults(results) {
  return (results || [])
    .map((item) => {
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      const displayName = item.name || String(item.display_name || '').split(',')[0].trim();
      return {
        id: `nominatim-${item.osm_type || item.type || 'poi'}-${item.osm_id || `${latitude},${longitude}`}`,
        name: displayName || '名称なし',
        latitude,
        longitude,
      };
    })
    .filter(Boolean);
}

export async function nominatimSearch(query, bounds, fetchImpl = fetch) {
  const text = sanitizeQuery(query);
  if (!text) return [];
  const params = new URLSearchParams({ q: text });
  if (bounds) params.set('viewbox', boundsToNominatimViewbox(bounds));
  const response = await fetchImpl(`${NOMINATIM_PROXY_PATH}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Nominatim proxy error: HTTP ${response.status}`);
  }
  return normalizeNominatimResults(await response.json());
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

export function filterKichiPlaces(places, enabled) {
  const list = places || [];
  if (!enabled) return list;
  return list.filter((place) => Number(place.direction?.score ?? 0) > 0);
}

export function favoriteKey(place) {
  return `${Number(place.latitude).toFixed(5)},${Number(place.longitude).toFixed(5)}`;
}

export function favoriteDisplayName(favorite) {
  return favorite?.label?.trim() ? favorite.label : favorite?.name;
}

export function renameFavorite(favorites, targetKey, label) {
  const nextLabel = String(label ?? '').trim();
  return (favorites || []).map((favorite) => {
    if (favoriteKey(favorite) !== targetKey) return favorite;
    const { label: _label, ...rest } = favorite;
    return nextLabel ? { ...rest, label: nextLabel } : rest;
  });
}

export function deleteFavorite(favorites, targetKey) {
  return (favorites || []).filter((favorite) => favoriteKey(favorite) !== targetKey);
}
