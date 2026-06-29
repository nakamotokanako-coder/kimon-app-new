import React, { useMemo, useState } from 'react';
import {
  SPECIAL_KAKKYOKU_GROUPS,
  SPECIAL_KAKKYOKU_NAMES,
  scanSpecialKakkyoku,
} from './kakkyokuSearch.js';
import MiniBoardGrid from './MiniBoardGrid.jsx';
import { buildReverseBoard } from './reverseDirection.js';

const PERIODS = [
  { key: 'week', label: '7日', days: 7 },
  { key: 'half', label: '14日', days: 14 },
  { key: 'month', label: '30日', days: 30 },
];

function weekdayClass(weekday) {
  if (weekday === '土') return 'is-sat';
  if (weekday === '日') return 'is-sun';
  return '';
}

function KakkyokuResultCard({ item, isFeatured, isOpen, onToggle, onOpenBoard }) {
  const rankings = isOpen ? buildReverseBoard({ date: item.date, hour: item.hour }).rankings : [];
  return (
    <div className="kakkyoku-result-wrap">
      <button
        type="button"
        className={`kakkyoku-result-card${isFeatured ? ' is-featured' : ''}`}
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="kakkyoku-result-dir">
          <strong>{item.label}</strong>
          <small>{item.short}</small>
        </span>
        <span className="kakkyoku-result-main">
          <span className="kakkyoku-result-date">
            {item.text}<small className={weekdayClass(item.weekday)}>({item.weekday})</small>
            <b>{item.timeLabel}</b>
          </span>
          <span className="kakkyoku-badges">
            {item.matches.map((name) => (
              <em key={name}>{name}</em>
            ))}
            {item.hachimon && <i>{item.hachimon}</i>}
          </span>
          {item.practicals.length > 0 && (
            <span className="kakkyoku-practical">
              {item.practicals.map((entry) => `${entry.name}: ${entry.text}`).join(' / ')}
            </span>
          )}
        </span>
        <span className={`kakkyoku-result-score ${item.score < 0 ? 'is-bad' : ''}`}>
          {item.scoreText}
          <small>点</small>
        </span>
      </button>
      {isOpen && (
        <div className="reverse-list-panel">
          <MiniBoardGrid rankings={rankings} />
          <button
            type="button"
            className="reverse-full-board-button"
            onClick={() => onOpenBoard({ date: item.date, hour: item.hour, boardType: '時' })}
          >
            フル盤を見る
          </button>
        </div>
      )}
    </div>
  );
}

export default function KakkyokuSearchView({
  location,
  startDate,
  correctionLabel,
  onOpenBoard,
}) {
  const [selectedNames, setSelectedNames] = useState(['青龍返首', '飛鳥跌穴']);
  const [periodKey, setPeriodKey] = useState('month');
  const [sortMode, setSortMode] = useState('date');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchParams, setSearchParams] = useState(null);
  const [openResultKey, setOpenResultKey] = useState(null);

  const selectedSet = useMemo(() => new Set(selectedNames), [selectedNames]);
  const period = PERIODS.find((item) => item.key === periodKey) || PERIODS[2];
  const selectedCount = selectedNames.length;

  const result = useMemo(() => {
    if (!searchParams) return { rows: [], errors: [] };
    return scanSpecialKakkyoku({
      startDate,
      days: searchParams.days,
      selectedNames: searchParams.selectedNames,
      sortMode,
    });
  }, [searchParams, sortMode, startDate]);
  const maxResultScore = useMemo(() => (
    result.rows.length > 0 ? Math.max(...result.rows.map((item) => item.score)) : null
  ), [result.rows]);

  const toggleName = (name) => {
    setSelectedNames((current) => (
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    ));
  };

  const selectAll = () => setSelectedNames(SPECIAL_KAKKYOKU_NAMES);
  const clearAll = () => setSelectedNames([]);

  const search = () => {
    if (selectedCount === 0) return;
    setHasSearched(true);
    setSearchParams({ days: period.days, selectedNames });
  };

  return (
    <div className="kakkyoku-search-view">
      <div className="kakkyoku-hero">
        <div>
          <span className="reverse-section-kicker lat">special pattern</span>
          <p>時盤専用</p>
          <h3>特別格局の出現検索</h3>
          <span>狙った大吉格が、いつ・どの方位に出るかを探す</span>
        </div>
        <b>格局を探す</b>
      </div>

      <div className="kakkyoku-basis base-inline-hidden">
        <span>基準点：<strong>{location.name}</strong></span>
        <span>自然時補正：<strong>{correctionLabel}</strong></span>
      </div>

      <div className="kakkyoku-period">
        <p>検索期間</p>
        <div>
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${periodKey === item.key ? 'is-active ' : ''}lat`}
              onClick={() => setPeriodKey(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="kakkyoku-picker">
        <div className="kakkyoku-picker-head">
          <div>
            <span className="reverse-section-kicker lat">patterns</span>
            <h3>格局</h3>
            <span>{selectedCount}件選択中</span>
          </div>
          <div>
            <button type="button" onClick={selectAll}>すべて選択</button>
            <button type="button" onClick={clearAll}>クリア</button>
          </div>
        </div>

        {SPECIAL_KAKKYOKU_GROUPS.map((group) => (
          <div key={group.group} className="kakkyoku-group">
            <p>{group.group}</p>
            <div>
              {group.items.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={selectedSet.has(name) ? 'is-active' : ''}
                  onClick={() => toggleName(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="kakkyoku-search-button"
        disabled={selectedCount === 0}
        onClick={search}
      >
        {selectedCount === 0 ? '格局を選んでください' : `この${selectedCount}件が出る日時を検索`}
      </button>

      {hasSearched && (
        <>
          <div className="kakkyoku-result-head">
            <div>
              <span className="reverse-section-kicker lat">results</span>
              <h3>検索結果</h3>
              <span>{result.rows.length}件</span>
            </div>
            <div className="kakkyoku-sort-toggle" role="group" aria-label="検索結果の並び順">
              <button
                type="button"
                className={sortMode === 'date' ? 'is-active' : ''}
                onClick={() => setSortMode('date')}
              >
                日付が早い順
              </button>
              <button
                type="button"
                className={sortMode === 'score' ? 'is-active' : ''}
                onClick={() => setSortMode('score')}
              >
                スコアが高い順
              </button>
            </div>
          </div>

          {result.errors.length > 0 && result.rows.length === 0 && (
            <div className="reverse-card reverse-placeholder">
              <h3>この期間は検索できません</h3>
              <p>{result.errors[0].message}</p>
            </div>
          )}

          {result.rows.length === 0 && result.errors.length === 0 && (
            <div className="reverse-card reverse-placeholder">
              <h3>該当なし</h3>
              <p>選んだ格局は、この期間内に使える方位として出現しませんでした。期間や格局を変えてみてください。</p>
            </div>
          )}

          <div className="kakkyoku-result-list">
            {result.rows.map((item) => {
              const key = `${item.date}-${item.hour}-${item.palace}-${item.matches.join('-')}`;
              return (
              <KakkyokuResultCard
                key={key}
                item={item}
                isFeatured={maxResultScore !== null && item.score === maxResultScore}
                isOpen={openResultKey === key}
                onToggle={() => setOpenResultKey((current) => (current === key ? null : key))}
                onOpenBoard={onOpenBoard}
              />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
