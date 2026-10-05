// 場所を名前・住所・地図のリンクから探す（日本全国）。
//   - 名前（駅・神社・役所など）: OpenStreetMap の検索（Nominatim）を日本全国で
//   - 住所・地名: 国土地理院の住所検索
//   - Googleマップのリンクや座標: リンクの文字から場所を読む（無料の検索に載っていないお店のための道）
// どれも無料。候補は1件に決め打ちせず、並べ替えて最大5件を返す。
import { isMapLink, isShortMapLink, parseCoordinates, parseMapLink, splitLinkQuery } from '../../lib/mapLink.js';
import { NOMINATIM_PROXY_PATH, classifyQuery, distanceMeters, sanitizeQuery } from './mapSearch.js';

export const MAX_CANDIDATES = 5;

// 種別の表示名（OpenStreetMap の分類 → ふだんの言葉）
const TYPE_LABELS = {
  'railway:station': '駅',
  'railway:halt': '駅',
  'amenity:townhall': '役所',
  'amenity:place_of_worship': '神社・寺',
  'amenity:cafe': 'カフェ',
  'amenity:restaurant': '飲食店',
  'amenity:hospital': '病院',
  'amenity:school': '学校',
  'amenity:university': '大学',
  'amenity:library': '図書館',
  'leisure:park': '公園',
  'tourism:attraction': '観光地',
  'tourism:museum': '博物館',
  'tourism:hotel': 'ホテル',
  'shop:convenience': 'コンビニ',
  'shop:supermarket': 'スーパー',
  'boundary:administrative': '地名',
  'place:postcode': '郵便番号',
};

// 同じ名前の場所が全国にあるとき、よく知られたほうを上にするための手がかり（名前 → 都道府県）。
// 座標は持たない。検索で見つかった候補のうち、この都道府県にあるものの順位を上げるだけ。
const FAMOUS_PLACE_HINTS = [
  ['伊勢神宮', '三重県'], ['出雲大社', '島根県'], ['厳島神社', '広島県'], ['伏見稲荷', '京都府'],
  ['清水寺', '京都府'], ['金閣寺', '京都府'], ['銀閣寺', '京都府'], ['東大寺', '奈良県'],
  ['春日大社', '奈良県'], ['法隆寺', '奈良県'], ['太宰府天満宮', '福岡県'], ['日光東照宮', '栃木県'],
  ['鶴岡八幡宮', '神奈川県'], ['熱田神宮', '愛知県'], ['善光寺', '長野県'], ['成田山新勝寺', '千葉県'],
  ['中尊寺', '岩手県'], ['金刀比羅宮', '香川県'], ['宇佐神宮', '大分県'], ['熊野本宮大社', '和歌山県'],
];

// はっきりした目的地（順位を上げる）
const CLEAR_POI = new Set([
  'railway:station', 'railway:halt', 'amenity:townhall', 'amenity:place_of_worship',
  'tourism:attraction', 'tourism:museum', 'leisure:park', 'historic:castle',
]);

// 目的地になりにくいもの（通路・出入口・バス停・道路）。順位を大きく下げる
function isPassage(category, type) {
  return category === 'highway' || type === 'subway_entrance' || type === 'platform' || type === 'stop_position';
}

function compact(text) {
  return String(text || '').replace(/[\s　]/g, '').toLowerCase();
}

function addressOf(item) {
  const a = item.address || {};
  const parts = [
    a.province || a.state,
    a.city || a.town || a.village || a.county,
    a.city_district,
    a.suburb,
    a.quarter || a.neighbourhood,
  ].filter(Boolean);
  return [...new Set(parts)].join('');
}

