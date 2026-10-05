import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ic } from '../utils/icons.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  BEARING_LABELS,
  MAP_FAN,
  MAP_FAN_COLORS,
  bearingFor,
  buildFanLayerSpecs,
  clampLabelPoint,
  destPoint,
  directionIndexFor,
  getDistanceProfile,
  getFanColor,
  isNegativeTone,
  isPositiveTone,
  liveLineColor,
  outerEdgeKm,
  readBearingSettings,
  resolveBearingMode,
  sectorPolygon,
  writeBearingSettings,
} from './mapFan.js';
import { isOverseas } from './geoRegion.js';
import BearingControls from './BearingControls.jsx';
import MapGuide, { hasSeenMapGuide, markMapGuideSeen } from './MapGuide.jsx';
import { findPlaces, placeFromLink } from './placeSearch.js';
import {
  FACILITY_PRESETS,
  MAP_SEARCH_STORAGE_KEY,
  buildOverpassQuery,
  classifyQuery,
  decoratePlaces,
  deleteFavorite,
  describeCenterOffset,
  distanceMeters,
  favoriteKey,
  favoriteDisplayName,
  favoriteKind,
  filterKichiPlaces,
  findFacilityPreset,
  mergePlaces,
  nominatimSearch,
  normalizeOverpassElements,
  overpassFetch,
  renameFavorite,
  sanitizeQuery,
} from './mapSearch.js';
import { getMiniBoardToneClass } from './reverseDirection.js';
import { BADGE_LABEL } from './FusionCard.jsx';

const LABEL_MODE = {
  compact: { className: 'is-compact', showScore: true },
  fullscreen: { className: 'is-fullscreen', showScore: true },
};

const MAP_SEARCH_CHANGED_EVENT = 'kimon-map-favorites-changed';
const LIVE_LOCATION_STORAGE_KEY = 'kimon_map_live_on_v1';
const LIVE_WATCH_OPTIONS = { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 };

function scoreText(score) {
  return `${score > 0 ? '+' : ''}${score}`;
}

function scoreColor(tone) {
  if (isPositiveTone(tone)) return '#bfe0ff';
  if (isNegativeTone(tone)) return '#ffc0bc';
  return '#d8d6cf';
}

function buildBearingOptions(center, bearingMode, useDeclination) {
  return {
    center,
    mode: bearingMode,
    declination: useDeclination,
  };
}

// 地図中心インジケータ用の表示辞書・整形（幾何計算は describeCenterOffset に委譲）。
const CENTER_INDICATOR_ARROWS = {
  N: '↑', NE: '↗', E: '→', SE: '↘',
  S: '↓', SW: '↙', W: '←', NW: '↖',
};

function formatCenterIndicatorDistance(meters) {
  if (!Number.isFinite(meters)) return '-';
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`;
}

function describeCenterIndicatorKichi(direction) {
  if (!direction) return { label: '', color: '' };
  const toneClass = getMiniBoardToneClass(direction.score, direction.palaceScore);
  return {
    label: BADGE_LABEL[toneClass] || '',
    color: getFanColor(direction.tone),
  };
}

// 距離を切り替えるボタンの選択肢(km)。時盤は近場、日盤は遠出の距離。
const DISTANCE_CHOICES = {
  jiban: [0.5, 2, 5, 10],
  nichiban: [50, 100, 200],
};
// 方位を選んで場所を探すとき、何kmまでを探すか（距離を選んでいないときの既定）。
const DEFAULT_DIRECTION_SEARCH_KM = { jiban: 2, nichiban: 100 };

function distanceChoiceLabel(km) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km}km`;
}

// 選んだ方位の短い説明。点数・吉凶と、その方位に入っているもの（reverseDirection.js の reasons）だけで作る。
const DIRECTION_TONE_TEXT = {
  daikichi: 'とくに使いやすい方位です。',
  shokichi: '使いやすい方位です。',
  churitsu: '良くも悪くもない方位です。',
  kyo: 'できれば避けたい方位です。',
};

// 結果を取れなかったときの逃げ道: Googleマップで同じ言葉を、その場所を中心に探すリンク（開くだけ。APIは使わない）。
export function googleMapsSearchUrl(word, latlng, zoom = 15) {
  const lat = Number(latlng?.[0]);
  const lng = Number(latlng?.[1]);
  if (!word || !Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  const z = Math.min(18, Math.max(8, Math.round(zoom)));
  return `https://www.google.com/maps/search/${encodeURIComponent(word)}/@${lat.toFixed(5)},${lng.toFixed(5)},${z}z`;
}

export function describeDirection(item) {
  if (!item) return '';
  const tone = getMiniBoardToneClass(item.score, item.palaceScore);
  const gate = item.palaceData?.hachimon;
  const others = (item.reasons || []).filter((reason) => reason && reason !== gate).slice(0, 3);
  const lead = DIRECTION_TONE_TEXT[tone] || '';
  return others.length ? `${lead}${others.join('・')}が入っています。` : lead;
}

// 距離リングのラベル位置（基準点からの方位角）と、表示する最小の輪の半径(px)。
const RING_LABEL_BEARING = 70;
const RING_LABEL_MIN_PX = 44;

// 方位ラベルを地図の枠内へ引き戻す（縦長のスマホ地図で東西・南が枠外に出るのを防ぐ）。
// 枠の隅に寄せたラベルがズームボタン・地図切替などのコントロールに隠れる場合は、
// 基準点側へさらに引き戻す。
function fitLabelInView(map, center, labelPoint, labelSize) {
  const size = map.getSize();
  const origin = map.latLngToContainerPoint(center);
  let fitted = clampLabelPoint(
    origin,
    map.latLngToContainerPoint(labelPoint),
    size,
    { x: labelSize[0] / 2 + 4, y: labelSize[1] / 2 + 4 },
  );
  const containerRect = map.getContainer().getBoundingClientRect();
  const controlRects = [...map.getContainer().querySelectorAll('.leaflet-control:not(.leaflet-control-attribution)')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      left: r.left - containerRect.left - labelSize[0] / 2,
      right: r.right - containerRect.left + labelSize[0] / 2,
      top: r.top - containerRect.top - labelSize[1] / 2,
      bottom: r.bottom - containerRect.top + labelSize[1] / 2,
    }));
  const hidden = (p) => controlRects.some((r) => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom);
  const start = fitted;
  for (let t = 0.95; t > 0.3 && hidden(fitted); t -= 0.05) {
    fitted = { x: origin.x + (start.x - origin.x) * t, y: origin.y + (start.y - origin.y) * t };
  }
  return map.containerPointToLatLng(L.point(fitted.x, fitted.y));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '-';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

function placeSubLabel(place) {
  return String(place?.subLabel || place?.branch || place?.addressLine || '').trim();
}

// 検索結果の一覧に出す件数（地図のピンは全部出す。番号はこの件数まで）
const LIST_MAX = 20;

function placeNumberLabel(number) {
  return ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][number] || String(number);
}

/** 近場（時盤）と遠出（日盤）の目安の境目 */
export const FAR_TRIP_M = 50000;

/** 選んだ場所の距離が、今の盤の目安と合わないときの案内。合っていれば null */
export function modeHintFor(profileKey, distanceM) {
  if (!Number.isFinite(distanceM)) return null;
  if (profileKey === 'jiban' && distanceM >= FAR_TRIP_M) {
    return { text: '遠出は、日盤で見るのが目安です。', cta: '日盤で見る' };
  }
  if (profileKey === 'nichiban' && distanceM < FAR_TRIP_M) {
    return { text: '近場は、時盤で見るのが目安です。', cta: '時盤で見る' };
  }
  return null;
}

export const DISTANCE_STORAGE_PREFIX = 'kimon-map-distance-';

/** 前に選んだ距離（その盤の選択肢にあるものだけ）。無ければ null */
export function readSavedDistance(profileKey) {
  try {
    const km = Number(window.localStorage.getItem(`${DISTANCE_STORAGE_PREFIX}${profileKey}`));
    const choices = DISTANCE_CHOICES[profileKey] || DISTANCE_CHOICES.jiban;
    return choices.includes(km) ? km : null;
  } catch {
    return null;
  }
}

function favoritePayload(place, kind = favoriteKind(place)) {
  return {
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    kind,
    ...(place.branch ? { branch: place.branch } : {}),
    ...(place.brand ? { brand: place.brand } : {}),
    ...(place.operator ? { operator: place.operator } : {}),
    ...(place.addressLine ? { addressLine: place.addressLine } : {}),
    ...(place.subLabel ? { subLabel: place.subLabel } : {}),
  };
}

