import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  BEARING_LABELS,
  MAP_FAN_COLORS,
  bearingFor,
  buildFanLayerSpecs,
  destPoint,
  directionIndexFor,
  getDistanceProfile,
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
import {
  FACILITY_PRESETS,
  MAP_SEARCH_STORAGE_KEY,
  buildOverpassQuery,
  classifyQuery,
  decoratePlaces,
  deleteFavorite,
  distanceMeters,
  favoriteKey,
  favoriteDisplayName,
  favoriteKind,
  filterKichiPlaces,
  findFacilityPreset,
  nominatimSearch,
  normalizeOverpassElements,
  overpassFetch,
  pickNearestAddressCandidate,
  renameFavorite,
  sanitizeQuery,
} from './mapSearch.js';

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

function placeNumberLabel(number) {
  return ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][number] || String(number);
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
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bearingMode, setBearingMode] = useState(() => readBearingSettings().mode);
  const [useDeclination, setUseDeclination] = useState(() => readBearingSettings().declination);
  // 今見えている地図の端までの距離(km)。扇の外縁伸縮＋平面/球面の自動切替に使う（moveend/zoomendで更新）。
  const [viewEdgeKm, setViewEdgeKm] = useState(null);
  const [bearingPanelOpen, setBearingPanelOpen] = useState(false);
  const [mapQuery, setMapQuery] = useState('');
  const [mapStatus, setMapStatus] = useState('');
  const [mapError, setMapError] = useState(null);
  const [mapSearching, setMapSearching] = useState(false);
  const [needsAreaSearch, setNeedsAreaSearch] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [kichiOnlyPlaces, setKichiOnlyPlaces] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
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
  const visibleSearchResults = useMemo(
    () => filterKichiPlaces(searchResults, kichiOnlyPlaces),
    [kichiOnlyPlaces, searchResults],
  );
  const numberedSearchResults = useMemo(
    () => visibleSearchResults.slice(0, 8).map((item, index) => ({
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
    lastAreaSearchRef.current = { type: 'preset', word: text, preset };
    setNeedsAreaSearch(false);
    setMapStatus(`${preset.label}を表示中の地図範囲で検索しています。`);
    const query = buildOverpassQuery(preset.selectors, map.getBounds());
    const data = await overpassFetch(query);
    const decorated = decoratePlaces(
      normalizeOverpassElements(data.elements).slice(0, 60),
      center,
      rankings,
      bearingOptions,
    );
    setSelectedPlace(null);
    setSearchResults(decorated);
    setMapStatus(decorated.length
      ? `${text}を${decorated.length}件表示しました。ピンの色はその場所の方位評価です。`
      : `${text}はこの地図範囲では見つかりませんでした。地図を動かして再検索してください。`);
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

  const runAddressSearch = async (word) => {
    const text = sanitizeQuery(word);
    setMapStatus(`${text}を住所・地名として検索しています。`);
    const response = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(text)}`);
    const data = await response.json();
    const first = pickNearestAddressCandidate(data, center);
    const coords = first?.geometry?.coordinates;
    if (!coords) {
      return null;
    }
    const place = decoratePlaces([{
      id: `place-${coords[1]}-${coords[0]}`,
      name: first.properties?.title || text,
      latitude: Number(coords[1]),
      longitude: Number(coords[0]),
    }], center, rankings, bearingOptions)[0];
    setSearchResults([]);
    setSelectedPlace(place);
    lastAreaSearchRef.current = null;
    setNeedsAreaSearch(false);
    const map = mapRef.current;
    if (map) {
      suppressAreaPromptRef.current = true;
      map.fitBounds(L.latLngBounds([center, [place.latitude, place.longitude]]).pad(0.35), {
        maxZoom: profile.initialZoom + 2,
      });
    }
    setMapStatus(`${place.name}を表示しました。出発点から${formatDistance(place.distanceM)}、${place.direction?.label || '該当なし'}です。`);
    return place;
  };

  const buildSearchError = (error) => ({
    main: '検索範囲が広すぎる可能性があります。',
    hint: '地図右上の 🔍 ボタンで検索可能な範囲に合わせられます。（時間をおいて再試行も有効）',
    detail: error?.message || '',
  });

  const runMapSearch = async (word = mapQuery) => {
    const text = sanitizeQuery(word);
    if (!text || mapSearching) return;
    setMapQuery(text);
    clearPlaceMarkers();
    setMapError(null);
    setMapSearching(true);
    try {
      const preset = findFacilityPreset(text);
      if (preset) {
        await runFacilitySearch(text, preset);
      } else if (classifyQuery(text) === 'address') {
        const place = await runAddressSearch(text);
        if (!place) {
          const poiResults = await runPoiSearch(text);
          if (!poiResults.length) setMapStatus(`${text}は見つかりませんでした。市区町村名や施設名を足して再検索してください。`);
        }
      } else {
        const poiResults = await runPoiSearch(text);
        if (!poiResults.length) {
          const place = await runAddressSearch(text);
          if (!place) setMapStatus(`${text}は見つかりませんでした。市区町村名や施設名を足して再検索してください。`);
        }
      }
    } catch (error) {
      setMapError(buildSearchError(error));
      setMapStatus('');
    } finally {
      setMapSearching(false);
    }
  };

  const runAreaSearch = async () => {
    const last = lastAreaSearchRef.current;
    if (!last || mapSearching) return;
    setMapError(null);
    setMapSearching(true);
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
        button.innerHTML = '🔍';
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
        { '🗺 地図': gsiPale, '📷 航空写真': gsiPhoto },
        null,
        { position: 'bottomright', collapsed: false },
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
      if (lastAreaSearchRef.current) setNeedsAreaSearch(true);
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
    setLiveStatus(`現在地: ${directionLabel} ${scoreText(score)} / 出発点から約${distanceLabel}`);

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
    }).bindTooltip(`現在地 / 出発点から約${distanceLabel}`, { permanent: false }).addTo(live);
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

    const specs = buildFanLayerSpecs(rankings, bestPalace, fanBearingOptions, profileKey, fanOuterKm);
    specs.forEach((spec) => {
      L.polygon(
        sectorPolygon(center, spec.from, spec.to, spec.outer, spec.inner),
        spec.options,
      ).addTo(layerGroup);
    });

    L.circleMarker(center, {
      radius: 6,
      color: MAP_FAN_COLORS.best,
      fillColor: MAP_FAN_COLORS.best,
      fillOpacity: 1,
      weight: 2,
    }).bindTooltip(`基準点: ${location.name}`, { permanent: false }).addTo(layerGroup);

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

      const labelPoint = destPoint(center, 65, ring.km * 1000);
      L.marker(labelPoint, {
        icon: L.divIcon({
          className: '',
          html: `<div class="direction-ring-label">${ring.label}</div>`,
          iconSize: [96, 16],
          iconAnchor: [48, 8],
        }),
        interactive: false,
      }).addTo(layerGroup);
    });

    (rankings || []).forEach((item) => {
      const labelAngle = bearingFor(directionIndexFor(item), fanBearingOptions);
      const labelPoint = destPoint(center, labelAngle, labelOuterM * 0.72);
      const score = labelMode.showScore
        ? `<br><span style="color:${scoreColor(item.tone)}">${scoreText(item.score)}</span>`
        : '';
      const icon = L.divIcon({
        className: '',
        html: `<div class="direction-map-label ${labelMode.className}">${item.label}${score}</div>`,
        iconSize: isFullscreen ? [54, 38] : [44, 28],
        iconAnchor: isFullscreen ? [27, 19] : [22, 14],
      });
      L.marker(labelPoint, { icon, interactive: false }).addTo(layerGroup);
    });

    [
      ...visibleSearchResults.map((item, index) => ({
        item,
        favorite: false,
        markerNo: index < 8 ? index + 1 : null,
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
        `出発点から約${formatDistance(item.distanceM)}`,
        isSaved
          ? '<button class="direction-popup-button" data-remove-favorite="1">お気に入りから削除</button>'
          : '<button class="direction-popup-button" data-add-favorite="1">お気に入りに追加</button>',
        // 拠点トグル（ベタ金は「お気に入りに追加」のみ＝こちらは控えめ表示）。未保存→home追加 / 保存済→home⇄spot。
        `<button class="direction-popup-button direction-popup-home${isHome ? ' is-on' : ''}" data-toggle-home="1">${isHome ? '🏠 拠点を解除' : '🏠 拠点にする'}</button>`,
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

  return (
    <div className={`direction-map-wrap ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <div className="direction-map-header">
        <div className="direction-map-note">
          <span>{profile.note[0]}</span>
          <span>{profile.note[1]}</span>
        </div>
        <button
          type="button"
          className="direction-map-action"
          onClick={() => setIsFullscreen((value) => !value)}
        >
          {isFullscreen ? '閉じる' : '拡大'}
        </button>
        <button
          type="button"
          className={`direction-map-action direction-map-live-action ${liveOn ? 'is-active' : ''}`}
          onClick={toggleLiveLocation}
          aria-pressed={liveOn}
        >
          {liveOn ? '現在地ON' : '現在地'}
        </button>
      </div>

      {isFullscreen && (
        <BearingControls
          variant="fullscreen"
          value={{ mode: bearingMode, declination: useDeclination }}
          onChange={handleBearingChange}
        />
      )}

      {showSearchControls && (
        <div className="direction-map-search">
          <form
            className="direction-map-search-row"
            onSubmit={(event) => {
              event.preventDefault();
              runMapSearch();
            }}
          >
            <input
              type="search"
              value={mapQuery}
              placeholder="施設や地名を検索"
              onChange={(event) => setMapQuery(event.target.value)}
            />
            <button type="submit" disabled={mapSearching}>検索</button>
          </form>
          <div className="direction-map-chips">
            {FACILITY_PRESETS.slice(0, 6).map((preset) => (
              <button key={preset.label} type="button" disabled={mapSearching} onClick={() => runMapSearch(preset.label)}>
                {preset.label}
              </button>
            ))}
          </div>
          <label className="direction-kichi-filter">
            <input
              type="checkbox"
              checked={kichiOnlyPlaces}
              onChange={(event) => setKichiOnlyPlaces(event.target.checked)}
            />
            吉方位だけ
          </label>
          <p className="direction-map-hint">🔍 検索したい時は地図を拡大してください（広範囲だと検索結果が出ないことがあります）</p>
          {mapError && (
            <div className="direction-map-error" role="alert">
              <p className="direction-map-error-main">{mapError.main}</p>
              <p className="direction-map-error-hint">{mapError.hint}</p>
              {mapError.detail && <p className="direction-map-error-detail">詳細: {mapError.detail}</p>}
            </div>
          )}
          {mapStatus && (!kichiOnlyPlaces || searchResults.length === 0) && <p className="direction-map-status">{mapStatus}</p>}
          {liveStatus && <p className="direction-map-status is-live">{liveStatus}</p>}
        </div>
      )}

      {!isFullscreen && (
        <div className={`direction-bearing-accordion ${bearingPanelOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className="direction-bearing-head"
            aria-expanded={bearingPanelOpen}
            onClick={() => setBearingPanelOpen((value) => !value)}
          >
            <span className="direction-bearing-label">{BEARING_LABELS.heading}</span>
            <span className="direction-bearing-now">{bearingSummary}</span>
            <span className="direction-bearing-caret" aria-hidden="true">{bearingPanelOpen ? '▲' : '▼'}</span>
          </button>
          {bearingPanelOpen && (
            <div className="direction-bearing-body">
              <BearingControls
                variant="compact"
                value={{ mode: bearingMode, declination: useDeclination }}
                onChange={handleBearingChange}
              />
            </div>
          )}
        </div>
      )}

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

      {showPlacePanel && (decoratedFavorites.length > 0 || visibleSearchResults.length > 0 || selectedPlace) && (
        <div className="direction-place-panel">
          {decoratedFavorites.length > 0 && (
            <div className="direction-place-section">
              <div className="reverse-section-title">
                <span className="reverse-section-kicker lat">favorites</span>
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
                            出発点から約<span className="lat">{formatDistance(item.distanceM)}</span>
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
                <span className="reverse-section-kicker lat">places</span>
                <h3 className="maru">{selectedPlace ? '検索した場所' : '検索結果'}</h3>
              </div>
              {(selectedPlace ? [{ item: selectedPlace, markerNo: null }] : numberedSearchResults).map(({ item, markerNo }) => {
                const subLabel = placeSubLabel(item);
                return (
                  <button key={favoriteKey(item)} type="button" className={`direction-place-row ${markerNo ? 'is-numbered' : ''}`} onClick={() => showPlace(item)}>
                    {markerNo ? (
                      <span className={`direction-place-number ${toneClass(item.direction?.tone)}`}>{placeNumberLabel(markerNo)}</span>
                    ) : (
                      <span className={`direction-place-dot ${toneClass(item.direction?.tone)}`} />
                    )}
                    <span>
                      <strong>{item.name}</strong>
                      {subLabel && <small className="direction-place-sublabel">{subLabel}</small>}
                      <small>出発点から約<span className="lat">{formatDistance(item.distanceM)}</span></small>
                    </span>
                    <b>{item.direction?.label || '-'} <span className="lat">{scoreText(item.direction?.score || 0)}</span></b>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="direction-map-caption">{profile.caption}</p>
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
              <span>🏠 拠点にする<small>出発点リストの上に表示</small></span>
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