export function normalizeNominatimCandidate(item) {
  const latitude = Number(item.lat);
  const longitude = Number(item.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const kind = `${item.category || ''}:${item.type || ''}`;
  const rawName = item.name || String(item.display_name || '').split(',')[0].trim();
  if (!rawName) return null;
  const typeLabel = TYPE_LABELS[kind] || '';
  // 駅は「東京」のように「駅」なしで登録されているので、分かるように付ける
  const name = typeLabel === '駅' && !rawName.endsWith('駅') ? `${rawName}駅` : rawName;
  const address = addressOf(item);
  return {
    id: `nominatim-${item.osm_type || 'x'}-${item.osm_id || `${latitude},${longitude}`}`,
    name,
    label: [typeLabel, address].filter(Boolean).join('・'),
    address,
    type: typeLabel,
    kind,
    importance: Number(item.importance) || 0,
    latitude,
    longitude,
    source: 'nominatim',
  };
}

export function normalizeGsiCandidate(item) {
  const coords = item?.geometry?.coordinates;
  const title = String(item?.properties?.title || '').trim();
  const longitude = Number(coords?.[0]);
  const latitude = Number(coords?.[1]);
  if (!title || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    id: `gsi-${latitude},${longitude}`,
    name: title,
    label: '住所・地名',
    address: title,
    type: '',
    kind: 'gsi',
    importance: 0,
    latitude,
    longitude,
    source: 'gsi',
  };
}

/** 候補の点数（高いほど上）。指示の優先順位: 完全一致 → はっきりした目的地 → 前方一致 → 部分一致 → 重要度 → 近さ */
export function scoreCandidate(query, candidate, center = null) {
  const q = compact(query);
  const qBase = q.endsWith('駅') ? q.slice(0, -1) : q;
  const name = compact(candidate.name);
  const [category, type] = String(candidate.kind || ':').split(':');
  let score = 0;
  if (name === q) score += 100;
  else if (name.startsWith(q)) score += 20;
  else if (name.includes(q)) score += 10;
  else if (qBase && name.includes(qBase)) score += 5;
  if (CLEAR_POI.has(candidate.kind)) score += 30;
  if (q.endsWith('駅') && candidate.type === '駅') score += 40;
  if (isPassage(category, type)) score -= 80;
  if (candidate.source === 'gsi') score += classifyQuery(query) === 'address' ? 60 : 0;
  const hint = FAMOUS_PLACE_HINTS.find(([word]) => q.includes(compact(word)));
  if (hint && String(candidate.address || '').includes(hint[1])) score += 120;
  score += candidate.importance * 50;
  if (center) {
    const km = distanceMeters(center, [candidate.latitude, candidate.longitude]) / 1000;
    score -= Math.min(km, 2000) / 100; // 近いほうを少しだけ上に（同点のときの決め手）
  }
  return score;
}

/** 並べ替えて、同じ場所（同じ名前で500m以内）をまとめ、上から MAX_CANDIDATES 件 */
export function rankCandidates(query, candidates, center = null, max = MAX_CANDIDATES) {
  const scored = (candidates || [])
    .filter(Boolean)
    .map((candidate) => ({ candidate, score: scoreCandidate(query, candidate, center) }))
    .filter((entry) => entry.score > -40) // 通路・出入口だけの候補は出さない
    .sort((a, b) => b.score - a.score);
  const picked = [];
  for (const { candidate } of scored) {
    const duplicate = picked.some((other) => (
      compact(other.name) === compact(candidate.name)
      && distanceMeters([other.latitude, other.longitude], [candidate.latitude, candidate.longitude]) < 500
    ));
    if (!duplicate) picked.push(candidate);
    if (picked.length >= max) break;
  }
  return picked;
}

async function nominatimNationwide(q, fetchImpl, layer = '') {
  const params = new URLSearchParams({ q, scope: 'jp' });
  if (layer) params.set('layer', layer);
  const response = await fetchImpl(`${NOMINATIM_PROXY_PATH}?${params.toString()}`);
  if (!response.ok) throw new Error(`Nominatim proxy error: HTTP ${response.status}`);
  return (await response.json()).map(normalizeNominatimCandidate).filter(Boolean);
}

async function gsiAddressSearch(q, fetchImpl) {
  const response = await fetchImpl(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`);
  if (!response.ok) throw new Error(`GSI error: HTTP ${response.status}`);
  return (await response.json()).map(normalizeGsiCandidate).filter(Boolean);
}

/** 地図のリンク・座標から場所を1つ取り出す。リンクでも座標でもなければ null。 */
export async function placeFromLink(text, fetchImpl = fetch) {
  const raw = String(text || '').trim();
  const point = parseCoordinates(raw);
  if (point) return { place: { id: `point-${point.latitude},${point.longitude}`, name: '指定した場所', label: '座標', latitude: point.latitude, longitude: point.longitude, source: 'local' } };
  if (!isMapLink(raw)) return null;
  let parsed = parseMapLink(raw);
  if ((!parsed || !('latitude' in parsed)) && isShortMapLink(raw)) {
    const response = await fetchImpl(`${NOMINATIM_PROXY_PATH}?${new URLSearchParams({ resolve: raw }).toString()}`);
    parsed = response.ok ? await response.json() : null;
  }
  if (parsed && 'latitude' in parsed) {
    return {
      place: {
        id: `link-${parsed.latitude},${parsed.longitude}`,
        name: parsed.name || 'リンクの場所',
        label: 'Googleマップのリンク',
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        source: 'local',
      },
    };
  }
  // リンクに座標がなく、「住所＋名前」の文字だけが入っていた（スマホの共有リンクに多い）→ その住所で探す
  const query = parsed?.query || '';
  if (!query) return { query: '' };
  const { search, name } = splitLinkQuery(query);
  try {
    const hit = (await gsiAddressSearch(search, fetchImpl))[0];
    if (hit) {
      return {
        place: {
          id: `link-${hit.latitude},${hit.longitude}`,
          name: name || hit.name,
          label: 'Googleマップのリンク',
          address: hit.name,
          latitude: hit.latitude,
          longitude: hit.longitude,
          source: 'gsi',
        },
      };
    }
  } catch {
    // 住所で見つからなければ、下の「名前で探す」に進む
  }
  return { query: name || search };
}

/**
 * 名前・住所から、日本全国の候補を探す（最大5件）。
 * どちらかの検索が失敗しても、もう一方の結果で続ける。両方失敗したら throw。
 */
export async function findPlaces(text, { center = null, fetchImpl = fetch } = {}) {
  const query = sanitizeQuery(text);
  if (!query) return [];
  const isAddress = classifyQuery(query) === 'address';
  const jobs = [
    nominatimNationwide(query, fetchImpl),
    gsiAddressSearch(query, fetchImpl),
  ];
  // 駅は「東京」のように「駅」なしで登録されている。「東京 駅」の形でも探して、駅そのものを拾う
  if (query.endsWith('駅') && query.length > 1) {
    jobs.push(nominatimNationwide(`${query.slice(0, -1)} 駅`, fetchImpl, 'poi'));
  }
  const settled = await Promise.allSettled(jobs);
  if (settled.every((result) => result.status === 'rejected')) throw settled[0].reason;
  const [names, addresses, stations] = settled.map((result) => (result.status === 'fulfilled' ? result.value : []));
  // 国土地理院は、名前の一部が合うだけの地名も大量に返す。住所として探したとき以外は、名前に検索語を含むものだけ使う
  const q = compact(query);
  const usableAddresses = isAddress ? addresses : addresses.filter((item) => compact(item.name).includes(q));
  return rankCandidates(query, [...(stations || []), ...names, ...usableAddresses], center);
}