function toneClass(tone) {
  if (isPositiveTone(tone)) return 'is-good';
  if (isNegativeTone(tone)) return 'is-bad';
  return 'is-neutral';
}

function placeMarkerHtml(item, favorite = false, markerNo = null) {
  const tone = item.direction?.tone || 'neutral';
  const score = item.direction?.score ?? 0;
  const sign = score > 0 ? '+' : score < 0 ? '-' : '·';
  const markerLabel = markerNo ? placeNumberLabel(markerNo) : sign;
  return `<div class="direction-poi-pin ${toneClass(tone)} ${favorite ? 'is-favorite' : ''} ${markerNo ? 'is-numbered' : ''}"><span>${markerLabel}</span></div>`;
}

function ScrollWindow({ children, className = '' }) {
  return (
    <div className={`direction-scroll-window ${className}`.trim()}>
      {children}
    </div>
  );
}

export default function DirectionMap({
  location,
  rankings,
  bestPalace,
  profileKey = 'jiban',
  showScale = false,
  focusFavoriteKey = '',
  showSearchControls = true,
  showPlacePanel = true,
  // PR-2.6/PR-D2: お気に入りの「フルリスト」節を独立して開閉する（既定は従来どおり表示）。
  // 時盤お散歩(jiban)・日盤遠出(nichiban)の新レイアウトが「すべて見る」タップで true にする。
  showFavoritesSection = true,
  // 選んでいる方位（ユーザーが押した方位）。bestPalace（一番評価の高い方位）とは別に持つ。
  selectedPalace = null,
  onSelectPalace,
  // 選んだ場所を、もう一方の盤（時盤⇔日盤）で見るとき。carryPlace は、そこから引き継いだ場所
  onSeeInOtherMode,
  carryPlace = null,
  conditionLabel = '',   // 選んだ方位のパネルに小さく出す条件（例: 17:00-19:00 の時盤）
  goodOnly,              // 設定「凶方位の表示」の逆（渡されたときは「吉方位のみ表示」と連動する）
  onGoodOnlyChange,
  onOpenDetail,          // 選んだ方位の詳しい内容（方位詳細）へ
  autoGuide = false,     // true: 初めて地図を開いたときに、説明書を1回だけ自動で出す
  onSetBasePoint,        // ([経度, 緯度], 名前) → 探した場所を基準点にする
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  // フルスクリーン時の検索UI折りたたみ（時盤お散歩=jiban・日盤遠出=nichiban共通）。
  const [fullscreenSearchOpen, setFullscreenSearchOpen] = useState(false);
  const [bearingMode, setBearingMode] = useState(() => readBearingSettings().mode);
  const [useDeclination, setUseDeclination] = useState(() => readBearingSettings().declination);
  // 今見えている地図の端までの距離(km)。扇の外縁伸縮＋平面/球面の自動切替に使う（moveend/zoomendで更新）。
  const [viewEdgeKm, setViewEdgeKm] = useState(null);
  // 地図中心インジケータ: 基準点→地図中心の方位・距離・吉凶（moveend/zoomendで更新）。
  const [centerOffset, setCenterOffset] = useState(null);
  const [bearingPanelOpen, setBearingPanelOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  // 説明書: 初めて地図を開いたときに1回だけ自動で出す。閉じたら、次からは自動では出さない。
  useEffect(() => {
    if (autoGuide && !hasSeenMapGuide()) setGuideOpen(true);
  }, [autoGuide]);
  const closeGuide = () => {
    markMapGuideSeen();
    setGuideOpen(false);
  };
  const [mapQuery, setMapQuery] = useState('');
  const [mapStatus, setMapStatus] = useState('');
  const [mapError, setMapError] = useState(null);
  const [mapSearching, setMapSearching] = useState(false);
  const [needsAreaSearch, setNeedsAreaSearch] = useState(false);
  // 種類の検索: 速い検索の結果を先に出し、くわしい検索の結果があとから足される。その「あとから」を待っている間 true。
  const [moreSearching, setMoreSearching] = useState(false);
  // 名前・住所で探したときの候補（複数あるとき。1つに決め打ちせず、選んでもらう）
  const [candidates, setCandidates] = useState([]);
  const searchSeqRef = useRef(0);
  const [searchResults, setSearchResults] = useState([]);
  const [kichiOnlyPlaces, setKichiOnlyPlaces] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  // 選んだ方位のパネルで選んでいる場所の種類と、距離の切り替え
  const [panelCategory, setPanelCategory] = useState('カフェ');
  // 選んだ距離は覚えておく（時盤と日盤で別々に。次に開いたときも同じ距離で探す）
  const [distanceKm, setDistanceKm] = useState(() => readSavedDistance(profileKey));
  const onSelectPalaceRef = useRef(onSelectPalace);
  onSelectPalaceRef.current = onSelectPalace;
  const [editingFavoriteKey, setEditingFavoriteKey] = useState(null);
  const [favoriteLabelDraft, setFavoriteLabelDraft] = useState('');
  const [liveOn, setLiveOn] = useState(false);
  const [livePos, setLivePos] = useState(null);
  const [liveStatus, setLiveStatus] = useState(() => {
    try {
      return window.localStorage.getItem(LIVE_LOCATION_STORAGE_KEY) === 'true'
        ? '現在地は手動でONにすると表示します。'
        : '';
    } catch {
      return '';
    }
  });
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = window.localStorage.getItem(MAP_SEARCH_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  // アカウントから届いたお気に入り（別の端末で追加・削除したもの）を地図にも反映する。
  useEffect(() => {
    const handleSynced = (event) => {
      if (!event.detail?.favorites) return;
      try {
        const saved = window.localStorage.getItem(MAP_SEARCH_STORAGE_KEY);
        setFavorites(saved ? JSON.parse(saved) : []);
      } catch {
        // 読めないときは今の表示のまま
      }
    };
    // 設定の画面でお気に入りを消したときも、地図の一覧を合わせる
    const handleChanged = (event) => {
      if (Array.isArray(event.detail)) setFavorites(event.detail);
    };
    window.addEventListener('kimon-userdata-synced', handleSynced);
    window.addEventListener(MAP_SEARCH_CHANGED_EVENT, handleChanged);
    return () => {
      window.removeEventListener('kimon-userdata-synced', handleSynced);
      window.removeEventListener(MAP_SEARCH_CHANGED_EVENT, handleChanged);
    };
  }, []);
  const mapRef = useRef(null);
  const mapNodeRef = useRef(null);
  const layerGroupRef = useRef(null);
  const liveLayerRef = useRef(null);
  const watchIdRef = useRef(null);
  const viewKeyRef = useRef('');
  const lastAreaSearchRef = useRef(null);
  const suppressAreaPromptRef = useRef(false);
  // 背景タイルの国内/海外切替用。地理院タイルは日本専用のため、海外座標では全球対応タイルへ差し替える。
  const baseRegionRef = useRef(null); // 'jp' | 'overseas'（直近に適用したリージョン）
  const baseLayersRef = useRef([]); // 現在マップに乗っているベースタイルレイヤ群
  const baseLayersControlRef = useRef(null); // 国内の地図/航空写真 切替コントロール
  const center = useMemo(() => [location.latitude, location.longitude], [location.latitude, location.longitude]);
  const centerRef = useRef(center);
  useEffect(() => { centerRef.current = center; }, [center]);
  const bearingOptions = useMemo(
    () => buildBearingOptions(center, bearingMode, useDeclination),
    [bearingMode, center, useDeclination],
  );
  // 方位法の単一変更ハンドラ。選択を端末に保存し、再マウント・時盤↔日盤をまたいで保持する。
  const handleBearingChange = (next) => {
    setBearingMode(next.mode);
    setUseDeclination(next.declination);
    writeBearingSettings(next);
  };
  const bearingSummary = `${bearingMode === 'plane' ? BEARING_LABELS.mode_plane : BEARING_LABELS.mode_sphere}・${useDeclination ? BEARING_LABELS.declination_on : BEARING_LABELS.declination_off}`;
  const profile = getDistanceProfile(profileKey);
  const labelMode = isFullscreen ? LABEL_MODE.fullscreen : LABEL_MODE.compact;
  const decoratedFavorites = useMemo(
    () => decoratePlaces(favorites, center, rankings, bearingOptions),
    [bearingOptions, center, favorites, rankings],
  );
  // 「吉方位のみ表示」: 設定の「凶方位の表示」と同じ値を使う（単体で使うときは自前の state）。
  const kichiOnly = typeof goodOnly === 'boolean' ? goodOnly : kichiOnlyPlaces;
  const setKichiOnly = (value) => {
    if (typeof goodOnly === 'boolean' && onGoodOnlyChange) onGoodOnlyChange(value);
    else setKichiOnlyPlaces(value);
  };
  const selectedItem = useMemo(
    () => (selectedPalace ? (rankings || []).find((item) => item.palace === selectedPalace) || null : null),
    [rankings, selectedPalace],
  );
  // 方位を選んでいるときは、その方位の中にある場所だけを出す（方位 × 場所の種類）。
  const visibleSearchResults = useMemo(
    () => (selectedItem
      ? searchResults.filter((place) => place.direction?.palace === selectedItem.palace)
      : filterKichiPlaces(searchResults, kichiOnly)),
    [kichiOnly, searchResults, selectedItem],
  );
  const distanceChoices = DISTANCE_CHOICES[profileKey] || DISTANCE_CHOICES.jiban;
  const numberedSearchResults = useMemo(
    () => visibleSearchResults.slice(0, LIST_MAX).map((item, index) => ({
      item,
      markerNo: index + 1,
    })),
    [visibleSearchResults],
  );

  const saveFavorites = (nextFavorites) => {
    setFavorites(nextFavorites);
    try {
      window.localStorage.setItem(MAP_SEARCH_STORAGE_KEY, JSON.stringify(nextFavorites));
      window.dispatchEvent(new CustomEvent(MAP_SEARCH_CHANGED_EVENT, { detail: nextFavorites }));
    } catch {
      setMapStatus('お気に入りを端末に保存できませんでした。');
    }
  };

  const addFavorite = (place, kind = 'spot') => {
    const key = favoriteKey(place);
    if (favorites.some((item) => favoriteKey(item) === key)) return;
    saveFavorites([...favorites, favoritePayload(place, kind)]);
    setMapStatus(kind === 'home' ? `${place.name}を拠点に追加しました。` : `${place.name}をお気に入りに追加しました。`);
  };

  const removeFavorite = (place) => {
    const key = favoriteKey(place);
    saveFavorites(favorites.filter((item) => favoriteKey(item) !== key));
    setMapStatus(`${place.name}をお気に入りから削除しました。`);
  };

  const toggleFavoriteKind = (place) => {
    const key = favoriteKey(place);
    const existing = favorites.find((item) => favoriteKey(item) === key);
    if (!existing) {
      addFavorite(place, 'home');
      return;
    }
    const nextKind = favoriteKind(existing) === 'home' ? 'spot' : 'home';
    saveFavorites(favorites.map((item) => (
      favoriteKey(item) === key ? { ...item, kind: nextKind } : item
    )));
    setMapStatus(nextKind === 'home' ? `${favoriteDisplayName(existing)}を拠点にしました。` : `${favoriteDisplayName(existing)}をお気に入りに戻しました。`);
  };

  const editingFavorite = useMemo(
    () => decoratedFavorites.find((item) => favoriteKey(item) === editingFavoriteKey) || null,
    [decoratedFavorites, editingFavoriteKey],
  );

  const openFavoriteEditor = (favorite) => {
    setEditingFavoriteKey(favoriteKey(favorite));
    setFavoriteLabelDraft(favoriteDisplayName(favorite) || '');
  };

  const closeFavoriteEditor = () => {
    setEditingFavoriteKey(null);
    setFavoriteLabelDraft('');
  };

  const saveFavoriteLabel = () => {
    if (!editingFavoriteKey) return;
    saveFavorites(renameFavorite(favorites, editingFavoriteKey, favoriteLabelDraft));
    setMapStatus('お気に入りの名前を保存しました。');
    closeFavoriteEditor();
  };

  const deleteEditingFavorite = () => {
    if (!editingFavoriteKey || !editingFavorite) return;
    const name = favoriteDisplayName(editingFavorite) || editingFavorite.name;
    if (!window.confirm(`「${name}」を削除しますか?`)) return;
    saveFavorites(deleteFavorite(favorites, editingFavoriteKey));
    setMapStatus(`${name}をお気に入りから削除しました。`);
    closeFavoriteEditor();
  };

  const clearPlaceMarkers = () => {
    setSearchResults([]);
    setSelectedPlace(null);
    setCandidates([]);
  };

  const clearLiveLayer = () => {
    liveLayerRef.current?.clearLayers();
  };

  const stopLiveLocation = () => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setLiveOn(false);
    setLivePos(null);
    setLiveStatus('');
    clearLiveLayer();
    try {
      window.localStorage.setItem(LIVE_LOCATION_STORAGE_KEY, 'false');
    } catch {
      // localStorage is only a convenience for the toggle state.
    }
  };

  const toggleLiveLocation = () => {
    if (liveOn) {
      stopLiveLocation();
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLiveStatus('この端末では現在地を取得できません。');
      return;
    }
    setLiveOn(true);
    setLiveStatus('現在地を取得しています。');
    try {
      window.localStorage.setItem(LIVE_LOCATION_STORAGE_KEY, 'true');
    } catch {
      // localStorage is only a convenience for the toggle state.
    }
  };

  const runFacilitySearch = async (word, preset) => {
    const map = mapRef.current;
    if (!map) return;
    const text = sanitizeQuery(word);
    lastAreaSearchRef.current = { type: 'preset', word: preset.label, preset };
    setNeedsAreaSearch(false);
    setMapStatus(`${preset.label}を表示中の地図範囲で検索しています。`);
    const bounds = map.getBounds();
    const seq = searchSeqRef.current;
    const show = (places) => {
      const decorated = decoratePlaces(places, center, rankings, bearingOptions);
      setSelectedPlace(null);
      setSearchResults(decorated);
      setMapStatus(decorated.length
        ? `${text}を${decorated.length}件表示しました。ピンの色はその場所の方位評価です。`
        : `${text}はこの地図範囲では見つかりませんでした。地図を動かして再検索してください。`);
    };
    // 検索は2つを同時に頼む。
    //   速い検索（Nominatim）: 1秒ほどで返る。件数は少なめ
    //   くわしい検索（Overpass）: 件数は多いが、混むと10〜30秒かかったり失敗したりする
    // 速いほうの結果を先に出して、くわしいほうが届いたら足す。待たせない。
    const detailed = overpassFetch(buildOverpassQuery(preset.selectors, bounds))
      .then((data) => normalizeOverpassElements(data.elements).slice(0, 60));
    let quick = null;
    try {
      quick = (await nominatimSearch(preset.label, bounds)).slice(0, 40);
    } catch {
      quick = null;
    }
    if (quick && quick.length > 0) {
      show(quick);
      setMoreSearching(true);
      detailed
        .then((full) => {
          if (seq !== searchSeqRef.current) return; // 別の検索を始めていたら、古い結果は足さない
          show(mergePlaces(full, quick));
        })
        .catch(() => {
          // くわしい検索が失敗しても、速い検索の結果はそのまま使える
        })
        .finally(() => {
          if (seq === searchSeqRef.current) setMoreSearching(false);
        });
      return;
    }
    // 速い検索で出なかったときは、くわしい検索を待つ（失敗したら、呼び出し元が案内を出す）。
    show(await detailed);
  };

  const runPoiSearch = async (word) => {
    const map = mapRef.current;
    if (!map) return [];
    const text = sanitizeQuery(word);
    lastAreaSearchRef.current = { type: 'poi', word: text };
    setNeedsAreaSearch(false);
    setMapStatus(`${text}を表示中の地図範囲で検索しています。`);
    const places = await nominatimSearch(text, map.getBounds());
    const decorated = decoratePlaces(
      places.slice(0, 40),
      center,
      rankings,
      bearingOptions,
    );
    setSelectedPlace(null);
    setSearchResults(decorated);
    setMapStatus(decorated.length
      ? `${text}を${decorated.length}件表示しました。ピンの色はその場所の方位評価です。`
      : `${text}はこの地図範囲では見つかりませんでした。地図を動かして再検索してください。`);
    return decorated;
  };

  // 候補を1つ選んで、地図に出す（行き先として。基準点は変えない）
  const choosePlace = (candidate) => {
    const place = decoratePlaces([candidate], center, rankings, bearingOptions)[0];
    setSearchResults([]);
    setCandidates([]);
    setSelectedPlace(place);
    setNeedsAreaSearch(false);
    const map = mapRef.current;
    if (map) {
      suppressAreaPromptRef.current = true;
      map.fitBounds(L.latLngBounds([center, [place.latitude, place.longitude]]).pad(0.35), {
        maxZoom: profile.initialZoom + 2,
      });
    }
    setMapStatus(`${place.name}を表示しました。基準点から${formatDistance(place.distanceM)}、${place.direction?.label || '該当なし'}です。`);
    return place;
  };

  // もう一方の盤から引き継いだ場所を、この地図でも選んだ状態にする
  const choosePlaceRef = useRef(choosePlace);
  choosePlaceRef.current = choosePlace;
  useEffect(() => {
    if (!carryPlace) return undefined;
    const timer = window.setTimeout(() => choosePlaceRef.current(carryPlace), 300);
    return () => window.clearTimeout(timer);
  }, [carryPlace]);
  const otherModeHint = modeHintFor(profileKey, selectedPlace?.distanceM);

  // 名前・住所・地図のリンクで探す（日本全国）。
  //   1. Googleマップのリンクや座標なら、その場所をそのまま出す
  //   2. 名前なら、まず今の地図の中を探す（「スターバックス」のように近くに何件もあるもの）
  //   3. 地図の中に無ければ、日本全国から探して、候補を最大5件出す
  const runNameSearch = async (text) => {
    const linked = await placeFromLink(text);
    if (linked?.place) {
      lastAreaSearchRef.current = null;
      choosePlace(linked.place);
      return;
    }
    const word = linked ? sanitizeQuery(linked.query) : text;
    if (!word) {
      lastAreaSearchRef.current = null;
      setMapStatus('このリンクからは、場所を読み取れませんでした。住所を入れて探してください。');
      return;
    }
    if (!linked && classifyQuery(word) === 'poi') {
      const inView = await runPoiSearch(word).catch(() => []);
      if (inView.length >= 2) return;
      setSearchResults([]);
    }
    lastAreaSearchRef.current = { type: 'name', word };
    setNeedsAreaSearch(false);
    setMapStatus(`${word}を全国から探しています。`);
    const found = await findPlaces(word, { center });
    if (found.length === 0) {
      setMapStatus(`${word}は見つかりませんでした。`);
      return;
    }
    if (found.length === 1) {
      choosePlace(found[0]);
      return;
    }
    setCandidates(found);
    setMapStatus('候補が見つかりました。行きたい場所を選んでください。');
  };

  const buildSearchError = (error) => ({
    main: '場所の検索が混み合っていて、結果を取れませんでした。',
    hint: `少し待ってから、もう一度お試しください。地図を拡大して範囲をせまくすると、通りやすくなります（地図左上の ${ic('🔍')} ボタン）。`,
    detail: error?.message || '',
  });

  const runMapSearch = async (word = mapQuery) => {
    const text = sanitizeQuery(word);
    if (!text || mapSearching) return;
    setMapQuery(text);
    clearPlaceMarkers();
    setMapError(null);
    setMapSearching(true);
    searchSeqRef.current += 1;
    setMoreSearching(false);
    try {
      // 種類の検索にするのは、「カフェ」「駅」のように種類の言葉そのものを入れたときだけ。
      // 「京都駅」「東京駅」のような名前は、名前として全国から探す（前は「駅」を含むだけで種類の検索になっていた）。
      const matched = findFacilityPreset(text);
      const word = text.toLowerCase();
      const preset = matched && (matched.label === text || matched.keywords.some((keyword) => keyword.toLowerCase() === word))
        ? matched
        : null;
      if (preset) {
        await runFacilitySearch(text, preset);
      } else {
        await runNameSearch(text);
      }
    } catch (error) {
      setMapError(buildSearchError(error));
      setMapStatus('');
    } finally {
      setMapSearching(false);
    }
  };

  // 距離を切り替える: 基準点からその距離までが入るように地図を合わせる。
  const fitDistance = (km) => {
    setDistanceKm(km);
    try {
      window.localStorage.setItem(`${DISTANCE_STORAGE_PREFIX}${profileKey}`, String(km));
    } catch {
      // 保存できなくても、この画面では切り替わる
    }
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(L.latLng(center[0], center[1]).toBounds(km * 2000), { animate: false });
  };

  // 選んだ方位の扇の中を探す: 地図をその扇に合わせてから、今までどおりの検索をする。
  // 結果は visibleSearchResults で、その方位に入る場所だけに絞られる。
  const runDirectionSearch = async (word) => {
    const map = mapRef.current;
    if (map && selectedItem) {
      const angle = bearingFor(directionIndexFor(selectedItem), bearingOptions);
      const half = MAP_FAN.sectorDeg / 2;
      const km = distanceKm || DEFAULT_DIRECTION_SEARCH_KM[profileKey] || DEFAULT_DIRECTION_SEARCH_KM.jiban;
      map.fitBounds(
        L.latLngBounds(sectorPolygon(center, angle - half, angle + half, km * 1000, 0)),
        { animate: false, padding: [16, 16] },
      );
    }
    await runMapSearch(word);
  };

  const runAreaSearch = async () => {
    const last = lastAreaSearchRef.current;
    if (!last || mapSearching) return;
    setMapError(null);
    setMapSearching(true);
    searchSeqRef.current += 1;
    setMoreSearching(false);
    try {
      clearPlaceMarkers();
      if (last.type === 'preset') await runFacilitySearch(last.word, last.preset);
      else await runPoiSearch(last.word);
    } catch (error) {
      setMapError(buildSearchError(error));
      setMapStatus('');
    } finally {
      setMapSearching(false);
    }
  };

  const showPlace = (place) => {
    const decorated = decoratePlaces([place], center, rankings, bearingOptions)[0];
    setSearchResults([]);
    setSelectedPlace(decorated);
    const map = mapRef.current;
    if (map) {
      map.fitBounds(L.latLngBounds([center, [decorated.latitude, decorated.longitude]]).pad(0.35), {
        maxZoom: profile.initialZoom + 2,
      });
    }
  };

  useEffect(() => {
    if (!focusFavoriteKey) return;
    const favorite = decoratedFavorites.find((item) => favoriteKey(item) === focusFavoriteKey);
    if (favorite) showPlace(favorite);
  }, [decoratedFavorites, focusFavoriteKey]);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;
    const map = L.map(mapNodeRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(center, profile.initialZoom);
    mapRef.current = map;

    // 背景タイル（地理院 or 海外fallback）は center 依存の別 useEffect が管理する。

    // 「検索範囲に合わせる」カスタムコントロール（ズームボタンの並びに追加）
    const FitSearchControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-fit-search');
        const button = L.DomUtil.create('a', '', container);
        button.href = '#';
        button.title = '検索可能な範囲に合わせる';
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', '検索可能な範囲に合わせる');
        button.innerHTML = ic('🔍');
        L.DomEvent.on(button, 'click', (event) => {
          L.DomEvent.preventDefault(event);
          L.DomEvent.stopPropagation(event);
          const m = mapRef.current;
          if (!m) return;
          if (m.getZoom() >= 10) return; // 既に検索可能ズーム以上なら何もしない
          m.flyTo(centerRef.current, 10, { duration: 0.5 });
        });
        return container;
      },
    });
    new FitSearchControl().addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    liveLayerRef.current = L.layerGroup().addTo(map);
  }, [center, profile.initialZoom]);

  // map-first(PR-1)レイアウトではコンテナ高さが flex:1 で可変になるため、
  // リサイズのたびに Leaflet へ invalidateSize() を伝える。
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !mapNodeRef.current) return undefined;
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize();
    });
    observer.observe(mapNodeRef.current);
    return () => observer.disconnect();
  }, []);

  // 背景タイルの国内/海外切替。
  // 地理院タイルは日本専用で海外座標では真っ白になるため、center が海外のときは
  // 全球対応の OpenStreetMap タイルへ差し替える。国内では従来どおり地理院タイル
  // （地図/航空写真の切替コントロール付き）を維持する。
  // 同一リージョン内（国内→国内）の移動では再構築せず、ユーザーのレイヤ選択を保持する。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const region = isOverseas(center) ? 'overseas' : 'jp';
    if (baseRegionRef.current === region) return;
    baseRegionRef.current = region;

    // 直前のベースタイル・切替コントロールを撤去
    baseLayersRef.current.forEach((layer) => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    baseLayersRef.current = [];
    if (baseLayersControlRef.current) {
      map.removeControl(baseLayersControlRef.current);
      baseLayersControlRef.current = null;
    }

    if (region === 'overseas') {
      const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
      const osm = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { subdomains: 'abc', maxZoom: 19, attribution: osmAttribution },
      );
      osm.addTo(map);
      baseLayersRef.current = [osm];
    } else {
      const gsiAttribution = '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">国土地理院</a>';
      const gsiPale = L.tileLayer(
        'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
        { maxZoom: 18, attribution: gsiAttribution },
      );
      const gsiPhoto = L.tileLayer(
        'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
        { maxZoom: 18, attribution: gsiAttribution },
      );
      gsiPale.addTo(map);
      const control = L.control.layers(
        { [`${ic('🗺')} 地図`]: gsiPale, [`${ic('📷')} 航空写真`]: gsiPhoto },
        null,
        { position: 'topright', collapsed: true },
      );
      control.addTo(map);
      baseLayersRef.current = [gsiPale, gsiPhoto];
      baseLayersControlRef.current = control;
    }
  }, [center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const handleMoveEnd = () => {
      if (suppressAreaPromptRef.current) {
        suppressAreaPromptRef.current = false;
        return;
      }
      if (lastAreaSearchRef.current && lastAreaSearchRef.current.type !== 'name') setNeedsAreaSearch(true);
    };
    map.on('moveend zoomend', handleMoveEnd);
    return () => {
      map.off('moveend zoomend', handleMoveEnd);
    };
  }, []);

  // 扇の外縁距離(km)を moveend/zoomend で更新する専用ハンドラ。
  // area-searchプロンプト（上）／タイル差し替え（PR-1）とは独立。基準点(center)から
  // 画面四隅までの最大距離を測り、扇を画面端まで届かせる。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const updateEdge = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      const corners = [
        bounds.getNorthWest(),
        bounds.getNorthEast(),
        bounds.getSouthWest(),
        bounds.getSouthEast(),
      ].map((ll) => [ll.lat, ll.lng]);
      const km = outerEdgeKm(centerRef.current, corners);
      if (!Number.isFinite(km) || km <= 0) return;
      setViewEdgeKm((prev) => {
        // 2%未満の変化は無視＝invalidateSize等のジッタによる再描画ループを防ぐ
        if (prev != null && Math.abs(km - prev) / km < 0.02) return prev;
        return km;
      });
    };
    updateEdge();
    map.on('moveend zoomend', updateEdge);
    return () => {
      map.off('moveend zoomend', updateEdge);
    };
  }, []);

  // 地図中心インジケータ: 基準点→地図中心の方位・距離・吉凶を moveend/zoomend で更新する。
  // エリア再検索プロンプト・扇の外縁距離(いずれも上)とは独立したハンドラ。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const updateCenterOffset = () => {
      const mapCenter = map.getCenter();
      if (!mapCenter) return;
      setCenterOffset(describeCenterOffset(centerRef.current, [mapCenter.lat, mapCenter.lng], rankings, bearingOptions));
    };
    updateCenterOffset();
    map.on('moveend zoomend', updateCenterOffset);
    return () => {
      map.off('moveend zoomend', updateCenterOffset);
    };
  }, [rankings, bearingOptions]);

  useEffect(() => {
    if (!liveOn) return undefined;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLiveStatus('この端末では現在地を取得できません。');
      setLiveOn(false);
      return undefined;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLivePos([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {
        setLiveStatus('現在地を取得できませんでした。端末の位置情報設定を確認してください。');
      },
      LIVE_WATCH_OPTIONS,
    );
    watchIdRef.current = id;
    return () => {
      navigator.geolocation.clearWatch(id);
      if (watchIdRef.current === id) watchIdRef.current = null;
    };
  }, [liveOn]);

  useEffect(() => () => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
  }, []);

  useEffect(() => {
    clearLiveLayer();
    setLivePos(null);
  }, [center]);

  useEffect(() => {
    const live = liveLayerRef.current;
    if (!live) return;
    live.clearLayers();
    if (!liveOn || !livePos) {
      if (!liveOn) setLiveStatus('');
      return;
    }

    const livePlace = decoratePlaces([{
      id: 'live-location',
      name: '現在地',
      latitude: livePos[0],
      longitude: livePos[1],
    }], center, rankings, bearingOptions)[0];
    const lineColor = liveLineColor(livePlace?.direction, bestPalace);
    const distance = distanceMeters(center, livePos);
    const distanceLabel = formatDistance(distance);
    const directionLabel = livePlace?.direction?.label || '-';
    const score = livePlace?.direction?.score ?? 0;
    setLiveStatus(`現在地: ${directionLabel} ${scoreText(score)} / 基準点から約${distanceLabel}`);

    L.polyline([center, livePos], {
      color: lineColor,
      weight: 3,
      opacity: 0.9,
      interactive: false,
    }).addTo(live);

    L.circleMarker(livePos, {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: lineColor,
      fillOpacity: 1,
    }).bindTooltip(`現在地 / 基準点から約${distanceLabel}`, { permanent: false }).addTo(live);
  }, [bearingOptions, bestPalace, center, liveOn, livePos, rankings]);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const viewKey = `${center[0]},${center[1]},${isFullscreen},${profile.initialZoom}`;
    if (viewKeyRef.current !== viewKey) {
      viewKeyRef.current = viewKey;
      map.setView(center, isFullscreen ? Math.max(profile.initialZoom, 7) : profile.initialZoom);
    }

    // 平面/球面の実効モード（描画専用の派生値）。ユーザー選択を base に、外縁が遠距離なら球面へ昇格。
    // localStorage の bearingMode・トグルUI表示は変えない。decoratePlaces(:195) には適用しない。
    const effectiveMode = resolveBearingMode(bearingMode, viewEdgeKm);
    const fanBearingOptions = effectiveMode === bearingOptions.mode
      ? bearingOptions
      : { ...bearingOptions, mode: effectiveMode };
    // 扇の外縁距離(km)。画面端まで届く有効値があればそれを、無ければ従来の固定 fadeMaxKm を使う。
    const fanOuterKm = Number.isFinite(viewEdgeKm) && viewEdgeKm > profile.confirmKm ? viewEdgeKm : null;
    const labelOuterM = (fanOuterKm || profile.fadeMaxKm) * 1000;

    // 金の輪郭は「選んでいる方位」に付ける（一番評価の高い方位は、ラベルの BEST で示す）。
    const specs = buildFanLayerSpecs(rankings, selectedPalace || null, fanBearingOptions, profileKey, fanOuterKm);
    specs.forEach((spec) => {
      // 方位を選んだあとは、ほかの方位を少し薄くする（消しはしない。8方位を比べられるように）。
      const dim = Boolean(selectedPalace) && spec.item.palace !== selectedPalace;
      const options = dim
        ? {
          ...spec.options,
          opacity: (spec.options.opacity ?? 1) * 0.6,
          fillOpacity: (spec.options.fillOpacity ?? 0) * 0.5,
        }
        : spec.options;
      L.polygon(
        sectorPolygon(center, spec.from, spec.to, spec.outer, spec.inner),
        options,
      ).addTo(layerGroup);
    });

    // 扇そのものを「方位を選ぶボタン」にする（見えない当たり判定を扇の形で重ねる）。
    if (onSelectPalaceRef.current) {
      (rankings || []).forEach((item) => {
        const angle = bearingFor(directionIndexFor(item), fanBearingOptions);
        const half = MAP_FAN.sectorDeg / 2;
        L.polygon(
          sectorPolygon(center, angle - half, angle + half, labelOuterM, 0),
          { stroke: false, fillColor: '#000', fillOpacity: 0, className: 'direction-fan-hit' },
        ).on('click', () => onSelectPalaceRef.current?.(item.palace)).addTo(layerGroup);
      });
    }

    L.circleMarker(center, {
      radius: 6,
      color: MAP_FAN_COLORS.best,
      fillColor: MAP_FAN_COLORS.best,
      fillOpacity: 1,
      weight: 2,
    }).bindTooltip(`基準点: ${location.name}`, { permanent: false }).addTo(layerGroup);
    // 地図の中央（基準点）には、基準点の名前だけを出す。選んだ方位の情報は地図の下のパネルに出す。
    L.marker(center, {
      icon: L.divIcon({
        className: '',
        html: `<div class="direction-base-label">◎ ${escapeHtml(location.name)}</div>`,
        iconSize: [140, 20],
        iconAnchor: [70, -8],
      }),
      interactive: false,
      keyboard: false,
    }).addTo(layerGroup);

    profile.rings.forEach((ring) => {
      const isConfirm = ring.km === profile.confirmKm;
      if (isConfirm) {
        L.circle(center, {
          radius: ring.km * 1000,
          color: MAP_FAN_COLORS.best,
          weight: 6,
          opacity: 0.25,
          fill: false,
          interactive: false,
        }).addTo(layerGroup);
      }
      L.circle(center, {
        radius: ring.km * 1000,
        color: isConfirm ? MAP_FAN_COLORS.best : '#c9c4b0',
        weight: isConfirm ? 2.5 : 1,
        opacity: 0.85,
        fill: false,
        dashArray: isConfirm ? null : '4 6',
        interactive: false,
      }).bindTooltip(ring.label, { permanent: false, direction: 'top' }).addTo(layerGroup);

      // 中央の照準リング（◎基準点）と重ならないよう、ラベルは輪の外側へ左端揃えで置き、
      // 輪が小さすぎる（照準リングに隠れる）ズームでは出さない。
      const labelPoint = destPoint(center, RING_LABEL_BEARING, ring.km * 1000);
      const labelPx = map.latLngToContainerPoint(labelPoint);
      const ringPx = labelPx.distanceTo(map.latLngToContainerPoint(center));
      if (ringPx < RING_LABEL_MIN_PX) return;
      // 枠外にはみ出すラベルは出さない（縦長のスマホ地図で外側の輪のラベルが切れるため）。
      const mapSize = map.getSize();
      const labelWidthPx = ring.label.length * 9 + 8;
      if (labelPx.x + labelWidthPx > mapSize.x || labelPx.y < 8 || labelPx.y > mapSize.y - 8) return;
      L.marker(labelPoint, {
        icon: L.divIcon({
          className: '',
          html: `<div class="direction-ring-label">${ring.label}</div>`,
          iconSize: [96, 16],
          iconAnchor: [-4, 8],
        }),
        interactive: false,
      }).addTo(layerGroup);
    });

    (rankings || []).forEach((item) => {
      const labelAngle = bearingFor(directionIndexFor(item), fanBearingOptions);
      const labelSize = isFullscreen ? [58, 44] : [50, 40];
      const isSelected = item.palace === selectedPalace;
      const isBest = item.palace === bestPalace;
      const labelPoint = fitLabelInView(map, center, destPoint(center, labelAngle, labelOuterM * 0.72), labelSize);
      const score = labelMode.showScore
        ? `<br><span style="color:${scoreColor(item.tone)}">${scoreText(item.score)}</span>`
        : '';
      const icon = L.divIcon({
        className: '',
        html: `<div class="direction-map-label ${labelMode.className} ${toneClass(item.tone)}${isSelected ? ' is-selected' : ''}${selectedPalace && !isSelected ? ' is-dim' : ''}">${isBest ? '<i class="direction-map-label-best">BEST</i>' : ''}${item.label}${score}</div>`,
        iconSize: labelSize,
        iconAnchor: [labelSize[0] / 2, labelSize[1] / 2],
      });
      const canSelect = Boolean(onSelectPalaceRef.current);
      const labelMarker = L.marker(labelPoint, { icon, interactive: canSelect, keyboard: false }).addTo(layerGroup);
      if (canSelect) labelMarker.on('click', () => onSelectPalaceRef.current?.(item.palace));
    });

    [
      ...visibleSearchResults.map((item, index) => ({
        item,
        favorite: false,
        markerNo: index < LIST_MAX ? index + 1 : null,
      })),
      ...(selectedPlace ? [{ item: selectedPlace, favorite: false }] : []),
      ...decoratedFavorites.map((item) => ({ item, favorite: true })),
    ].forEach(({ item, favorite, markerNo = null }) => {
      const savedFavorite = favorites.find((fav) => favoriteKey(fav) === favoriteKey(item));
      const isSaved = Boolean(savedFavorite);
      const isHome = isSaved && favoriteKind(savedFavorite) === 'home';
      const subLabel = placeSubLabel(item);
      const popup = [
        `<strong>${escapeHtml(item.name)}</strong>`,
        subLabel ? `<span>${escapeHtml(subLabel)}</span>` : '',
        `${escapeHtml(item.direction?.label || '-')} ${scoreText(item.direction?.score || 0)}`,
        `基準点から約${formatDistance(item.distanceM)}`,
        isSaved
          ? '<button class="direction-popup-button" data-remove-favorite="1">お気に入りから削除</button>'
          : '<button class="direction-popup-button" data-add-favorite="1">お気に入りに追加</button>',
        // 拠点トグル（ベタ金は「お気に入りに追加」のみ＝こちらは控えめ表示）。未保存→home追加 / 保存済→home⇄spot。
        `<button class="direction-popup-button direction-popup-home${isHome ? ' is-on' : ''}" data-toggle-home="1">${isHome ? `${ic('🏠')} 拠点を解除` : `${ic('🏠')} 拠点にする`}</button>`,
      ].filter(Boolean).join('<br>');
      const marker = L.marker([item.latitude, item.longitude], {
        icon: L.divIcon({
          className: '',
          html: placeMarkerHtml(item, favorite, markerNo),
          iconSize: favorite ? [28, 28] : [22, 22],
          iconAnchor: favorite ? [14, 28] : [11, 22],
          popupAnchor: [0, -20],
        }),
      }).bindPopup(popup).addTo(layerGroup);
      marker.on('popupopen', (event) => {
        const element = event.popup.getElement();
        element?.querySelector('[data-add-favorite]')?.addEventListener('click', () => addFavorite(item), { once: true });
        element?.querySelector('[data-remove-favorite]')?.addEventListener('click', () => removeFavorite(item), { once: true });
        element?.querySelector('[data-toggle-home]')?.addEventListener('click', () => toggleFavoriteKind(item), { once: true });
      });
    });

    window.setTimeout(() => map.invalidateSize(), 0);
  }, [
    bearingMode,
    bearingOptions,
    bestPalace,
    center,
    decoratedFavorites,
    favorites,
    isFullscreen,
    labelMode,
    location.name,
    profile,
    profileKey,
    rankings,
    searchResults,
    selectedPalace,
    selectedPlace,
    viewEdgeKm,
    visibleSearchResults,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timer);
  }, [isFullscreen]);

  // フルスクリーンを抜けたら、次に開いたときは必ず畳んだ状態から始める。
  useEffect(() => {
    if (!isFullscreen) setFullscreenSearchOpen(false);
  }, [isFullscreen]);

  return (
    <div className={`direction-map-wrap ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <div className="direction-map-header">
        {centerOffset && (
          <div className="direction-map-center-indicator" aria-live="polite">
            {centerOffset.isNearBase ? (
              <span className="direction-map-center-base">◎ 基準点</span>
            ) : (
              <>
                <span className="direction-map-center-dir">
                  {CENTER_INDICATOR_ARROWS[centerOffset.direction?.short] || ''} {centerOffset.direction?.label || '-'}
                </span>
                <span className="direction-map-center-dist">
                  {formatCenterIndicatorDistance(centerOffset.distanceM)}
                </span>
                <span
                  className="direction-map-center-kichi"
                  style={{ color: describeCenterIndicatorKichi(centerOffset.direction).color }}
                >
                  {describeCenterIndicatorKichi(centerOffset.direction).label} {scoreText(centerOffset.direction?.score ?? 0)}
                </span>
              </>
            )}
          </div>
        )}
        <button
          type="button"
          className={`direction-map-action direction-map-live-action ${liveOn ? 'is-active' : ''}`}
          onClick={toggleLiveLocation}
          aria-pressed={liveOn}
        >
          {liveOn ? '現在地ON' : '現在地'}
        </button>
        {isFullscreen ? (
          <button type="button" className="direction-map-action" onClick={() => setIsFullscreen(false)}>
            閉じる
          </button>
        ) : (
          <button
            type="button"
            className={`direction-map-action direction-bearing-button ${bearingPanelOpen ? 'is-open' : ''}`}
            aria-expanded={bearingPanelOpen}
            onClick={() => setBearingPanelOpen((value) => !value)}
          >
            地図の設定 <span aria-hidden="true">{bearingPanelOpen ? '▾' : '›'}</span>
          </button>
        )}
      </div>

      {!isFullscreen && bearingPanelOpen && (
        <div className="direction-bearing-body">
          <p className="direction-bearing-now">{BEARING_LABELS.heading}：{bearingSummary}</p>
          <BearingControls
            variant="compact"
            value={{ mode: bearingMode, declination: useDeclination }}
            onChange={handleBearingChange}
          />
          <button type="button" className="direction-map-action direction-fullscreen-button" onClick={() => setIsFullscreen(true)}>
            ⛶ 全画面
          </button>
        </div>
      )}

      {isFullscreen && (
        <BearingControls
          variant="fullscreen"
          value={{ mode: bearingMode, declination: useDeclination }}
          onChange={handleBearingChange}
        />
      )}

      {showSearchControls && (() => {
        const searchForm = (
          <form
            className="direction-map-search-row"
            onSubmit={(event) => {
              event.preventDefault();
              runMapSearch();
            }}
          >
            <input
              id={profileKey === 'jiban' ? 'yoho-go-search-input' : undefined}
              type="search"
              value={mapQuery}
              placeholder="施設や地名を検索"
              onChange={(event) => setMapQuery(event.target.value)}
            />
            <button type="submit" disabled={mapSearching}>検索</button>
          </form>
        );
        // 探した言葉で結果を出せなかったとき（混雑で失敗・0件）は、Googleマップで探すリンクを出す。
        const lastWord = lastAreaSearchRef.current?.word || '';
        const showOutsideLink = !mapSearching && lastWord
          && candidates.length === 0
          && (mapError || (visibleSearchResults.length === 0 && !selectedPlace));
        const nameNotFound = showOutsideLink && lastAreaSearchRef.current?.type === 'name';
        const outsideCenter = (() => {
          if (!showOutsideLink) return null;
          if (selectedItem) {
            const km = distanceKm || DEFAULT_DIRECTION_SEARCH_KM[profileKey] || DEFAULT_DIRECTION_SEARCH_KM.jiban;
            return destPoint(center, bearingFor(directionIndexFor(selectedItem), bearingOptions), km * 600);
          }
          const c = mapRef.current?.getCenter();
          return c ? [c.lat, c.lng] : center;
        })();
        const outsideUrl = showOutsideLink
          ? googleMapsSearchUrl(lastWord, outsideCenter, mapRef.current?.getZoom() ?? profile.initialZoom)
          : '';
        const searchStatusBlock = (
          <>
            {mapError && (
              <div className="direction-map-error" role="alert">
                <p className="direction-map-error-main">{mapError.main}</p>
                <p className="direction-map-error-hint">{mapError.hint}</p>
                {mapError.detail && <p className="direction-map-error-detail">詳細: {mapError.detail}</p>}
              </div>
            )}
            {selectedItem && searchResults.length > 0 && (
              <p className="direction-map-status">
                {visibleSearchResults.length > 0
                  ? `${selectedItem.label}の範囲に${visibleSearchResults.length}件あります。`
                  : `${selectedItem.label}の範囲には見つかりませんでした。距離を広げるか、ほかの種類でお試しください。`}
              </p>
            )}
            {mapStatus && (selectedItem ? searchResults.length === 0 : (!kichiOnly || searchResults.length === 0)) && <p className="direction-map-status">{mapStatus}</p>}
            {!selectedItem && kichiOnly && searchResults.length > 0 && (
              <p className="direction-map-status">
                {`見つかった${searchResults.length}件のうち、吉方位にある${visibleSearchResults.length}件を表示しています。「吉方位のみ表示」をオフにすると、全部出ます。`}
              </p>
            )}
            {moreSearching && <p className="direction-map-status is-more">ほかにもないか、さらに探しています…</p>}
            {candidates.length > 0 && (
              <ul className="direction-candidates" aria-label="検索の候補">
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <button type="button" onClick={() => choosePlace(candidate)}>
                      <strong>{candidate.name}</strong>
                      {candidate.label && <small>{candidate.label}</small>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {nameNotFound && (
              <p className="direction-map-status">
                お店の名前では出ないことがあります。住所を入れるか、Googleマップでその場所を開いて「共有」のリンクをコピーし、この検索の欄に貼り付けてください。
              </p>
            )}
            {outsideUrl && (
              <a className="direction-map-outside" href={outsideUrl} target="_blank" rel="noopener noreferrer">
                Googleマップで{selectedItem ? `${selectedItem.label}の` : 'この辺りの'}{lastWord}を探す ↗
              </a>
            )}
            {liveStatus && <p className="direction-map-status is-live">{liveStatus}</p>}
          </>
        );

        const searchBody = (
          <>
            {searchForm}
            <div className="direction-map-filter">
              <button type="button" className="direction-map-guide-link" onClick={() => setGuideOpen(true)}>
                ？ 使い方ガイド
              </button>
              <span>吉方位のみ表示</span>
              <button
                type="button"
                className={`settings-switch${kichiOnly ? ' is-on' : ''}`}
                aria-pressed={kichiOnly}
                aria-label="吉方位のみ表示"
                onClick={() => setKichiOnly(!kichiOnly)}
              >
                <span />
              </button>
            </div>
            <div className="direction-map-chips" role="group" aria-label="場所の種類で探す">
              {FACILITY_PRESETS.slice(0, 6).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={mapSearching}
                  onClick={() => (selectedItem ? runDirectionSearch(preset.label) : runMapSearch(preset.label))}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {searchStatusBlock}
          </>
        );

        // 時盤お散歩（jiban）・日盤遠出（nichiban）のフルスクリーンは、検索UIを
        // 既定で畳んだトグルにする（PR-2.5 jiban → PR-D2 nichiban展開）。
        //
        // 実機（iOS Safari）検証で position:absolute オーバーレイ案は
        // タップが通らない不具合が確認されたため撤回し、グリッド内に通常表示する
        // シンプルな方式に倒した（展開中は地図の高さを一時的に譲る）。
        if (isFullscreen && (profileKey === 'jiban' || profileKey === 'nichiban')) {
          return (
            <>
              <button
                type="button"
                className={`direction-map-search-toggle ${fullscreenSearchOpen ? 'is-open' : ''}`}
                onClick={() => setFullscreenSearchOpen((value) => !value)}
                aria-expanded={fullscreenSearchOpen}
              >
                {fullscreenSearchOpen ? `${ic('🔍')} 検索を閉じる` : `${ic('🔍')} 検索`}
              </button>
              {fullscreenSearchOpen && (
                <div className="direction-map-search">
                  {searchBody}
                </div>
              )}
            </>
          );
        }

        return (
          <div className="direction-map-search">
            {searchBody}
          </div>
        );
      })()}

      {/* Leaflet上へのposition:absoluteオーバーレイUIは実機でペイント不発の実績あり
          （PR-2.5, PR-2.6）。in-flow配置（このヘッダー行・下の凡例）を維持すること。 */}
      <div ref={mapNodeRef} className="direction-map" aria-label="地図上の吉方位扇表示" />
      {needsAreaSearch && lastAreaSearchRef.current && (
        <button
          type="button"
          className="direction-area-search"
          disabled={mapSearching}
          onClick={runAreaSearch}
        >
          このエリアを検索
        </button>
      )}

      {!isFullscreen && (
        <div className="direction-distance" role="group" aria-label="地図に入れる距離">
          {distanceChoices.map((km) => (
            <button
              key={km}
              type="button"
              className={distanceKm === km ? 'is-active' : ''}
              aria-pressed={distanceKm === km}
              onClick={() => fitDistance(km)}
            >
              {distanceChoiceLabel(km)}
            </button>
          ))}
        </div>
      )}

      {!isFullscreen && onSelectPalace && !selectedItem && (
        <p className="direction-select-hint">地図の方位を押すと、その方位にある場所を探せます。</p>
      )}

      {!isFullscreen && selectedItem && (() => {
        const tone = getMiniBoardToneClass(selectedItem.score, selectedItem.palaceScore);
        const gate = selectedItem.palaceData?.hachimon;
        return (
          <div className="direction-select-panel" aria-label="選んだ方位">
            <button
              type="button"
              className="direction-select-close"
              aria-label="方位の選択をやめる"
              onClick={() => onSelectPalace?.(null)}
            >
              ×
            </button>
            <div className="direction-select-info">
              {conditionLabel && <p className="direction-select-cond">{conditionLabel}</p>}
              <div className="direction-select-head">
                <strong>{selectedItem.label}</strong>
                <b className="lat">{scoreText(selectedItem.score)}</b>
                <span className={`direction-select-badge is-${tone}`}>{BADGE_LABEL[tone]}</span>
                {selectedItem.palace === bestPalace && <span className="direction-select-best lat">BEST</span>}
              </div>
              {gate && <p className="direction-select-gate">{gate}</p>}
              <p className="direction-select-text">{describeDirection(selectedItem)}</p>
              {onOpenDetail && (
                <button type="button" className="direction-select-detail" onClick={() => onOpenDetail(selectedItem)}>
                  この方位を詳しく見る ›
                </button>
              )}
            </div>
            <div className="direction-select-search">
              <p className="direction-select-lead">この方位にある場所を探す</p>
              <div className="direction-select-cats" role="group" aria-label="探す場所の種類">
                {FACILITY_PRESETS.slice(0, 6).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={panelCategory === preset.label ? 'is-active' : ''}
                    aria-pressed={panelCategory === preset.label}
                    onClick={() => setPanelCategory(preset.label)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="direction-select-cta"
                disabled={mapSearching}
                onClick={() => runDirectionSearch(panelCategory)}
              >
                {mapSearching ? '探しています…' : `${selectedItem.label}でスポットを探す →`}
              </button>
            </div>
          </div>
        );
      })()}

      {showPlacePanel && ((showFavoritesSection && decoratedFavorites.length > 0) || visibleSearchResults.length > 0 || selectedPlace) && (
        <div className="direction-place-panel">
          {showFavoritesSection && decoratedFavorites.length > 0 && (
            <div className="direction-place-section">
              <div className="reverse-section-title">
                <h3 className="maru">お気に入り（<span className="lat">{decoratedFavorites.length}</span>）</h3>
              </div>
              <ScrollWindow className="direction-favorites-window">
                {decoratedFavorites.map((item) => {
                  const subLabel = placeSubLabel(item);
                  return (
                    <div key={favoriteKey(item)} className="direction-place-row is-editable">
                      <button type="button" className="direction-place-main" onClick={() => showPlace(item)}>
                        <span className={`direction-place-dot ${toneClass(item.direction?.tone)}`} />
                        <span>
                          <strong>{favoriteDisplayName(item)}</strong>
                          {subLabel && <small className="direction-place-sublabel">{subLabel}</small>}
                          <small>
                            {subLabel ? '' : `${item.name} ・ `}
                            基準点から約<span className="lat">{formatDistance(item.distanceM)}</span>
                          </small>
                        </span>
                        <b>{item.direction?.label || '-'} <span className="lat">{scoreText(item.direction?.score || 0)}</span></b>
                      </button>
                      <button
                        type="button"
                        className="direction-place-edit"
                        aria-label={`${favoriteDisplayName(item)}の名前を編集`}
                        title="名前を編集"
                        onClick={() => openFavoriteEditor(item)}
                      >
                        ✎
                      </button>
                    </div>
                  );
                })}
              </ScrollWindow>
            </div>
          )}
          {(selectedPlace || numberedSearchResults.length > 0) && (
            <div className="direction-place-section">
              <div className="reverse-section-title">
                <h3 className="maru">{selectedPlace ? '検索した場所' : '検索結果'}</h3>
              </div>
              <p className="direction-place-hint">☆ を押すと、お気に入りに登録できます。</p>
              {selectedPlace && otherModeHint && onSeeInOtherMode && (
                <p className="direction-mode-hint">
                  <span>ここは基準点から約{formatDistance(selectedPlace.distanceM)}。{otherModeHint.text}</span>
                  <button type="button" onClick={() => onSeeInOtherMode(selectedPlace)}>{otherModeHint.cta}</button>
                </p>
              )}
              {selectedPlace && onSetBasePoint && (
                <button
                  type="button"
                  className="direction-place-base"
                  onClick={() => onSetBasePoint([selectedPlace.longitude, selectedPlace.latitude], selectedPlace.name)}
                >
                  ここを基準点にする（ここから見た方位に切り替える）
                </button>
              )}
              {(selectedPlace ? [{ item: selectedPlace, markerNo: null }] : numberedSearchResults).map(({ item, markerNo }) => {
                const subLabel = placeSubLabel(item);
                const isSaved = favorites.some((fav) => favoriteKey(fav) === favoriteKey(item));
                return (
                  <div key={favoriteKey(item)} className="direction-place-row is-editable">
                    <button type="button" className={`direction-place-main ${markerNo ? 'is-numbered' : ''}`} onClick={() => showPlace(item)}>
                      {markerNo ? (
                        <span className={`direction-place-number ${toneClass(item.direction?.tone)}`}>{placeNumberLabel(markerNo)}</span>
                      ) : (
                        <span className={`direction-place-dot ${toneClass(item.direction?.tone)}`} />
                      )}
                      <span>
                        <strong>{item.name}</strong>
                        {subLabel && <small className="direction-place-sublabel">{subLabel}</small>}
                        <small>基準点から約<span className="lat">{formatDistance(item.distanceM)}</span></small>
                      </span>
                      <b>{item.direction?.label || '-'} <span className="lat">{scoreText(item.direction?.score || 0)}</span></b>
                    </button>
                    <button
                      type="button"
                      className={`direction-place-edit direction-place-star${isSaved ? ' is-on' : ''}`}
                      aria-pressed={isSaved}
                      aria-label={isSaved ? `${item.name}をお気に入りから外す` : `${item.name}をお気に入りに登録`}
                      onClick={() => (isSaved ? removeFavorite(item) : addFavorite(item))}
                    >
                      {isSaved ? '★' : '☆'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {profileKey !== 'jiban' && <p className="direction-map-caption">{profile.caption}</p>}
      {showScale && (
        <div className="direction-scale-card">
          <h3>{profile.scaleTitle}</h3>
          <div className="direction-ruler" aria-hidden="true">
            {profile.ruler.map((segment) => {
              const labelToneClass = segment.op <= 0.3 ? 'is-light-cell' : 'is-dark-cell';
              return (
                <React.Fragment key={`${segment.x}-${segment.w}`}>
                  <span
                    className="direction-ruler-band"
                    style={{
                      left: `${segment.x}%`,
                      width: `${segment.w}%`,
                      '--ruler-blue': MAP_FAN_COLORS.great,
                      '--ruler-mix': `${Math.round(segment.op * 100)}%`,
                    }}
                  />
                  {segment.label && (
                    <span className={`direction-ruler-label ${labelToneClass}`} style={{ left: `${segment.x + 1}%` }}>{segment.label}</span>
                  )}
                  {segment.bottom && (
                    <span className={`direction-ruler-label is-bottom ${labelToneClass}`} style={{ left: `${segment.x + 1}%` }}>{segment.bottom}</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <p>{profile.scaleNote}</p>
        </div>
      )}
      <div className="direction-map-legend">
        <span><i className="legend-swatch tone-great" />大吉</span>
        <span><i className="legend-swatch tone-weak" />小吉</span>
        <span><i className="legend-swatch tone-neutral" />中立</span>
        <span><i className="legend-swatch tone-bad" />凶</span>
      </div>
      {guideOpen && <MapGuide onClose={closeGuide} />}
      {editingFavorite && (
        <div className="direction-favorite-modal" role="dialog" aria-modal="true" aria-label="お気に入りの編集">
          <div className="direction-favorite-sheet">
            <h3>お気に入りの編集</h3>
            <label>
              <span>名前</span>
              <input
                type="text"
                value={favoriteLabelDraft}
                placeholder="お気に入りの名前"
                onChange={(event) => setFavoriteLabelDraft(event.target.value)}
                autoFocus
              />
            </label>
            <p>{editingFavorite.name}</p>
            <label className="direction-favorite-home-toggle">
              <span>{ic('🏠')} 拠点にする<small>基準点リストの上に表示</small></span>
              <input
                type="checkbox"
                checked={favoriteKind(editingFavorite) === 'home'}
                onChange={() => toggleFavoriteKind(editingFavorite)}
              />
            </label>
            <div className="direction-favorite-actions">
              <button type="button" onClick={saveFavoriteLabel}>保存</button>
              <button type="button" className="is-ghost" onClick={closeFavoriteEditor}>キャンセル</button>
            </div>
            <button type="button" className="direction-favorite-delete" onClick={deleteEditingFavorite}>
              このお気に入りを削除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
