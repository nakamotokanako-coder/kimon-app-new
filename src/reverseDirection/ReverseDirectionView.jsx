import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CompassWheel from './CompassWheel.jsx';
import DirectionMap from './DirectionMap.jsx';
import FavoritesStrip from './FavoritesStrip.jsx';
import FusionCard from './FusionCard.jsx';
import KakkyokuSearchView from './KakkyokuSearchView.jsx';
import LuckyOmamoriBar from './LuckyOmamoriBar.jsx';
import SanbanRouteView from './SanbanRouteView.jsx';
import MiniBoardGrid from './MiniBoardGrid.jsx';
import SaikyoRankingView from './SaikyoRankingView.jsx';
import BasePointBar from '../components/yoho/BasePointBar.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import { getBoardDate } from '../utils/boardDate.js';
import { getJstHours } from '../utils/jishinLabels.js';
import { sortTimelineSlotsByScore } from './strongestRanking.js';
import {
  buildDayReverseBoard,
  buildReverseBoard,
  buildTimeline,
  filterGoodRankings,
  getLongitudeCorrectionMinutes,
  applyNaturalTime,
  getTimeSlotHour,
  getTimeSlotIndex,
  getTimeSlotLabel,
} from './reverseDirection.js';
import {
  MAP_SEARCH_STORAGE_KEY,
  decoratePlaces,
  favoriteDisplayName,
  favoriteKey,
  favoriteKind,
} from './mapSearch.js';

const DEFAULT_LOCATIONS = [
  { name: '東京', latitude: 35.6812, longitude: 139.7671 },
  { name: '大阪', latitude: 34.6937, longitude: 135.5023 },
  { name: '名古屋', latitude: 35.1709, longitude: 136.8815 },
  { name: '福岡', latitude: 33.5902, longitude: 130.4017 },
  { name: '札幌', latitude: 43.0618, longitude: 141.3545 },
];

const MAP_SEARCH_CHANGED_EVENT = 'kimon-map-favorites-changed';
const GO_BASE_POINT_STORAGE_KEY = 'kimon_go_base_point_v1';
const BASE_POINT_MODES = new Set(['gps', 'favorite', 'search']);
const BASE_POINT_CANDIDATE_LIMIT = 8;
const FACILITY_TITLE_RE = /(労働局|労働基準監督署|公共職業安定所|株式会社|有限会社|学校|大学|病院|郵便局|消防|警察|駅|線|用水路|水道|センター|支社|支店|出張所|庁舎|局|署|組合|小学校|中学校|高等学校|短期大学)/;
const ADMIN_TITLE_RE = /^(東京都|北海道|(?:京都|大阪)府|.{2,3}県).*(市|区|町|村)?$/;

function normalizeBasePointLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    name: location?.name || DEFAULT_LOCATIONS[0].name,
    latitude,
    longitude,
  };
}

