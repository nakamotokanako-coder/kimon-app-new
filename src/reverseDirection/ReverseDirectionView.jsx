import React, { useMemo, useState } from 'react';
import CompassWheel from './CompassWheel.jsx';
import {
  buildReverseBoard,
  buildTimeline,
  filterGoodRankings,
  getLongitudeCorrectionMinutes,
  applyNaturalTime,
  getTimeSlotHour,
  getTimeSlotLabel,
  getPurposeNames,
} from './reverseDirection.js';

const DEFAULT_LOCATIONS = [
  { name: '東京', latitude: 35.6812, longitude: 139.7671 },
  { name: '大阪', latitude: 34.6937, longitude: 135.5023 },
  { name: '名古屋', latitude: 35.1709, longitude: 136.8815 },
  { name: '福岡', latitude: 33.5902, longitude: 130.4017 },
  { name: '札幌', latitude: 43.0618, longitude: 141.3545 },
];

function getTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function formatCorrection(minutes) {
  if (minutes === 0) return '±0分';
  return `${minutes > 0 ? '+' : ''}${minutes}分`;
}

export default function ReverseDirectionView() {
  const [location, setLocation] = useState(DEFAULT_LOCATIONS[0]);
  const [query, setQuery] = useState('');
  const [purpose, setPurpose] = useState('仕事');
  const [goodOnly, setGoodOnly] = useState(true);
  const [mode, setMode] = useState('time');
  const [status, setStatus] = useState('');

  const correction = getLongitudeCorrectionMinutes(location.longitude);
  const naturalNow = applyNaturalTime(new Date(), correction);
  const slotHour = getTimeSlotHour(naturalNow);
  const date = getTodayJst();

  const reverse = useMemo(() => (
    buildReverseBoard({ date, hour: slotHour, purposeName: purpose })
  ), [date, slotHour, purpose]);

  const visibleRankings = filterGoodRankings(reverse.rankings, goodOnly);
  const best = visibleRankings[0] || null;

  const timeline = useMemo(() => (
    buildTimeline({ date, purposeName: purpose, goodOnly })
  ), [date, purpose, goodOnly]);

  const useCurrentLocation = () => {
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
  };

  const searchPlace = async () => {
    const text = query.trim();
    if (!text) return;
    setStatus('場所を検索中です。');
    try {
      const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(text)}`);
      const data = await res.json();
      const first = data?.[0];
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
      setStatus('検索した場所を基準点にしました。');
    } catch {
      setStatus('場所検索に失敗しました。地域リストを使ってください。');
    }
  };

  return (
    <section className="reverse-view" aria-label="逆引き方位検索">
      <div className="reverse-header">
        <div>
          <h2>吉方位</h2>
          <p>時盤・自然時補正 {formatCorrection(correction)} / {location.name}</p>
        </div>
        <div className="reverse-time-chip">{getTimeSlotLabel(slotHour)}</div>
      </div>

      <div className="reverse-mode-tabs" aria-label="吉方位内タブ">
        <button className={mode === 'time' ? 'is-active' : ''} type="button" onClick={() => setMode('time')}>
          時盤 お散歩<small>今と本日</small>
        </button>
        <button className={mode === 'day' ? 'is-active' : ''} type="button" onClick={() => setMode('day')}>
          日盤 遠出<small>プレビュー</small>
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
          <button type="button" onClick={useCurrentLocation}>現在地</button>
          <label>
            地域
            <select
              value={location.name}
              onChange={(e) => {
                const next = DEFAULT_LOCATIONS.find((item) => item.name === e.target.value);
                if (next) setLocation(next);
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
        <div className="reverse-correction">
          <span>自然時補正：{location.name} {formatCorrection(correction)}</span>
          <span>経度 {location.longitude.toFixed(2)}</span>
        </div>
        {status && <p className="reverse-status">{status}</p>}
      </div>

      {mode === 'time' && (
        <>
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

          <div className="reverse-card reverse-filter-card">
            <div className="reverse-card-title">
              <h3>目的フィルタ</h3>
              <span>JSON叩き台</span>
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
            <label className="reverse-toggle-row">
              <span>吉のみ表示</span>
              <input
                type="checkbox"
                checked={goodOnly}
                onChange={(e) => setGoodOnly(e.target.checked)}
              />
            </label>
          </div>

          <div className="reverse-timeline">
            <h3>本日の時間帯別ベスト</h3>
            {timeline.map((slot) => (
              <div key={slot.hour} className={`reverse-tl-item ${slot.hour === slotHour ? 'is-now' : ''}`}>
                <span className="reverse-tl-time">{slot.label}</span>
                <div className="reverse-tl-main">
                  <strong>{slot.best?.label || '該当なし'}</strong>
                  <span>{slot.best?.reasons.slice(0, 2).join('・') || '凶を除外中'}</span>
                </div>
                <span className={`reverse-tl-score ${(slot.best?.score || 0) < 0 ? 'is-bad' : ''}`}>
                  {slot.best ? `${slot.best.score > 0 ? '+' : ''}${slot.best.score}` : '-'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {mode !== 'time' && (
        <div className="reverse-card reverse-placeholder">
          <h3>{mode === 'day' ? '日盤 遠出' : '期間検索'}</h3>
          <p>{mode === 'day' ? 'この段階ではプレビュー枠のみです。日盤本実装は次フェーズで行います。' : '期間検索は将来拡張タブです。'}</p>
        </div>
      )}
    </section>
  );
}
