import React, { useRef, useState } from 'react';
import { formatPeriodLabel, formatRankingDate } from './strongestRanking.js';
import {
  DEFAULT_SANBAN_THRESHOLD,
  scanSanbanRoutesAsync,
} from './sanbanRoute.js';

const PERIODS = [
  { key: 'week', label: '1週間', days: 7 },
  { key: 'month', label: '1ヶ月', days: 31 },
  { key: 'q', label: '3ヶ月', days: 92 },
  { key: 'half', label: '半年', days: 183 },
  { key: 'year', label: '1年', days: 365 },
];

function scoreText(score) {
  return `${score > 0 ? '+' : ''}${score}`;
}

function SanbanRouteCard({ route, onSelectRoute }) {
  const date = formatRankingDate(route.date);
  return (
    <article className="sanban-result-card">
      <div className="sanban-result-head">
        <strong>{route.hasStar && '★ '}{date.text}（{date.weekday}）</strong>
        <b>合計{scoreText(route.totalScore)}点</b>
      </div>
      <div className="sanban-result-slots">
        {route.slots.map((slot, index) => (
          <React.Fragment key={`${slot.hour}-${slot.palace}`}>
            {index > 0 && <span className="sanban-route-arrow" aria-hidden="true">↓</span>}
            <div className="sanban-result-slot">
              <span>{slot.label}</span>
              <strong>{slot.direction}</strong>
              <b>{scoreText(slot.score)}{slot.score >= 100 && '★'}</b>
              <em>{slot.hachimon}</em>
            </div>
          </React.Fragment>
        ))}
      </div>
      <button type="button" className="sanban-route-detail" onClick={() => onSelectRoute(route)}>
        この日の盤を見る →
      </button>
    </article>
  );
}

export default function SanbanRouteView({
  location,
  startDate,
  correctionMinutes,
  correctionLabel,
  onSelectRoute,
}) {
  const [periodKey, setPeriodKey] = useState('month');
  const [threshold, setThreshold] = useState(DEFAULT_SANBAN_THRESHOLD);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const searchId = useRef(0);
  const period = PERIODS.find((item) => item.key === periodKey) || PERIODS[1];

  const search = async () => {
    const currentSearchId = searchId.current + 1;
    searchId.current = currentSearchId;
    setResult(null);
    setProgress({ current: 0, total: period.days });
    const next = await scanSanbanRoutesAsync({
      startDate,
      days: period.days,
      threshold,
      correctionMinutes,
      onProgress: (current, total) => {
        if (searchId.current === currentSearchId) setProgress({ current, total });
      },
    });
    if (searchId.current !== currentSearchId) return;
    setResult(next);
    setProgress(null);
  };

  return (
    <div className="sanban-route-view" aria-label="奇門三盤ルート">
      <div className="sanban-route-hero">
        <div>
          <p>先生流・玉の輿ツアー</p>
          <h3>奇門三盤ルート</h3>
          <span>1日に吉方位を3つ連続で巡る</span>
        </div>
        <b className="pro-badge" aria-label="プロ機能">PRO</b>
      </div>

      <div className="sanban-route-basis">
        <span>基準点：<strong>{location.name}</strong></span>
        <small>自然時補正：{correctionLabel}</small>
      </div>

      <div className="saikyo-period">
        <p>期間</p>
        <div>
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={periodKey === item.key ? 'is-active' : ''}
              onClick={() => setPeriodKey(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <label className="sanban-threshold">
        <span>足切り点数 <strong>現在: {threshold}点</strong></span>
        <input
          type="range"
          min="60"
          max="100"
          step="5"
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
        />
        <small>{threshold}点以上の方位が3連続揃う日を探す</small>
      </label>

      <button type="button" className="sanban-search-button" onClick={search} disabled={Boolean(progress)}>
        {progress ? `検索中... ${progress.current}/${progress.total}日目` : '検索する'}
      </button>

      {result && (
        <>
          <div className="sanban-result-summary">
            <strong>結果：{result.rows.length}件のルートが見つかりました</strong>
            <span>{formatPeriodLabel(result.range)}</span>
          </div>
          {result.errors.length > 0 && (
            <p className="sanban-route-error">一部の日付を計算できませんでした：{result.errors[0].message}</p>
          )}
          {result.rows.length > 0 ? (
            <div className="sanban-result-list">
              {result.rows.map((route) => (
                <SanbanRouteCard key={route.date} route={route} onSelectRoute={onSelectRoute} />
              ))}
            </div>
          ) : (
            <div className="sanban-empty">
              <strong>条件に合う日が見つかりませんでした</strong>
              <p>・足切り点数を下げてみる<br />・期間を長くしてみる</p>
              <button type="button" onClick={search}>もう一度検索</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
