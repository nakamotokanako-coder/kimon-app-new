import React, { useMemo, useState } from 'react';
import {
  buildMonthlyBest,
  scanStrongestRanking,
} from './strongestRanking.js';

const PERIODS = [
  { key: 'week', label: '今週', days: 7, long: false },
  { key: 'month', label: '今月', days: 31, long: false },
  { key: 'q', label: '3ヶ月', days: 92, long: true },
  { key: 'half', label: '半年', days: 183, long: true },
  { key: 'year', label: '1年', days: 365, long: true },
];

function scoreText(score) {
  return `${score > 0 ? '+' : ''}${score}`;
}

function weekdayClass(weekday) {
  if (weekday === '土') return 'is-sat';
  if (weekday === '日') return 'is-sun';
  return '';
}

function RankingBadges({ item }) {
  return (
    <div className="saikyo-badges">
      <span className={item.hasBad ? 'saikyo-badge is-warn' : 'saikyo-badge is-safe'}>
        {item.hasBad ? '凶要素あり' : '凶なし'}
      </span>
      {item.hachimon && <span className="saikyo-badge is-mon">{item.hachimon}</span>}
      {item.kakuName && <span className="saikyo-badge is-kaku">{item.kakuName}</span>}
    </div>
  );
}

function RankingCard({ item, index, onSelect }) {
  const rank = index + 1;
  return (
    <button
      type="button"
      className={`saikyo-card ${rank === 1 ? 'is-top1' : ''} ${rank === 2 ? 'is-top2' : ''} ${rank === 3 ? 'is-top3' : ''}`}
      onClick={() => onSelect(item.date)}
    >
      <span className="saikyo-rank">
        <strong>{rank}</strong>
        <small>位</small>
      </span>
      <span className="saikyo-main">
        <span className="saikyo-row">
          <strong>{item.label}</strong>
          <span>
            {item.text}
            <small className={weekdayClass(item.weekday)}>({item.weekday})</small>
          </span>
        </span>
        <RankingBadges item={item} />
      </span>
      <span className={`saikyo-score ${item.score < 0 ? 'is-bad' : ''}`}>
        {scoreText(item.score)}
        <small>点</small>
      </span>
    </button>
  );
}

export default function SaikyoRankingView({
  location,
  startDate,
  goodOnly,
  onGoodOnlyChange,
  onSelectDate,
}) {
  const [periodKey, setPeriodKey] = useState('month');
  const [visibleCount, setVisibleCount] = useState(10);
  const period = PERIODS.find((item) => item.key === periodKey) || PERIODS[1];

  const result = useMemo(() => (
    scanStrongestRanking({ startDate, days: period.days, goodOnly })
  ), [goodOnly, period.days, startDate]);

  const visibleRows = result.rows.slice(0, visibleCount);
  const monthly = useMemo(() => buildMonthlyBest(result.rows), [result.rows]);

  const handlePeriodChange = (key) => {
    setPeriodKey(key);
    setVisibleCount(10);
  };

  return (
    <div className="saikyo-view">
      <div className="saikyo-top">
        <div>
          <p className="saikyo-kicker">奇門遁甲</p>
          <h3>最強ランキング</h3>
          <p>指定期間で、いつ・どの方位が一番強いか</p>
        </div>
        <span>日盤 / 遠出 50km〜</span>
      </div>

      <div className="saikyo-basis">
        <span>基準点：<strong>{location.name}</strong></span>
        <label>
          <span>吉のみ表示</span>
          <input
            type="checkbox"
            checked={goodOnly}
            onChange={(event) => onGoodOnlyChange(event.target.checked)}
          />
        </label>
      </div>

      <div className="saikyo-period">
        <p>期間</p>
        <div>
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={periodKey === item.key ? 'is-active' : ''}
              onClick={() => handlePeriodChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {result.errors.length > 0 && result.rows.length === 0 && (
        <div className="reverse-card reverse-placeholder">
          <h3>この期間は表示できません</h3>
          <p>{result.errors[0].message}</p>
        </div>
      )}

      <div className="saikyo-section">
        <h3>総合トップ</h3>
        <span>{result.rows.length}件</span>
      </div>

      <div className="saikyo-list">
        {visibleRows.map((item, index) => (
          <React.Fragment key={`${item.date}-${item.palace}`}>
            {(index === 0 || visibleRows[index - 1].score !== item.score) && (
              <div className="saikyo-tie">
                <span />
                {scoreText(item.score)}点グループ
                <span />
              </div>
            )}
            <RankingCard item={item} index={index} onSelect={onSelectDate} />
          </React.Fragment>
        ))}
      </div>

      {visibleCount < Math.min(result.rows.length, 30) && (
        <button
          type="button"
          className="saikyo-more"
          onClick={() => setVisibleCount((value) => Math.min(value + 10, 30))}
        >
          もっと見る
        </button>
      )}

      {period.long && monthly.length > 0 && (
        <>
          <div className="saikyo-section">
            <h3>月別ベスト</h3>
            <span>月順</span>
          </div>
          <div className="saikyo-monthly">
            {monthly.map((item) => (
              <button key={item.monthKey} type="button" onClick={() => onSelectDate(item.date)}>
                <strong>{item.monthLabel}</strong>
                <span>{item.label}</span>
                <small>{item.text}({item.weekday})</small>
                {item.kakuName && <em>{item.kakuName}</em>}
                <b>{scoreText(item.score)}</b>
              </button>
            ))}
          </div>
        </>
      )}

      <details className="saikyo-rule">
        <summary>同点ルール <span>⌄</span></summary>
        <ol>
          <li><b>合計スコア</b>が高い順</li>
          <li><b>凶要素なし</b>を優先</li>
          <li><b>八門</b>は 休門 → 生門 → 開門 → 景門</li>
          <li><b>吉格局</b>がある方位を優先</li>
          <li><b>日付が早い</b>順</li>
        </ol>
        <p>点数は scoreEngine の出力そのままです。</p>
      </details>
    </div>
  );
}
