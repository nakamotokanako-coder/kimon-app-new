import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MAP_FAN,
  MAP_FAN_COLORS,
  bearingFor,
  buildFanLayerSpecs,
  destPoint,
  directionIndexFor,
  getDistanceProfile,
  isNegativeTone,
  isPositiveTone,
  liveLineColor,
  sectorPolygon,
} from './mapFan.js';
import {
  FACILITY_PRESETS,
  MAP_SEARCH_STORAGE_KEY,
  buildOverpassNameQuery,
  buildOverpassQuery,
  decoratePlaces,
  deleteFavorite,
  distanceMeters,
  favoriteKey,
  favoriteDisplayName,
  findFacilityPreset,
  normalizeOverpassElements,
  overpassFetch,
  renameFavorite,
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

function toneClass(tone) {
  if (isPositiveTone(tone)) return 'is-good';
  if (isNegativeTone(tone)) return 'is-bad';
  return 'is-neutral';
}

function placeMarkerHtml(item, favorite = false) {
  const tone = item.direction?.tone || 'neutral';
  const score = item.direction?.score ?? 0;
  const sign = score > 0 ? '+' : score < 0 ? '-' : '·';
  return `<div class="direction-poi-pin ${toneClass(tone)} ${favorite ? 'is-favorite' : ''}"><span>${sign}</span></div>`;
}

function ScrollWindow({ children, className = '' }) {
  return (
    <div className={`direction-scroll-window ${className}`.trim()}>
      {children}
    </div>
  );
}

export default function DirectionMap({ location, rankings, bestPalace, profileKey = 'jiban', showScale = false }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bearingMode, setBearingMode] = useState(MAP_FAN.defaultBearingMode);
  const [useDeclination, setUseDeclination] = useState(MAP_FAN.defaultDeclination);
  const [mapQuery, setMapQuery] = useState('');
  const [mapStatus, setMapStatus] = useState('');
  const [mapSearching, setMapSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
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
  const center = useMemo(() => [location.latitude, location.longitude], [location.latitude, location.longitude]);
  const bearingOptions = useMemo(
    () => buildBearingOptions(center, bearingMode, useDeclination),
    [bearingMode, center, useDeclination],
  );
  const profile = getDistanceProfile(profileKey);
  const labelMode = isFullscreen ? LABEL_MODE.fullscreen : LABEL_MODE.compact;
  const decoratedFavorites = useMemo(
    () => decoratePlaces(favorites, center, rankings, bearingOptions),
    [bearingOptions, center, favorites, rankings],
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

  const addFavorite = (place) => {
    const key = favoriteKey(place);
    if (favorites.some((item) => favoriteKey(item) === key)) return;
    saveFavorites([...favorites, { name: place.name, latitude: place.latitude, longitude: place.longitude }]);
    setMapStatus(`${place.name}をお気に入りに追加しました。`);
  };

  const removeFavorite = (place) => {
    const key = favoriteKey(place);
    saveFavorites(favorites.filter((item) => favoriteKey(item) !== key));
    setMapStatus(`${place.name}をお気に入りから削除しました。`);
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
      ? `${word}を${decorated.length}件表示しました。ピンの色はその場所の方位評価です。`
      : `${word}はこの地図範囲では見つかりませんでした。地図を動かして再検索してください。`);
  };

  const runNameFallbackSearch = async (word) => {
    const map = mapRef.current;
    if (!map) return false;
    const query = buildOverpassNameQuery(word, map.getBounds());
    let data;
    try {
      data = await overpassFetch(query);
    } catch {
      return false;
    }
    const decorated = decoratePlaces(
      normalizeOverpassElements(data.elements).slice(0, 40),
      center,
      rankings,
      bearingOptions,
    );
    if (!decorated.length) return false;
    setSelectedPlace(null);
    setSearchResults(decorated);
    setMapStatus(`${word}を地図範囲内の名称から${decorated.length}件表示しました。`);
    return true;
  };

  const runPlaceSearch = async (word) => {
    setMapStatus(`${word}を住所・地名として検索しています。`);
    const response = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(word)}`);
    const data = await response.json();
    const first = data?.[0];
    const coords = first?.geometry?.coordinates;
    if (!coords) {
      const foundByName = await runNameFallbackSearch(word);
      if (!foundByName) setMapStatus(`${word}は見つかりませんでした。市区町村名などを足して再検索してください。`);
      return;
    }
    const place = decoratePlaces([{
      id: `place-${coords[1]}-${coords[0]}`,
      name: first.properties?.title || word,
      latitude: Number(coords[1]),
      longitude: Number(coords[0]),
    }], center, rankings, bearingOptions)[0];
    setSearchResults([]);
    setSelectedPlace(place);
    const map = mapRef.current;
    if (map) {
      map.fitBounds(L.latLngBounds([center, [place.latitude, place.longitude]]).pad(0.35), {
        maxZoom: profile.initialZoom + 2,
      });
    }
    setMapStatus(`${place.name}を表示しました。家から${formatDistance(place.distanceM)}、${place.direction?.label || '該当なし'}です。`);
  };

  const runMapSearch = async (word = mapQuery) => {
    const text = word.trim();
    if (!text || mapSearching) return;
    setMapQuery(text);
    clearPlaceMarkers();
    setMapSearching(true);
    try {
      const preset = findFacilityPreset(text);
      if (preset) await runFacilitySearch(text, preset);
      else await runPlaceSearch(text);
    } catch (error) {
      setMapStatus(`検索に失敗しました。時間をおいて再検索してください。${error.message ? ` (${error.message})` : ''}`);
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
    if (!mapNodeRef.current || mapRef.current) return;
    mapRef.current = L.map(mapNodeRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(center, profile.initialZoom);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(mapRef.current);
    layerGroupRef.current = L.layerGroup().addTo(mapRef.current);
    liveLayerRef.current = L.layerGroup().addTo(mapRef.current);
  }, [center, profile.initialZoom]);

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
    setLiveStatus(`現在地: ${directionLabel} ${scoreText(score)} / 家から約${distanceLabel}`);

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
    }).bindTooltip(`現在地 / 家から約${distanceLabel}`, { permanent: false }).addTo(live);
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

    const specs = buildFanLayerSpecs(rankings, bestPalace, bearingOptions, profileKey);
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
      const labelAngle = bearingFor(directionIndexFor(item), bearingOptions);
      const labelPoint = destPoint(center, labelAngle, profile.fadeMaxKm * 1000 * 0.72);
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
      ...searchResults.map((item) => ({ item, favorite: false })),
      ...(selectedPlace ? [{ item: selectedPlace, favorite: false }] : []),
      ...decoratedFavorites.map((item) => ({ item, favorite: true })),
    ].forEach(({ item, favorite }) => {
      const isSaved = favorites.some((fav) => favoriteKey(fav) === favoriteKey(item));
      const popup = [
        `<strong>${escapeHtml(item.name)}</strong>`,
        `${escapeHtml(item.direction?.label || '-')} ${scoreText(item.direction?.score || 0)}`,
        `家から約${formatDistance(item.distanceM)}`,
        isSaved
          ? '<button class="direction-popup-button" data-remove-favorite="1">お気に入りから削除</button>'
          : '<button class="direction-popup-button" data-add-favorite="1">お気に入りに追加</button>',
      ].join('<br>');
      const marker = L.marker([item.latitude, item.longitude], {
        icon: L.divIcon({
          className: '',
          html: placeMarkerHtml(item, favorite),
          iconSize: favorite ? [28, 28] : [22, 22],
          iconAnchor: favorite ? [14, 28] : [11, 22],
          popupAnchor: [0, -20],
        }),
      }).bindPopup(popup).addTo(layerGroup);
      marker.on('popupopen', (event) => {
        const element = event.popup.getElement();
        element?.querySelector('[data-add-favorite]')?.addEventListener('click', () => addFavorite(item), { once: true });
        element?.querySelector('[data-remove-favorite]')?.addEventListener('click', () => removeFavorite(item), { once: true });
      });
    });

    window.setTimeout(() => map.invalidateSize(), 0);
  }, [
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
        <div className="direction-map-controls" aria-label="方位線の引き方">
          <div className="direction-map-toggle" role="group" aria-label="平面または球面">
            <button
              type="button"
              className={bearingMode === 'plane' ? 'is-active' : ''}
              onClick={() => setBearingMode('plane')}
            >
              平面
            </button>
            <button
              type="button"
              className={bearingMode === 'sphere' ? 'is-active' : ''}
              onClick={() => setBearingMode('sphere')}
            >
              球面
            </button>
          </div>
          <label className="direction-map-check">
            <input
              type="checkbox"
              checked={useDeclination}
              onChange={(event) => setUseDeclination(event.target.checked)}
            />
            西偏角あり
          </label>
        </div>
      )}

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
        {mapStatus && <p className="direction-map-status">{mapStatus}</p>}
        {liveStatus && <p className="direction-map-status is-live">{liveStatus}</p>}
      </div>

      <div ref={mapNodeRef} className="direction-map" aria-label="地図上の吉方位扇表示" />

      {(decoratedFavorites.length > 0 || searchResults.length > 0 || selectedPlace) && (
        <div className="direction-place-panel">
          {decoratedFavorites.length > 0 && (
            <div className="direction-place-section">
              <h3>お気に入り（{decoratedFavorites.length}）</h3>
              <ScrollWindow className="direction-favorites-window">
                {decoratedFavorites.map((item) => (
                  <div key={favoriteKey(item)} className="direction-place-row is-editable">
                    <button type="button" className="direction-place-main" onClick={() => showPlace(item)}>
                      <span className={`direction-place-dot ${toneClass(item.direction?.tone)}`} />
                      <span>
                        <strong>{favoriteDisplayName(item)}</strong>
                        <small>{item.name} ・ 家から約{formatDistance(item.distanceM)}</small>
                      </span>
                      <b>{item.direction?.label || '-'} {scoreText(item.direction?.score || 0)}</b>
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
                ))}
              </ScrollWindow>
            </div>
          )}
          {(selectedPlace || searchResults.length > 0) && (
            <div className="direction-place-section">
              <h3>{selectedPlace ? '検索した場所' : '検索結果'}</h3>
              {(selectedPlace ? [selectedPlace] : searchResults.slice(0, 8)).map((item) => (
                <button key={favoriteKey(item)} type="button" className="direction-place-row" onClick={() => showPlace(item)}>
                  <span className={`direction-place-dot ${toneClass(item.direction?.tone)}`} />
                  <span>
                    <strong>{item.name}</strong>
                    <small>家から約{formatDistance(item.distanceM)}</small>
                  </span>
                  <b>{item.direction?.label || '-'} {scoreText(item.direction?.score || 0)}</b>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="direction-map-caption">{profile.caption}</p>
      {showScale && (
        <div className="direction-scale-card">
          <h3>{profile.scaleTitle}</h3>
          <div className="direction-ruler" aria-hidden="true">
            {profile.ruler.map((segment) => (
              <React.Fragment key={`${segment.x}-${segment.w}`}>
                <span
                  className="direction-ruler-band"
                  style={{
                    left: `${segment.x}%`,
                    width: `${segment.w}%`,
                    backgroundColor: `rgba(24, 95, 165, ${segment.op})`,
                  }}
                />
                {segment.label && (
                  <span className="direction-ruler-label" style={{ left: `${segment.x + 1}%` }}>{segment.label}</span>
                )}
                {segment.bottom && (
                  <span className="direction-ruler-label is-bottom" style={{ left: `${segment.x + 1}%` }}>{segment.bottom}</span>
                )}
              </React.Fragment>
            ))}
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
