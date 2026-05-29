import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BasePointSelector from './BasePointSelector.jsx';
import CompassWheel from './CompassWheel.jsx';
import DirectionMap from './DirectionMap.jsx';
import KakkyokuSearchView from './KakkyokuSearchView.jsx';
import MiniBoardGrid from './MiniBoardGrid.jsx';
import SaikyoRankingView from './SaikyoRankingView.jsx';
import { sortTimelineSlotsByScore } from './strongestRanking.js';
import {
  buildDayReverseBoard,
  buildReverseBoard,
  buildTimeline,
  filterGoodRankings,
  getLongitudeCorrectionMinutes,
  applyNaturalTime,
  getTimeSlotHour,
  getTimeSlotLabel,
  getPurposeNames,
} from './reverseDirection.js';
import {
  MAP_SEARCH_STORAGE_KEY,
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

function getTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function formatCorrection(minutes) {
  if (minutes === 0) return '±0分';
  return `${minutes > 0 ? '+' : ''}${minutes}分`;
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

export default function ReverseDirectionView() {
  const [location, setLocation] = useState(DEFAULT_LOCATIONS[0]);
  const [currentMode, setCurrentMode] = useState('search');
  const [selectedFavoriteId, setSelectedFavoriteId] = useState(null);
  const [favorites, setFavorites] = useState(() => readStoredFavorites());
  const [query, setQuery] = useState('');
  const [purpose, setPurpose] = useState('仕事');
  const [goodOnly, setGoodOnly] = useState(true);
  const [mode, setMode] = useState('time');
  const [dayDate, setDayDate] = useState(getTodayJst());
  const [status, setStatus] = useState('');
  const [openTimelineHour, setOpenTimelineHour] = useState(null);
  const [timelineSortMode, setTimelineSortMode] = useState('time');

  const correction = getLongitudeCorrectionMinutes(location.longitude);
  const naturalNow = applyNaturalTime(new Date(), correction);
  const slotHour = getTimeSlotHour(naturalNow);
  const date = getTodayJst();

  const reverse = useMemo(() => (
    buildReverseBoard({ date, hour: slotHour, purposeName: purpose })
  ), [date, slotHour, purpose]);

  const visibleRankings = filterGoodRankings(reverse.rankings, goodOnly);
  const best = visibleRankings[0] || null;

  const dayReverseState = useMemo(() => {
    try {
      return {
        result: buildDayReverseBoard({ date: dayDate, purposeName: purpose }),
        error: null,
      };
    } catch (error) {
      return { result: null, error: error.message };
    }
  }, [dayDate, purpose]);
  const dayReverse = dayReverseState.result;
  const dayVisibleRankings = filterGoodRankings(dayReverse?.rankings || [], goodOnly);
  const dayBest = dayVisibleRankings[0] || null;

  const timeline = useMemo(() => (
    buildTimeline({ date, purposeName: purpose, goodOnly })
  ), [date, purpose, goodOnly]);
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
      <div className="reverse-card-title">
        <h3>目的フィルタ</h3>
        <span>目的別の加点</span>
      </div>
      <div className="reverse-filter-list">
        {getPurposeNames().map((name) => (
          <button
            key={name}
            type="button"
            className={purpose === name ? 'is-active' : ''}
            onClick={() => setPurpose(name)}
          >
            {name}
          </button>
        ))}
      </div>
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

  return (
    <section className="reverse-view" aria-label="逆引き方位検索">
      <div className="reverse-header">
        <div>
          <h2>吉方位</h2>
          <p>
            {mode === 'kakkyoku'
              ? `時盤・格局検索 / ${location.name}`
              : mode === 'ranking'
              ? `日盤・最強ランキング / ${location.name}`
              : mode === 'day'
              ? `日盤・遠出 / ${location.name}`
              : `時盤・自然時補正 ${formatCorrection(correction)} / ${location.name}`}
          </p>
        </div>
        <div className="reverse-time-chip">{mode === 'day' || mode === 'ranking' ? dayDate : getTimeSlotLabel(slotHour)}</div>
      </div>

      <div className="reverse-mode-tabs" aria-label="吉方位内タブ">
        <button className={mode === 'time' ? 'is-active' : ''} type="button" onClick={() => setMode('time')}>
          時盤 お散歩<small>今と本日</small>
        </button>
        <button className={mode === 'day' ? 'is-active' : ''} type="button" onClick={() => setMode('day')}>
          日盤 遠出<small>本実装</small>
        </button>
        <button className={mode === 'ranking' ? 'is-active' : ''} type="button" onClick={() => setMode('ranking')}>
          最強ランキング<small>期間</small>
        </button>
        <button className={mode === 'kakkyoku' ? 'is-active' : ''} type="button" onClick={() => setMode('kakkyoku')}>
          格局を探す<small>時盤</small>
        </button>
        <button className={mode === 'range' ? 'is-active' : ''} type="button" onClick={() => setMode('range')}>
          期間検索<small>将来</small>
        </button>
      </div>

      <div className="reverse-card reverse-location-card">
        <div className="reverse-card-title">
          <h3>基準点</h3>
          <span>GPS / 場所検索 / 手動選択</span>
        </div>
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
        {mode === 'time' || mode === 'kakkyoku' ? (
          <div className="reverse-correction">
            <span>自然時補正：{location.name} {formatCorrection(correction)}</span>
            <span>経度 {location.longitude.toFixed(2)}</span>
          </div>
        ) : (
          <div className="reverse-correction">
            <span>日盤は自然時補正なし</span>
            <span>経度 {location.longitude.toFixed(2)}</span>
          </div>
        )}
        {status && <p className="reverse-status">{status}</p>}
      </div>

      {mode === 'time' && (
        <>
          <div className="reverse-card reverse-compass-card">
            <DirectionMap location={location} rankings={reverse.rankings} bestPalace={best?.palace} profileKey="jiban" />
          </div>

          <div className="reverse-card reverse-compass-card">
            <CompassWheel rankings={reverse.rankings} bestPalace={best?.palace} />
          </div>

          <div className="reverse-card reverse-best-card">
            <div className="reverse-best-no">1</div>
            <div className="reverse-best-main">
              {best ? (
                <>
                  <strong>{best.label}<small>{best.reasons.slice(0, 2).join('・') || '吉方位'}</small></strong>
                  <p>今の時盤で最大吉 / 目的: {purpose} +{best.purposeBonus}</p>
                </>
              ) : (
                <>
                  <strong>該当なし</strong>
                  <p>吉のみ表示中です。凶も見ると全方位を確認できます。</p>
                </>
              )}
            </div>
            <div className="reverse-best-score">{best ? `${best.score > 0 ? '+' : ''}${best.score}` : '-'}</div>
          </div>

          {filterCard}

          <div className="reverse-timeline">
            <h3>本日の時間帯別ベスト</h3>
            {displayedTimeline.map((slot) => (
              <div key={slot.hour} className="reverse-tl-block">
                <button
                  type="button"
                  className={`reverse-tl-item ${slot.hour === slotHour ? 'is-now' : ''} ${openTimelineHour === slot.hour ? 'is-expanded' : ''}`}
                  onClick={() => setOpenTimelineHour((current) => (current === slot.hour ? null : slot.hour))}
                  aria-expanded={openTimelineHour === slot.hour}
                >
                <span className="reverse-tl-time">{slot.label}</span>
                <span className="reverse-tl-main">
                  <strong>{slot.best?.label || '該当なし'}</strong>
                  <span>{slot.best?.reasons.slice(0, 2).join('・') || '凶を除外中'}</span>
                </span>
                  <span className={`reverse-tl-score ${(slot.best?.score || 0) < 0 ? 'is-bad' : ''}`}>
                    {slot.best ? `${slot.best.score > 0 ? '+' : ''}${slot.best.score}` : '-'}
                  </span>
                </button>
                {openTimelineHour === slot.hour && (
                  <div className="reverse-tl-panel">
                    <MiniBoardGrid rankings={slot.rankings} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {mode === 'day' && (
        <>
          <div className="reverse-card reverse-day-card">
            <div className="reverse-card-title">
              <h3>基準点・日付</h3>
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

              <div className="reverse-card reverse-best-card">
                <div className="reverse-best-no">1</div>
                <div className="reverse-best-main">
                  {dayBest ? (
                    <>
                      <strong>{dayBest.label}<small>{dayBest.reasons.slice(0, 2).join('・') || '吉方位'}</small></strong>
                      <p>この日の最大吉 / 目的: {purpose} +{dayBest.purposeBonus}</p>
                    </>
                  ) : (
                    <>
                      <strong>該当なし</strong>
                      <p>吉のみ表示中です。凶も見ると全方位を確認できます。</p>
                    </>
                  )}
                </div>
                <div className="reverse-best-score">{dayBest ? `${dayBest.score > 0 ? '+' : ''}${dayBest.score}` : '-'}</div>
              </div>

              <div className="reverse-timeline">
                <h3>この日の方位ランキング</h3>
                {dayVisibleRankings.map((item, index) => (
                  <div key={item.palace} className="reverse-tl-item">
                    <span className="reverse-tl-time">{index + 1}</span>
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

              {filterCard}

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
          startDate={date}
          goodOnly={goodOnly}
          onGoodOnlyChange={setGoodOnly}
          onSelectDate={(nextDate) => {
            setDayDate(nextDate);
            setMode('day');
          }}
        />
      )}

      {mode === 'kakkyoku' && (
        <KakkyokuSearchView
          location={location}
          startDate={date}
          correctionLabel={`${location.name} ${formatCorrection(correction)}`}
        />
      )}

      {mode === 'range' && (
        <div className="reverse-card reverse-placeholder">
          <h3>期間検索</h3>
          <p>期間検索は将来拡張タブです。</p>
        </div>
      )}
    </section>
  );
}