function readStoredBasePoint() {
  try {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem(GO_BASE_POINT_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    const location = normalizeBasePointLocation(parsed?.location);
    if (!location || !BASE_POINT_MODES.has(parsed?.mode)) return null;
    return {
      mode: parsed.mode,
      location,
      selectedFavoriteId: parsed?.selectedFavoriteId || null,
    };
  } catch {
    return null;
  }
}

function writeStoredBasePoint(next) {
  try {
    if (typeof window === 'undefined') return;
    const location = normalizeBasePointLocation(next?.location);
    if (!location || !BASE_POINT_MODES.has(next?.mode)) return;
    window.localStorage.setItem(GO_BASE_POINT_STORAGE_KEY, JSON.stringify({
      mode: next.mode,
      location,
      selectedFavoriteId: next?.selectedFavoriteId || null,
    }));
  } catch {
    // localStorage may be unavailable in private or restricted contexts.
  }
}

function formatCorrection(minutes) {
  if (minutes === 0) return '±0分';
  return `${minutes > 0 ? '+' : ''}${minutes}分`;
}

function formatDisplayDate(date) {
  return date.replaceAll('-', '/');
}

function formatCurrentClock(date = new Date()) {
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatClockMinute(date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getNaturalSlotStart(naturalDate, slotHour) {
  const start = new Date(naturalDate);
  start.setMinutes(0, 0, 0);
  if (slotHour === 0) {
    start.setHours(23);
    if (getJstHours(naturalDate) !== 23) start.setDate(start.getDate() - 1);
    return start;
  }
  start.setHours(slotHour - 1);
  return start;
}

function getCurrentTimeWindow(now, correctionMinutes) {
  const naturalDate = applyNaturalTime(now, correctionMinutes);
  const currentSlotHour = getTimeSlotHour(naturalDate);
  const naturalStart = getNaturalSlotStart(naturalDate, currentSlotHour);
  const naturalEnd = new Date(naturalStart.getTime() + 2 * 60 * 60 * 1000);
  const clockStart = new Date(naturalStart.getTime() - correctionMinutes * 60 * 1000);
  const clockEnd = new Date(naturalEnd.getTime() - correctionMinutes * 60 * 1000);
  const remainingMinutes = Math.max(0, Math.ceil((clockEnd.getTime() - now.getTime()) / 60000));
  return {
    clockRange: `${formatClockMinute(clockStart)}–${formatClockMinute(clockEnd)}`,
    naturalLabel: getTimeSlotLabel(currentSlotHour).replace('-', '–'),
    remainingMinutes,
  };
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '-';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

function scoreText(score) {
  return `${score > 0 ? '+' : ''}${score}`;
}

function normalizeFavoriteBasePoint(favorite) {
  const latitude = Number(favorite?.latitude ?? favorite?.lat);
  const longitude = Number(favorite?.longitude ?? favorite?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const normalized = {
    ...favorite,
    name: favorite?.name || favorite?.address || 'お気に入り',
    latitude,
    longitude,
  };
  return {
    ...normalized,
    id: favorite?.id || favoriteKey(normalized),
  };
}

function readStoredFavorites() {
  try {
    if (typeof window === 'undefined') return [];
    const saved = window.localStorage.getItem(MAP_SEARCH_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return (Array.isArray(parsed) ? parsed : [])
      .map(normalizeFavoriteBasePoint)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeBasePointCandidate(candidate, index) {
  const coords = candidate?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const title = candidate?.properties?.title || '候補地';
  const isFacility = FACILITY_TITLE_RE.test(title);
  return {
    id: `${index}-${latitude}-${longitude}`,
    title,
    latitude,
    longitude,
    order: index,
    priority: ADMIN_TITLE_RE.test(title) && !isFacility ? 0 : isFacility ? 2 : 1,
  };
}

function buildBasePointCandidates(data) {
  return (Array.isArray(data) ? data : [])
    .map(normalizeBasePointCandidate)
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority || a.order - b.order)
    .slice(0, BASE_POINT_CANDIDATE_LIMIT);
}

export default function ReverseDirectionView({
  isActive,
  onOpenBoard,
  unreadNotificationCount = 0,
  onOpenNotifications,
}) {
  const initialBasePoint = useMemo(() => readStoredBasePoint(), []);
  const [location, setLocation] = useState(initialBasePoint?.location || DEFAULT_LOCATIONS[0]);
  const [currentMode, setCurrentMode] = useState(initialBasePoint?.mode || 'search');
  const [selectedFavoriteId, setSelectedFavoriteId] = useState(initialBasePoint?.selectedFavoriteId || null);
  const [favorites, setFavorites] = useState(() => readStoredFavorites());
  const [query, setQuery] = useState('');
  const [basePointCandidates, setBasePointCandidates] = useState([]);
  const [basePointSearching, setBasePointSearching] = useState(false);
  const [goodOnly, setGoodOnly] = useState(true);
  const [mode, setMode] = useState('time');
  const [dayDate, setDayDate] = useState(getBoardDate());
  const [status, setStatus] = useState('');
  const [openTimelineHour, setOpenTimelineHour] = useState(null);
  const [timelineSortMode, setTimelineSortMode] = useState('time');
  const [dayGoView, setDayGoView] = useState('map');
  const [basePointOpen, setBasePointOpen] = useState(false);
  const [dayBasePointOpen, setDayBasePointOpen] = useState(false);
  const [rankingBasePointOpen, setRankingBasePointOpen] = useState(false);
  const [currentMiniBoardOpen, setCurrentMiniBoardOpen] = useState(false);
  const [dayMiniBoardOpen, setDayMiniBoardOpen] = useState(false);
  const [focusedFavoriteKey, setFocusedFavoriteKey] = useState('');
  const [dayFocusedFavoriteKey, setDayFocusedFavoriteKey] = useState('');
  // GOゾーン再構成(PR-2.6): 時盤お散歩のみ「すべて見る」でお気に入りフルリストを開閉する。
  const [showFavoritesList, setShowFavoritesList] = useState(false);
  const [basePointEstablished, setBasePointEstablished] = useState(true);
  const [ctaSearchOpen, setCtaSearchOpen] = useState(false);
  // 出発点ピッカーのグループ開閉（mock v9: 🏠拠点=開 / ⭐お気に入り=閉 / 住所検索=閉）
  const [homeGroupOpen, setHomeGroupOpen] = useState(true);
  const [spotGroupOpen, setSpotGroupOpen] = useState(false);
  const [addrSearchOpen, setAddrSearchOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const correction = getLongitudeCorrectionMinutes(location.longitude);
  const naturalNow = applyNaturalTime(new Date(), correction);
  const today = getBoardDate();
  const slotHour = getTimeSlotHour(naturalNow);
  const date = today;
  const currentTimeWindow = useMemo(
    () => getCurrentTimeWindow(now, correction),
    [now, correction],
  );

  const reverse = useMemo(() => (
    buildReverseBoard({ date, hour: slotHour })
  ), [date, slotHour]);
  const timeOmamoriSeed = `${date}#${getTimeSlotIndex(slotHour)}`;

  const visibleRankings = filterGoodRankings(reverse.rankings, goodOnly);
  const best = visibleRankings[0] || null;
  const favoriteChips = useMemo(() => (
    decoratePlaces(favorites, [location.latitude, location.longitude], reverse.rankings)
  ), [favorites, location.latitude, location.longitude, reverse.rankings]);

  const dayReverseState = useMemo(() => {
    try {
      return {
        result: buildDayReverseBoard({ date: dayDate }),
        error: null,
      };
    } catch (error) {
      return { result: null, error: error.message };
    }
  }, [dayDate]);
  const dayReverse = dayReverseState.result;
  const dayVisibleRankings = filterGoodRankings(dayReverse?.rankings || [], goodOnly);
  const dayBest = dayVisibleRankings[0] || null;
  const dayFavoriteChips = useMemo(() => (
    dayReverse
      ? decoratePlaces(favorites, [location.latitude, location.longitude], dayReverse.rankings)
      : []
  ), [dayReverse, favorites, location.latitude, location.longitude]);

  const timeline = useMemo(() => (
    buildTimeline({ date, goodOnly })
  ), [date, goodOnly]);
  const displayedTimeline = useMemo(() => (
    timelineSortMode === 'score' ? sortTimelineSlotsByScore(timeline) : timeline
  ), [timeline, timelineSortMode]);

  const useCurrentLocation = useCallback(() => {
    setSelectedFavoriteId(null);
    setBasePointCandidates([]);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('この端末では現在地を取得できません。場所・地名で探してください。');
      return;
    }
    setStatus('現在地を取得中です。');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          name: '現在地',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setCurrentMode('gps');
        setBasePointEstablished(true);
        setCtaSearchOpen(false);
        writeStoredBasePoint({
          mode: 'gps',
          location: {
            name: '\u73fe\u5728\u5730',
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          },
          selectedFavoriteId: null,
        });
        setStatus('現在地を出発点にしました。');
      },
      () => {
        setStatus('現在地を取得できませんでした。前回の出発点を表示したままにしています。');
      },
      { timeout: 8000, enableHighAccuracy: false },
    );
  }, []);

  const handleGlobalBasePointChange = useCallback((nextCenter, nextName = '選択地点') => {
    const longitude = Number(nextCenter?.[0]);
    const latitude = Number(nextCenter?.[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const nextLocation = {
      name: nextName || '選択地点',
      latitude,
      longitude,
    };
    setLocation(nextLocation);
    setCurrentMode(nextName === '現在地' ? 'gps' : 'search');
    setSelectedFavoriteId(null);
    setBasePointCandidates([]);
    setBasePointEstablished(true);
    setBasePointOpen(false);
    setDayBasePointOpen(false);
    setRankingBasePointOpen(false);
    setCtaSearchOpen(false);
    writeStoredBasePoint({
      mode: nextName === '現在地' ? 'gps' : 'search',
      location: nextLocation,
      selectedFavoriteId: null,
    });
    setStatus(`${nextLocation.name}を出発点にしました。`);
  }, []);

  useEffect(() => {
    if (!isActive || typeof window === 'undefined') return undefined;
    const timer = window.setInterval(() => setNow(new Date()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, [isActive]);

  const refreshFavorites = useCallback(() => {
    setFavorites(readStoredFavorites());
  }, []);

  useEffect(() => {
    refreshFavorites();
    const handleFavoritesChanged = () => refreshFavorites();
    const handleStorage = (event) => {
      if (event.key === MAP_SEARCH_STORAGE_KEY) refreshFavorites();
    };
    window.addEventListener(MAP_SEARCH_CHANGED_EVENT, handleFavoritesChanged);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFavoritesChanged);
    return () => {
      window.removeEventListener(MAP_SEARCH_CHANGED_EVENT, handleFavoritesChanged);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFavoritesChanged);
    };
  }, [refreshFavorites]);

  useEffect(() => {
    if (currentMode !== 'favorite' || !selectedFavoriteId) return;
    const favorite = favorites.find((item) => item.id === selectedFavoriteId);
    if (!favorite) {
      setLocation(DEFAULT_LOCATIONS[0]);
      setCurrentMode('search');
      setSelectedFavoriteId(null);
      setStatus('保存済みの出発点が見つからないため、東京を表示しています。');
      return;
    }
    setBasePointEstablished(true);
    const nextName = favoriteDisplayName(favorite);
    if (
      location.name !== nextName
      || location.latitude !== favorite.latitude
      || location.longitude !== favorite.longitude
    ) {
      setLocation({
        name: nextName,
        latitude: favorite.latitude,
        longitude: favorite.longitude,
      });
      writeStoredBasePoint({
        mode: 'favorite',
        location: {
          name: nextName,
          latitude: favorite.latitude,
          longitude: favorite.longitude,
        },
        selectedFavoriteId: favorite.id,
      });
    }
  }, [currentMode, favorites, location, selectedFavoriteId]);

  const searchPlace = async () => {
    const text = query.trim();
    if (!text || basePointSearching) return;
    setBasePointSearching(true);
    setBasePointCandidates([]);
    setStatus('候補を検索中です。');
    try {
      const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(text)}`);
      const data = await res.json();
      const candidates = buildBasePointCandidates(data);
      setBasePointCandidates(candidates);
      setStatus(candidates.length > 0 ? '候補から出発点を選んでください。' : '候補が見つかりませんでした。');
    } catch {
      setStatus('場所検索に失敗しました。時間をおいて再試行してください。');
    } finally {
      setBasePointSearching(false);
    }
  };

  const selectBasePointCandidate = (candidate) => {
    const nextLocation = {
      name: candidate.title,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    };
    setLocation(nextLocation);
    setCurrentMode('search');
    setSelectedFavoriteId(null);
    setBasePointCandidates([]);
    setBasePointEstablished(true);
    setCtaSearchOpen(false);
    setQuery(candidate.title);
    writeStoredBasePoint({
      mode: 'search',
      location: nextLocation,
      selectedFavoriteId: null,
    });
    setStatus('選択した場所を出発点にしました。');
  };

  // お気に入り/拠点を出発点に選ぶ。location と localStorage の反映は currentMode='favorite' の useEffect が行う。
  const selectFavoriteBasePoint = (favorite) => {
    if (!favorite) return;
    setBasePointCandidates([]);
    setBasePointEstablished(true);
    setCurrentMode('favorite');
    setSelectedFavoriteId(favorite.id);
    setBasePointOpen(false);
    setDayBasePointOpen(false);
    setRankingBasePointOpen(false);
    setStatus(`${favoriteDisplayName(favorite)}を出発点にしました。`);
  };

  const filterCard = (
    <div className="reverse-card reverse-filter-card">
      <div className="reverse-filter-controls">
        <label className="reverse-toggle-row">
          <span>吉のみ表示</span>
          <input
            type="checkbox"
            checked={goodOnly}
            onChange={(e) => setGoodOnly(e.target.checked)}
          />
        </label>
        <div className="reverse-sort-toggle" role="group" aria-label="時間帯ベストの並び順">
          <button
            type="button"
            className={timelineSortMode === 'time' ? 'is-active' : ''}
            onClick={() => setTimelineSortMode('time')}
          >
            時間順
          </button>
          <button
            type="button"
            className={timelineSortMode === 'score' ? 'is-active' : ''}
            onClick={() => setTimelineSortMode('score')}
          >
            点数順
          </button>
        </div>
      </div>
    </div>
  );

  const basePointSearchForm = (
    <>
      <form
        className="reverse-search-row kiten-search-row"
        onSubmit={(event) => {
          event.preventDefault();
          searchPlace();
        }}
      >
        <input
          type="search"
          value={query}
          placeholder="場所・地名で探す"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={basePointSearching}>
          {basePointSearching ? '検索中' : '検索'}
        </button>
      </form>
      {basePointCandidates.length > 0 && (
        <div className="kiten-candidates" role="listbox" aria-label="出発点候補">
          {basePointCandidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => selectBasePointCandidate(candidate)}
            >
              <strong>{candidate.title}</strong>
              <small className="lat">
                {candidate.latitude.toFixed(4)}, {candidate.longitude.toFixed(4)}
              </small>
            </button>
          ))}
        </div>
      )}
    </>
  );

  const basePointControls = (
    <div className="kiten-panel">
      <div className="kiten-primary-actions">
        <button type="button" className="kiten-current-button" onClick={useCurrentLocation}>
          <span aria-hidden="true">📍</span>
          <span>現在地を使う</span>
        </button>
      </div>
      {basePointSearchForm}
    </div>
  );

  // 出発点ピッカー（mock v9）: 現在地常時 / 🏠拠点=開 / ⭐お気に入り=閉(内部スクロール) / 住所検索=閉
  const homeFavorites = favorites.filter((item) => favoriteKind(item) === 'home');
  const spotFavorites = favorites.filter((item) => favoriteKind(item) !== 'home');

  const renderPickerRow = (favorite) => {
    const selected = currentMode === 'favorite' && selectedFavoriteId === favorite.id;
    const subAddress = favorite.label?.trim() ? favorite.name : '';
    const icon = favoriteKind(favorite) === 'home' ? '🏠' : '⭐';
    return (
      <button
        type="button"
        key={favorite.id}
        className={`kiten-pick-row${selected ? ' is-selected' : ''}`}
        onClick={() => selectFavoriteBasePoint(favorite)}
        aria-pressed={selected}
      >
        <span className="kiten-pick-ic" aria-hidden="true">{icon}</span>
        <span className="kiten-pick-tx">
          <span className="kiten-pick-nm">{favoriteDisplayName(favorite)}</span>
          {subAddress && <span className="kiten-pick-ad">{subAddress}</span>}
        </span>
        <span className="kiten-pick-chk" aria-hidden="true">✓</span>
      </button>
    );
  };

  const basePointPicker = (
    <div className="kiten-picker">
      <button type="button" className="kiten-pick-now" onClick={useCurrentLocation}>
        <span className="kiten-pick-now-ic" aria-hidden="true">📍</span>
        <span className="kiten-pick-now-tx">
          <span className="kiten-pick-now-b">現在地を使う</span>
          <span className="kiten-pick-now-s">押すと位置情報の確認が出ます</span>
        </span>
        <span className="kiten-pick-now-arr" aria-hidden="true">›</span>
      </button>

      {homeFavorites.length > 0 && (
        <>
          <button
            type="button"
            className={`kiten-pick-grp${homeGroupOpen ? ' is-open' : ''}`}
            onClick={() => setHomeGroupOpen((value) => !value)}
            aria-expanded={homeGroupOpen}
          >
            <span className="kiten-pick-grp-ic" aria-hidden="true">🏠</span>
            <span className="kiten-pick-grp-t">自宅・拠点</span>
            <span className="kiten-pick-grp-cnt">{homeFavorites.length}件</span>
            <span className="kiten-pick-grp-ln" aria-hidden="true" />
            <span className="kiten-pick-grp-car" aria-hidden="true">▼</span>
          </button>
          {homeGroupOpen && (
            <div className="kiten-pick-body">{homeFavorites.map(renderPickerRow)}</div>
          )}
        </>
      )}

      {spotFavorites.length > 0 && (
        <>
          <button
            type="button"
            className={`kiten-pick-grp${spotGroupOpen ? ' is-open' : ''}`}
            onClick={() => setSpotGroupOpen((value) => !value)}
            aria-expanded={spotGroupOpen}
          >
            <span className="kiten-pick-grp-ic" aria-hidden="true">⭐</span>
            <span className="kiten-pick-grp-t">お気に入りから</span>
            <span className="kiten-pick-grp-cnt">{spotFavorites.length}件</span>
            <span className="kiten-pick-grp-ln" aria-hidden="true" />
            <span className="kiten-pick-grp-car" aria-hidden="true">▼</span>
          </button>
          {spotGroupOpen && (
            <div className="kiten-pick-body kiten-pick-body-scroll">{spotFavorites.map(renderPickerRow)}</div>
          )}
        </>
      )}

      <button
        type="button"
        className={`kiten-pick-addr-toggle${addrSearchOpen ? ' is-open' : ''}`}
        onClick={() => setAddrSearchOpen((value) => !value)}
        aria-expanded={addrSearchOpen}
      >
        <span aria-hidden="true">🔍</span>
        <span>住所や地名で探す</span>
        <span className="kiten-pick-grp-car" aria-hidden="true">▼</span>
      </button>
      {addrSearchOpen && <div className="kiten-pick-addr">{basePointSearchForm}</div>}
    </div>
  );

  const basePointCtaCard = (
    <div className="kiten-cta-card">
      <button type="button" className="kiten-cta" onClick={useCurrentLocation}>
        <span aria-hidden="true">📍</span>
        <span>タップして現在地を使う</span>
      </button>
      <button
        type="button"
        className="kiten-cta-secondary"
        onClick={() => setCtaSearchOpen((value) => !value)}
        aria-expanded={ctaSearchOpen}
      >
        住所・地名で入力する
      </button>
      {ctaSearchOpen && (
        <div className="reverse-base-panel">
          {basePointSearchForm}
        </div>
      )}
      {status && <p className="reverse-status">{status}</p>}
    </div>
  );

  const basePointMeta = mode === 'time' || mode === 'timeRanking' || mode === 'kakkyoku' || mode === 'range' ? (
    <div className="reverse-correction">
      <span>自然時補正：{location.name} <b className="lat">{formatCorrection(correction)}</b></span>
      <span>経度 <b className="lat">{location.longitude.toFixed(2)}</b></span>
    </div>
  ) : (
    <div className="reverse-correction">
      <span>日盤は自然時補正なし</span>
      <span>経度 <b className="lat">{location.longitude.toFixed(2)}</b></span>
    </div>
  );

  const basePointCard = (
    <div className="reverse-card reverse-location-card">
      <div className="reverse-card-title">
        <div>
          <span className="reverse-section-kicker lat">base point</span>
          <h3 className="maru">基準点</h3>
        </div>
        <span>現在地 / 場所・地名検索</span>
      </div>
      {basePointControls}
      {basePointMeta}
      {status && <p className="reverse-status">{status}</p>}
    </div>
  );

  const rankingBasePointMeta = mode === 'timeRanking' ? basePointMeta : (
    <div className="reverse-correction">
      <span>日盤は自然時補正なし</span>
    </div>
  );

  const rankingBasePointPanel = (
    <div className="reverse-card reverse-go-card reverse-base-card">
      <div className="reverse-base-compact">
        <span>
          基準点 <strong>{location.name}</strong>
        </span>
        <button type="button" onClick={() => setRankingBasePointOpen((value) => !value)}>
          変更
        </button>
      </div>
      {rankingBasePointOpen && (
        <div className="reverse-base-panel">
          {basePointPicker}
          {rankingBasePointMeta}
          {status && <p className="reverse-status">{status}</p>}
        </div>
      )}
    </div>
  );

  const renderGoZone = ({
    rankings,
    bestPalace,
    profileKey,
    showScale = false,
    goViewValue,
    onGoViewChange,
    chips,
    focusedKey,
    onFocusKey,
    basePointOpenValue,
    onToggleBasePoint,
    baseSubLabel,
    hideOnboarding = false,
  }) => (
    <div className="reverse-zone reverse-go-zone">
      <div className="reverse-zone-title">
        <span className="reverse-section-kicker lat">go</span>
        <h3 className="maru">出かける場所を探す</h3>
      </div>

      {!hideOnboarding && (
        <p className="reverse-go-guide">
          はじめての方へ　<b className="lat">①</b> 出発点を決めて → <b className="lat">②</b> 行き先を探してみよう
        </p>
      )}

      {!hideOnboarding && (
      <div className="reverse-go-step" style={{ display: 'none' }}>
        <div className="reverse-step-title">
          <span className="reverse-section-kicker lat">from</span>
          <h4 className="maru"><span className="lat">①</span> 出発点</h4>
        </div>
        <div className="reverse-card reverse-go-card reverse-base-card">
          {basePointEstablished ? (
            <>
              <div className="reverse-base-compact">
                <span>
                  出発点 <strong>{location.name}</strong>
                  {baseSubLabel}
                </span>
                <button type="button" onClick={onToggleBasePoint}>
                  変更
                </button>
              </div>
              {basePointOpenValue && (
                <div className="reverse-base-panel">
                  {basePointPicker}
                  {basePointMeta}
                  {status && <p className="reverse-status">{status}</p>}
                </div>
              )}
            </>
          ) : (
            basePointCtaCard
          )}
        </div>
      </div>
      )}

      <div className={`reverse-go-step reverse-go-step-to ${basePointEstablished ? '' : 'is-await-base'}`}>
        {!hideOnboarding && (
          <div className="reverse-step-title">
            <span className="reverse-section-kicker lat">to</span>
            <h4 className="maru"><span className="lat">②</span> 行き先を探す</h4>
          </div>
        )}

        {!basePointEstablished && (
          <p className="reverse-go-await">まず①で出発点を決めてください</p>
        )}

        <div className="reverse-card reverse-go-card">
          <div className="reverse-go-tabs" role="group" aria-label="出かける場所の探し方">
            <button
              type="button"
              className={goViewValue === 'map' ? 'is-active' : ''}
              onClick={() => onGoViewChange('map')}
            >
              地図で探す
            </button>
            <button
              type="button"
              className={goViewValue === 'favorites' ? 'is-active' : ''}
              onClick={() => onGoViewChange('favorites')}
            >
              お気に入り
            </button>
          </div>

          {goViewValue === 'map' && (
            <p className="reverse-go-pin-hint">
              📍 気になる場所のピンをタップすると、お気に入りに登録できます
            </p>
          )}

          {goViewValue === 'favorites' && (
            <div className="reverse-favorite-chips" aria-label="お気に入り">
              {chips.length > 0 ? chips.map((item) => {
                const key = favoriteKey(item);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onFocusKey(key)}
                  >
                    <strong>{favoriteDisplayName(item)}</strong>
                    <span>{item.direction?.label || '-'} <b className="lat">{scoreText(item.direction?.score || 0)}</b></span>
                    <small className="lat">{formatDistance(item.distanceM)}</small>
                  </button>
                );
              }) : (
                <p>地図で見つけた場所をお気に入りに追加すると、ここに表示されます。</p>
              )}
            </div>
          )}

          <DirectionMap
            location={location}
            rankings={rankings}
            bestPalace={bestPalace}
            profileKey={profileKey}
            showScale={showScale}
            focusFavoriteKey={goViewValue === 'favorites' ? focusedKey : ''}
            showSearchControls={goViewValue === 'map'}
            showPlacePanel={goViewValue === 'map'}
          />
        </div>
      </div>
    </div>
  );

  // PR-2.6: 時盤お散歩モード専用のGOゾーン。地図を常時主役表示にし、
  // 従来のタブ切替(地図で探す/お気に入り)・見出し・📍バナーを廃止して
  // 地図直下にお気に入りストリップを新設する。日盤遠出は renderGoZone のまま。
  const renderJibanGoZone = ({ rankings, bestPalace }) => (
    <div className="reverse-zone reverse-go-zone reverse-go-zone--jiban">
      <div className="reverse-card reverse-go-card">
        <DirectionMap
          location={location}
          rankings={rankings}
          bestPalace={bestPalace}
          profileKey="jiban"
          showScale={false}
          focusFavoriteKey={focusedFavoriteKey}
          showSearchControls
          showPlacePanel
          showFavoritesSection={showFavoritesList}
        />
      </div>

      <FavoritesStrip
        chips={favoriteChips}
        focusedKey={focusedFavoriteKey}
        onFocusKey={setFocusedFavoriteKey}
        onShowAll={() => setShowFavoritesList((value) => !value)}
      />
    </div>
  );

  const timelineSection = (
    <>
      {filterCard}

      <div className="reverse-timeline">
        <div className="reverse-section-title">
          <span className="reverse-section-kicker lat">today's best</span>
          <h3 className="maru">本日の時間帯別ベスト</h3>
        </div>
        {displayedTimeline.map((slot) => (
          <div key={slot.hour} className="reverse-tl-block">
            <button
              type="button"
              className={`reverse-tl-item ${slot.hour === slotHour ? 'is-now' : ''} ${openTimelineHour === slot.hour ? 'is-expanded' : ''}`}
              onClick={() => setOpenTimelineHour((current) => (current === slot.hour ? null : slot.hour))}
              aria-expanded={openTimelineHour === slot.hour}
            >
              <span className="reverse-tl-time lat">{slot.label}</span>
              <span className="reverse-tl-main">
                <strong>{slot.best?.label || '該当なし'}</strong>
                <span>{slot.best?.reasons.slice(0, 2).join('・') || '凶を除外中'}</span>
              </span>
              <span className={`reverse-tl-score ${(slot.best?.score || 0) < 0 ? 'is-bad' : ''}`}>
                {slot.best ? scoreText(slot.best.score) : '-'}
              </span>
            </button>
            {openTimelineHour === slot.hour && (
              <div className="reverse-tl-panel">
                <MiniBoardGrid rankings={slot.rankings} />
                <button
                  type="button"
                  className="reverse-full-board-button"
                  onClick={() => onOpenBoard({ date, hour: slot.hour, boardType: '時' })}
                >
                  フル盤を見る
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <section className={`reverse-view${mode === 'time' ? ' reverse-view--walk' : ''}`} aria-label="逆引き方位検索">
      <div className="reverse-header">
        <div>
          <span className="reverse-kicker lat">lucky direction</span>
          <h2 className="maru">吉方位</h2>
          <p>
            {mode === 'kakkyoku'
              ? `時盤・格局検索 / ${location.name}`
              : mode === 'timeRanking'
              ? `時盤・時間帯ランキング / ${location.name}`
              : mode === 'ranking'
              ? `日盤・日盤ランキング / ${location.name}`
              : mode === 'day'
              ? `日盤・遠出 / ${location.name}`
              : mode === 'range'
              ? `時盤・奇門三盤ルート / ${location.name}`
              : `時盤・自然時補正 ${formatCorrection(correction)} / ${location.name}`}
          </p>
        </div>
<div className="reverse-header-actions">
          {mode !== 'range' && (
            <div className="reverse-time-chip lat">
              {mode === 'timeRanking'
                ? `現在 ${formatCurrentClock(now)}`
                : mode === 'day' || mode === 'ranking'
                ? formatDisplayDate(dayDate)
                : getTimeSlotLabel(slotHour)}
            </div>
          )}
          <NotificationBell unreadCount={unreadNotificationCount} onClick={onOpenNotifications} />
        </div>
      </div>

      <BasePointBar
        center={[location.longitude, location.latitude]}
        baseName={location.name}
        onCenterChange={handleGlobalBasePointChange}
      />

      <div className="reverse-mode-tabs" aria-label="吉方位内タブ">
        <button
          className={mode === 'time' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setMode('time');
          }}
        >
          時盤 お散歩
        </button>
        <button className={mode === 'timeRanking' ? 'is-active' : ''} type="button" onClick={() => setMode('timeRanking')}>
          時盤ランキング
        </button>
        <button className={mode === 'day' ? 'is-active' : ''} type="button" onClick={() => setMode('day')}>
          日盤 遠出
        </button>
        <button className={mode === 'ranking' ? 'is-active' : ''} type="button" onClick={() => setMode('ranking')}>
          日盤ランキング
        </button>
        <button className={mode === 'kakkyoku' ? 'is-active' : ''} type="button" onClick={() => setMode('kakkyoku')}>
          格局を探す
        </button>
        <button className={mode === 'range' ? 'is-active' : ''} type="button" onClick={() => setMode('range')}>
          奇門三盤ルート <span className="pro-badge" aria-label="プロ機能">PRO</span>
        </button>
      </div>

      {mode === 'time' && (
        <div className="reverse-walk-body">
          <div className="reverse-zone">
            <div className="reverse-zone-title">
              <span className="reverse-section-kicker lat">now</span>
              <h3 className="maru">今の吉方位</h3>
            </div>

            <div className="reverse-current-window">
              <span>現在の時間帯</span>
              <b className="lat">{currentTimeWindow.clockRange}</b>
              <small>
                （自然時補正 <b className="lat">{currentTimeWindow.naturalLabel}</b>）・あと
                <b className="lat">{currentTimeWindow.remainingMinutes}</b>分
              </small>
            </div>

            <FusionCard best={best} boardKey={reverse.board.meta.kyokusu + reverse.board.meta.eto} />

            <div className="reverse-card reverse-now-board-card">
              <button
                type="button"
                className="reverse-disclosure-trigger"
                onClick={() => setCurrentMiniBoardOpen((value) => !value)}
                aria-expanded={currentMiniBoardOpen}
              >
                <span>今の時盤を盤で見る</span>
                <b aria-hidden="true">{currentMiniBoardOpen ? '▾' : '›'}</b>
              </button>
              {currentMiniBoardOpen && (
                <div className="reverse-tl-panel">
                  <MiniBoardGrid rankings={reverse.rankings} />
                  <button
                    type="button"
                    className="reverse-full-board-button"
                    onClick={() => onOpenBoard({ date, hour: slotHour, boardType: '時' })}
                  >
                    フル盤を見る
                  </button>
                </div>
              )}
            </div>
          </div>

          {renderJibanGoZone({
            rankings: reverse.rankings,
            bestPalace: best?.palace,
          })}

          <LuckyOmamoriBar
            isActive={isActive}
            bestPalace={reverse.board.score.best_overall}
            seed={timeOmamoriSeed}
          />
        </div>
      )}

      {mode === 'timeRanking' && timelineSection}

      {mode === 'day' && (
        <>
          <div className="reverse-card reverse-day-card">
            <div className="reverse-card-title">
              <div>
                <span className="reverse-section-kicker lat">date</span>
                <h3 className="maru">行く日</h3>
              </div>
              <span>日盤 遠出</span>
            </div>
            <label className="reverse-date-row">
              <span>行く日</span>
              <input
                type="date"
                value={dayDate}
                onChange={(e) => setDayDate(e.target.value)}
              />
            </label>
          </div>

          {dayReverseState.error ? (
            <div className="reverse-card reverse-placeholder">
              <h3>日盤を表示できません</h3>
              <p>{dayReverseState.error}</p>
            </div>
          ) : (
            <>
              {renderGoZone({
                rankings: dayReverse.rankings,
                bestPalace: dayBest?.palace,
                profileKey: 'nichiban',
                showScale: true,
                goViewValue: dayGoView,
                onGoViewChange: setDayGoView,
                chips: dayFavoriteChips,
                focusedKey: dayFocusedFavoriteKey,
                onFocusKey: setDayFocusedFavoriteKey,
                basePointOpenValue: dayBasePointOpen,
                onToggleBasePoint: () => setDayBasePointOpen((value) => !value),
                baseSubLabel: <small>日盤・遠出 <b className="lat">{formatDisplayDate(dayDate)}</b></small>,
              })}

              <div className="reverse-card reverse-compass-card">
                <CompassWheel rankings={dayReverse.rankings} bestPalace={dayBest?.palace} />
              </div>

              <div className="reverse-card reverse-now-board-card">
                <button
                  type="button"
                  className="reverse-disclosure-trigger"
                  onClick={() => setDayMiniBoardOpen((value) => !value)}
                  aria-expanded={dayMiniBoardOpen}
                >
                  <span>この日の日盤を盤で見る</span>
                  <b aria-hidden="true">{dayMiniBoardOpen ? '▾' : '›'}</b>
                </button>
                {dayMiniBoardOpen && (
                  <div className="reverse-tl-panel">
                    <MiniBoardGrid rankings={dayReverse.rankings} />
                    <button
                      type="button"
                      className="reverse-full-board-button"
                      onClick={() => onOpenBoard({ date: dayDate, boardType: '日' })}
                    >
                      フル盤を見る
                    </button>
                  </div>
                )}
              </div>
              <LuckyOmamoriBar
                isActive={isActive}
                bestPalace={dayReverse.board.score.best_overall}
                seed={dayDate}
              />

              <div className="reverse-card reverse-best-card">
                <div className="reverse-best-no">1</div>
                <div className="reverse-best-main">
                  {dayBest ? (
                    <>
                      <strong>{dayBest.label}<small>{dayBest.reasons.slice(0, 2).join('・') || '吉方位'}</small></strong>
                      <p>この日の最大吉</p>
                    </>
                  ) : (
                    <>
                      <strong>該当なし</strong>
                      <p>吉のみ表示中です。凶も見ると全方位を確認できます。</p>
                    </>
                  )}
                </div>
                <div className="reverse-best-score lat">{dayBest ? `${dayBest.score > 0 ? '+' : ''}${dayBest.score}` : '-'}</div>
              </div>

              <div className="reverse-timeline">
                <div className="reverse-section-title">
                  <span className="reverse-section-kicker lat">day ranking</span>
                  <h3 className="maru">この日の方位ランキング</h3>
                </div>
                {dayVisibleRankings.map((item, index) => (
                  <div key={item.palace} className="reverse-tl-item">
                    <span className="reverse-tl-time lat">{index + 1}</span>
                    <div className="reverse-tl-main">
                      <strong>{item.label}</strong>
                      <span>{item.reasons.slice(0, 2).join('・') || '吉凶判定'}</span>
                    </div>
                    <span className={`reverse-tl-score ${item.score < 0 ? 'is-bad' : ''}`}>
                      {item.score > 0 ? '+' : ''}{item.score}
                    </span>
                  </div>
                ))}
              </div>

              <div className="reverse-card reverse-aux-card">
                <p><strong>補助</strong>：出発の瞬間は時盤の吉方位を5〜10分取ってから出発（本格作法）。出発時刻の時盤併用を出すかは先生確認事項です。</p>
              </div>
            </>
          )}
        </>
      )}

      {mode === 'ranking' && (
        <SaikyoRankingView
          location={location}
          startDate={today}
          goodOnly={goodOnly}
          onGoodOnlyChange={setGoodOnly}
          onOpenBoard={onOpenBoard}
        />
      )}

      {mode === 'kakkyoku' && (
        <KakkyokuSearchView
          location={location}
          startDate={today}
          correctionLabel={`${location.name} ${formatCorrection(correction)}`}
          onOpenBoard={onOpenBoard}
        />
      )}

      {mode === 'range' && (
        <div className="reverse-card sanban-route-card">
          <SanbanRouteView
            location={location}
            startDate={today}
            correctionMinutes={correction}
            correctionLabel={`${location.name} ${formatCorrection(correction)}`}
            onSelectRoute={(route) => {
              onOpenBoard({ date: route.date, hour: route.slots[0].hour, boardType: '時' });
            }}
          />
        </div>
      )}
    </section>
  );
}
