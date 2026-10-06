import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KAKKYOKU_USES,
  SPECIAL_KAKKYOKU_GROUPS,
  SPECIAL_KAKKYOKU_NAMES,
  scanSpecialKakkyoku,
} from './kakkyokuSearch.js';
import MiniBoardGrid from './MiniBoardGrid.jsx';
import { buildDayReverseBoard, buildReverseBoard, DAY_BOARD_TYPE, TIME_BOARD_TYPE } from './reverseDirection.js';

// 調べる盤。時盤は1日に12盤あるので期間は短め、日盤は1日1盤なので長い期間を選べる。
const BOARD_TYPES = [
  { key: TIME_BOARD_TYPE, label: '時盤', note: '近場・今日からの外出に' },
  { key: DAY_BOARD_TYPE, label: '日盤', note: '遠出・旅行の日取りに' },
];

const PERIODS_BY_BOARD = {
  [TIME_BOARD_TYPE]: [
    { key: 'week', label: '7日', days: 7 },
    { key: 'half', label: '14日', days: 14 },
    { key: 'month', label: '30日', days: 30 },
  ],
  [DAY_BOARD_TYPE]: [
    { key: 'month', label: '1ヶ月', days: 31 },
    { key: 'q', label: '3ヶ月', days: 92 },
    { key: 'half', label: '半年', days: 183 },
    { key: 'year', label: '1年', days: 365 },
  ],
};

function weekdayClass(weekday) {
  if (weekday === '土') return 'is-sat';
  if (weekday === '日') return 'is-sun';
  return '';
}

function KakkyokuResultCard({ item, isFeatured, isOpen, onToggle, onOpenBoard }) {
  const isDay = item.boardType === DAY_BOARD_TYPE;
  let rankings = [];
  if (isOpen) {
    rankings = isDay
      ? buildDayReverseBoard({ date: item.date }).rankings
      : buildReverseBoard({ date: item.date, hour: item.hour }).rankings;
  }
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
            onClick={() => onOpenBoard(isDay
              ? { date: item.date, boardType: DAY_BOARD_TYPE }
              : { date: item.date, hour: item.hour, boardType: TIME_BOARD_TYPE })}
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
  const [boardType, setBoardType] = useState(TIME_BOARD_TYPE);
  const [periodKey, setPeriodKey] = useState('month');
  const [sortMode, setSortMode] = useState('date');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchParams, setSearchParams] = useState(null);
  const [openResultKey, setOpenResultKey] = useState(null);
  // やりたいことから選んだとき、その用事（KAKKYOKU_USES の key）。格局を自分で選び直したら外す。
  const [useKey, setUseKey] = useState(null);
  const activeUse = KAKKYOKU_USES.find((item) => item.key === useKey) || null;
  // やりたいことを押したら、結果のところまで画面を送る（間に格局の一覧と検索ボタンがあって、結果が見えないため）。
  const resultRef = useRef(null);
  const [scrollToResult, setScrollToResult] = useState(0);
  useEffect(() => {
    if (scrollToResult > 0) resultRef.current?.scrollIntoView?.({ block: 'start' });
  }, [scrollToResult]);

  const selectedSet = useMemo(() => new Set(selectedNames), [selectedNames]);
  const periods = PERIODS_BY_BOARD[boardType];
  const period = periods.find((item) => item.key === periodKey) || periods[0];
  const changeBoardType = (next) => {
    if (next === boardType) return;
    setBoardType(next);
    setPeriodKey('month');
    // 盤を替えたら、前の盤の結果は消す（時盤の結果を日盤の結果と見間違えないように）。
    setHasSearched(false);
    setSearchParams(null);
    setOpenResultKey(null);
  };
  // やりたいことを押すと、向く格局を選んで、そのまま検索する。
  const pickUse = (use) => {
    setUseKey(use.key);
    setSelectedNames(use.names);
    setOpenResultKey(null);
    setHasSearched(true);
    setSearchParams({ days: period.days, selectedNames: use.names, boardType });
    setScrollToResult((count) => count + 1);
  };
  const selectedCount = selectedNames.length;

  const result = useMemo(() => {
    if (!searchParams) return { rows: [], errors: [] };
    return scanSpecialKakkyoku({
      startDate,
      days: searchParams.days,
      selectedNames: searchParams.selectedNames,
      sortMode,
      boardType: searchParams.boardType,
    });
  }, [searchParams, sortMode, startDate]);
  const maxResultScore = useMemo(() => (
    result.rows.length > 0 ? Math.max(...result.rows.map((item) => item.score)) : null
  ), [result.rows]);

  const toggleName = (name) => {
    setUseKey(null);
    setSelectedNames((current) => (
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    ));
  };

  const selectAll = () => { setUseKey(null); setSelectedNames(SPECIAL_KAKKYOKU_NAMES); };
  const clearAll = () => { setUseKey(null); setSelectedNames([]); };

  const search = () => {
    if (selectedCount === 0) return;
    setHasSearched(true);
    setSearchParams({ days: period.days, selectedNames, boardType });
  };

  return (
    <div className="kakkyoku-search-view">
      <div className="kakkyoku-hero">
        <div>
          <p>時盤・日盤</p>
          <h3>特別格局の出現検索</h3>
          <span>やりたいことに向く大吉格が、いつ・どの方位に出るかを探す</span>
        </div>
        <b>格局を探す</b>
      </div>

      <div className="kakkyoku-basis base-inline-hidden">
        <span>基準点：<strong>{location.name}</strong></span>
        <span>自然時補正：<strong>{correctionLabel}</strong></span>
      </div>

      <div className="kakkyoku-period">
        <p>調べる盤</p>
        <div role="group" aria-label="調べる盤">
          {BOARD_TYPES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={boardType === item.key ? 'is-active' : ''}
              aria-pressed={boardType === item.key}
              onClick={() => changeBoardType(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <small className="kakkyoku-board-note">{BOARD_TYPES.find((item) => item.key === boardType)?.note}</small>
      </div>

      <div className="kakkyoku-period">
        <p>検索期間</p>
        <div>
          {periods.map((item) => (
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

      <div className="kakkyoku-picker kakkyoku-uses">
        <div className="kakkyoku-picker-head">
          <div>
            <h3>やりたいことから選ぶ</h3>
          </div>
        </div>
        <div className="kakkyoku-group">
          <div>
            {KAKKYOKU_USES.map((use) => (
              <button
                key={use.key}
                type="button"
                className={useKey === use.key ? 'is-active' : ''}
                aria-pressed={useKey === use.key}
                onClick={() => pickUse(use)}
              >
                {use.label}
              </button>
            ))}
          </div>
        </div>
        <p className="kakkyoku-use-note">
          {activeUse
            ? `「${activeUse.label}」に向く格局：${activeUse.names.join('・')}`
            : '押すと、その用事に向く格局が出る日時と方位を、すぐに探します。'}
        </p>
      </div>

      <div className="kakkyoku-picker">
        <div className="kakkyoku-picker-head">
          <div>
            <h3>格局の名前から選ぶ</h3>
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
          <div className="kakkyoku-result-head" ref={resultRef}>
            <div>
              <h3>{activeUse ? `「${activeUse.label}」に向く日時` : '検索結果'}</h3>
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
