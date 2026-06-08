import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BasePointSelector from './BasePointSelector.jsx';
import CompassWheel from './CompassWheel.jsx';
import DirectionMap from './DirectionMap.jsx';
import KakkyokuSearchView from './KakkyokuSearchView.jsx';
import LuckyOmamoriBar from './LuckyOmamoriBar.jsx';
import SanbanRouteView from './SanbanRouteView.jsx';
import MiniBoardGrid from './MiniBoardGrid.jsx';
import SaikyoRankingView from './SaikyoRankingView.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import { getBoardDate } from '../utils/boardDate.js';
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
  pickNearestAddressCandidate,
} from './mapSearch.js';

const DEFAULT_LOCATIONS = [
  { name: '東京', latitude: 35.6812, longitude: 139.7671 },
  { name: '大阪', latitude: 34.6937, longitude: 135.5023 },
  { name: '名古屋', latitude: 35.1709, longitude: 136.8815 },
  { name: '福岡', latitude: 33.5902, longitude: 130.4017 },
  { name: '札幌', latitude: 43.0618, longitude: 141.3545 },
];

const MAP_SEARCH_CHANGED_EVENT = 'kimon-map-favorites-changed';

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

export default function ReverseDirectionView({
  isActive,
  onOpenBoard,
  unreadNotificationCount = 0,
  onOpenNotifications,
}) {
  const [location, setLocation] = useState(DEFAULT_LOCATIONS[0]);
  const [currentMode, setCurrentMode] = useState('search');
  const [selectedFavoriteId, setSelectedFavoriteId] = useState(null);
  const [favorites, setFavorites] = useState(() => readStoredFavorites());
  const [query, setQuery] = useState('');
  const [goodOnly, setGoodOnly] = useState(true);
  const [mode, setMode] = useState('time');
  const [dayDate, setDayDate] = useState(getBoardDate());
  const [status, setStatus] = useState('');
  const [openTimelineHour, setOpenTimelineHour] = useState(null);
  const [timelineSortMode, setTimelineSortMode] = useState('time');
  const [goView, setGoView] = useState('map');
  const [basePointOpen, setBasePointOpen] = useState(false);
  const [currentMiniBoardOpen, setCurrentMiniBoardOpen] = useState(false);
  const [focusedFavoriteKey, setFocusedFavoriteKey] = useState('');

  const correction = getLongitudeCorrectionMinutes(location.longitude);
  const naturalNow = applyNaturalTime(new Date(), correction);
  const today = getBoardDate();
  const slotHour = getTimeSlotHour(naturalNow);
  const date = today;

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

  const timeline = useMemo(() => (
    buildTimeline({ date, goodOnly })
  ), [date, goodOnly]);
  const displayedTimeline = useMemo(() => (
    timelineSortMode === 'score' ? sortTimelineSlotsByScore(timeline) : timeline
  ), [timeline, timelineSortMode]);

  const useCurrentLocation = useCallback(() => {
    setCurrentMode('gps');
    setSelectedFavoriteId(null);
    if (!navigator.geolocation) {
      setStatus('この端末では現在地を取得できません。地域リストを使ってください。');
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
        setStatus('現在地を基準点にしました。');
      },
      () => setStatus('現在地を取得できませんでした。地域リストを使ってください。'),
      { timeout: 8000, enableHighAccuracy: false },
    );
  }, []);

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
      useCurrentLocation();
      return;
    }
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
    }
  }, [currentMode, favorites, location, selectedFavoriteId, useCurrentLocation]);

  const selectBasePointMode = (nextMode, favoriteId) => {
    if (nextMode === 'gps') {
      useCurrentLocation();
      return;
    }
    const favorite = favorites.find((item) => item.id === favoriteId);
    if (!favorite) return;
    setLocation({
      name: favoriteDisplayName(favorite),
      latitude: favorite.latitude,
      longitude: favorite.longitude,
    });
    setCurrentMode('favorite');
    setSelectedFavoriteId(favorite.id);
    setStatus(`${favoriteDisplayName(favorite)}を基準点にしました。`);
  };

  const searchPlace = async () => {
    const text = query.trim();
    if (!text) return;
    setStatus('場所を検索中です。');
    try {
      const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(text)}`);
      const data = await res.json();
      const first = pickNearestAddressCandidate(data, [location.latitude, location.longitude]);
      const coords = first?.geometry?.coordinates;
      if (!coords) {
        setStatus('候補が見つかりませんでした。');
        return;
      }
      setLocation({
        name: first.properties?.title || text,
        longitude: Number(coords[0]),
        latitude: Number(coords[1]),
      });
      setCurrentMode('search');
      setSelectedFavoriteId(null);
      setStatus('検索した場所を基準点にしました。');
    } catch {
      setStatus('場所検索に失敗しました。地域リストを使ってください。');
    }
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

  const basePointControls = (
    <>
      <div className="reverse-location-actions">
        <BasePointSelector
          currentMode={currentMode}
          currentBaseName={location.name}
          selectedFavoriteId={selectedFavoriteId}
          favorites={favorites}
          onSelectMode={selectBasePointMode}
        />
        <label>
          地域
          <select
            value={location.name}
            onChange={(e) => {
              const next = DEFAULT_LOCATIONS.find((item) => item.name === e.target.value);
              if (next) {
                setLocation(next);
                setCurrentMode('search');
                setSelectedFavoriteId(null);
              }
            }}
          >
            {DEFAULT_LOCATIONS.map((item) => (
              <option key={item.name} value={item.name}>{item.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="reverse-search-row">
        <input
          type="search"
          value={query}
          placeholder="場所検索"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" onClick={searchPlace}>検索</button>
      </div>
    </>
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
        <span>GPS / 場所検索 / 手動選択</span>
      </div>
      {basePointControls}
      {basePointMeta}
      {status && <p className="reverse-status">{status}</p>}
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
    <section className="reverse-view" aria-label="逆引き方位検索">
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
                ? `現在 ${formatCurrentClock()}`
                : mode === 'day' || mode === 'ranking'
                ? formatDisplayDate(dayDate)
                : getTimeSlotLabel(slotHour)}
            </div>
          )}
          <NotificationBell unreadCount={unreadNotificationCount} onClick={onOpenNotifications} />
        </div>
      </div>

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

      {mode !== 'time' && mode !== 'timeRanking' && basePointCard}

      {mode === 'time' && (
        <>
          <div className="reverse-zone">
            <div className="reverse-zone-title">
              <span className="reverse-section-kicker lat">now</span>
              <h3 className="maru">今の吉方位</h3>
            </div>

            <div className="reverse-card reverse-best-card">
              <div className="reverse-best-no">1</div>
              <div className="reverse-best-main">
                {best ? (
                  <>
                    <strong>{best.label}<small>{best.reasons.slice(0, 2).join('・') || '吉方位'}</small></strong>
                    <p>今の時盤で最大吉</p>
                  </>
                ) : (
                  <>
                    <strong>該当なし</strong>
                    <p>吉のみ表示中です。凶も見ると全方位を確認できます。</p>
                  </>
                )}
              </div>
              <div className="reverse-best-score lat">{best ? scoreText(best.score) : '-'}</div>
            </div>

            <div className="reverse-card reverse-compass-card">
              <CompassWheel rankings={reverse.rankings} bestPalace={best?.palace} />
            </div>

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

          <div className="reverse-zone">
            <div className="reverse-zone-title">
              <span className="reverse-section-kicker lat">go</span>
              <h3 className="maru">出かける場所を探す</h3>
            </div>

            <div className="reverse-card reverse-go-card">
              <div className="reverse-base-compact">
                <span>
                  起点 <strong>{location.name}</strong>
                  <small>自然時補正 <b className="lat">{formatCorrection(correction)}</b></small>
                </span>
                <button type="button" onClick={() => setBasePointOpen((value) => !value)}>
                  変更
                </button>
              </div>
              {basePointOpen && (
                <div className="reverse-base-panel">
                  {basePointControls}
                  {basePointMeta}
                  {status && <p className="reverse-status">{status}</p>}
                </div>
              )}

              <div className="reverse-go-tabs" role="group" aria-label="出かける場所の探し方">
                <button
                  type="button"
                  className={goView === 'map' ? 'is-active' : ''}
                  onClick={() => setGoView('map')}
                >
                  地図で探す
                </button>
                <button
                  type="button"
                  className={goView === 'favorites' ? 'is-active' : ''}
                  onClick={() => setGoView('favorites')}
                >
                  お気に入り
                </button>
              </div>

              {goView === 'favorites' && (
                <div className="reverse-favorite-chips" aria-label="お気に入り">
                  {favoriteChips.length > 0 ? favoriteChips.map((item) => {
                    const key = favoriteKey(item);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFocusedFavoriteKey(key)}
                      >
                        <strong>{favoriteDisplayName(item)}</strong>
                        <span>{item.direction?.label || '-'} <b className="lat">{scoreText(item.direction?.score || 0)}</b></span>
                        <small className="lat">{formatDistance(item.distanceM)}</small>
                      </button>
                    );
                  }) : (
                    <p>お気に入りはまだありません。地図で場所を検索して追加できます。</p>
                  )}
                </div>
              )}

              <DirectionMap
                location={location}
                rankings={reverse.rankings}
                bestPalace={best?.palace}
                profileKey="jiban"
                focusFavoriteKey={goView === 'favorites' ? focusedFavoriteKey : ''}
                showSearchControls={goView === 'map'}
                showPlacePanel={goView === 'map'}
              />
            </div>
          </div>

          <LuckyOmamoriBar
            isActive={isActive}
            bestPalace={reverse.board.score.best_overall}
            seed={timeOmamoriSeed}
          />
        </>
      )}

      {mode === 'timeRanking' && timelineSection}

      {mode === 'day' && (
        <>
          <div className="reverse-card reverse-day-card">
            <div className="reverse-card-title">
              <div>
                <span className="reverse-section-kicker lat">base point</span>
                <h3 className="maru">基準点・日付</h3>
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
              <div className="reverse-card reverse-compass-card">
                <DirectionMap
                  location={location}
                  rankings={dayReverse.rankings}
                  bestPalace={dayBest?.palace}
                  profileKey="nichiban"
                  showScale
                />
              </div>

              <div className="reverse-card reverse-compass-card">
                <CompassWheel rankings={dayReverse.rankings} bestPalace={dayBest?.palace} />
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
