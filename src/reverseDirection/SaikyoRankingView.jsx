import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildMonthlyBest,
  buildDayCandidates,
  formatDateForOrigin,
  formatPeriodLabel,
  scanStrongestRanking,
  sortRanking,
} from './strongestRanking.js';
import { PALACE_DIRECTIONS, getMiniBoardToneClass } from './reverseDirection.js';
import { BADGE_LABEL } from './FusionCard.jsx';
import { directionSummary } from './TimeSlotList.jsx';
import MiniBoardGrid from './MiniBoardGrid.jsx';
import Ja from '../utils/Ja.jsx';

// 「吉日・吉方位を探す」（内部の機能名は日盤ランキング）。
//   期間を決める → 方位を決める → 候補を比べる → 一番良い日・方位を選ぶ → その日のその方位を地図で探す
// 日盤・点数・並び順・凶要素の判定は strongestRanking.js のまま。ここは見せ方と操作だけ。

export const PERIODS = [
  { key: 'week', label: '1週間', days: 7, long: false },
  { key: 'month', label: '1ヶ月', days: 31, long: false },
  { key: 'q', label: '3ヶ月', days: 92, long: true },
  { key: 'half', label: '半年', days: 183, long: true },
  { key: 'year', label: '1年', days: 365, long: true },
];

// 方位の選び方。盤と同じ並び（北を上・中央は全方位）。
const DIRECTION_GRID = [
  ['ken', 'kan', 'gon'],
  ['da', null, 'shin'],
  ['kun', 'ri', 'son'],
];
const DIRECTION_BY_PALACE = Object.fromEntries(PALACE_DIRECTIONS.map((d) => [d.palace, d]));

const scoreText = (score) => `${score > 0 ? '+' : ''}${score}`;
const slash = (date) => String(date).replaceAll('-', '/');
const badgeOf = (item) => BADGE_LABEL[getMiniBoardToneClass(item.score, item.palaceScore)] || '';

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

function DateText({ item, startDate }) {
  const dateLabel = formatDateForOrigin(item.date, startDate);
  return (
    <span className="saikyo-date lat">
      {dateLabel.displayText}
      <small className={weekdayClass(item.weekday)}>({item.weekday})</small>
    </span>
  );
}

/** 開いたときの中身: その日の8方位と、盤・地図への入口 */
function RankingDetail({ item, onOpenBoard, onGoMap, showMapButton }) {
  const rankings = sortRanking(buildDayCandidates(item.date));
  return (
    <div className="reverse-list-panel">
      <MiniBoardGrid rankings={rankings} />
      {showMapButton && onGoMap && (
        <button type="button" className="saikyo-cta" onClick={() => onGoMap({ date: item.date, palace: item.palace })}>
          この日・{item.label}の場所を探す <span aria-hidden="true">→</span>
        </button>
      )}
      <button
        type="button"
        className="reverse-full-board-button"
        onClick={() => onOpenBoard({ date: item.date, boardType: '日' })}
      >
        フル盤を見る
      </button>
    </div>
  );
}

/** 1位だけの大きなカード */
function BestCard({ item, startDate, isOpen, onToggle, onOpenBoard, onGoMap }) {
  const summary = directionSummary(item);
  return (
    <div className="saikyo-best">
      <p className="saikyo-best-label">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.8 10H4.8z" /></svg>
        期間のベスト
      </p>
      <div className="saikyo-best-head">
        <span className="saikyo-rank is-first"><strong>1</strong><small>位</small></span>
        <div className="saikyo-best-main">
          <p className="saikyo-best-dir">
            <strong>{item.label}</strong>
            <DateText item={item} startDate={startDate} />
          </p>
          <RankingBadges item={item} />
        </div>
        <div className="saikyo-best-score">
          <b className={`lat ${item.score < 0 ? 'is-bad' : ''}`}>{scoreText(item.score)}<small>点</small></b>
          {badgeOf(item) && <span className={`saikyo-tone is-${getMiniBoardToneClass(item.score, item.palaceScore)}`}>{badgeOf(item)}</span>}
        </div>
      </div>

      <div className="saikyo-best-text">
        {summary.lines.map((line) => <p key={line}><Ja>{line}</Ja></p>)}
        {summary.tags.length > 0 && (
          <div className="saikyo-tags">{summary.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        )}
      </div>

      {item.hasBad && (
        <p className="saikyo-warn">
          <Ja>凶要素あり：点数は高くても、使うかどうかの判断に影響する条件があります。「詳しい内容を見る」で確かめてください。</Ja>
        </p>
      )}

      <div className="saikyo-best-actions">
        {onGoMap && (
          <button type="button" className="saikyo-cta" onClick={() => onGoMap({ date: item.date, palace: item.palace })}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 12 3.5 6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>
            この日・{item.label}の場所を探す <span aria-hidden="true">→</span>
          </button>
        )}
        <button type="button" className="saikyo-sub-cta" aria-expanded={isOpen} onClick={onToggle}>
          {isOpen ? '詳しい内容を閉じる' : '詳しい内容を見る'}
        </button>
      </div>
      {isOpen && <RankingDetail item={item} onOpenBoard={onOpenBoard} />}
    </div>
  );
}

/** 2位以下: 比べやすい小さな行 */
function RankingRow({ item, rank, startDate, isOpen, onToggle, onOpenBoard, onGoMap }) {
  return (
    <div className="saikyo-card-wrap">
      <button
        type="button"
        className={`saikyo-card ${rank === 2 ? 'is-top2' : ''} ${rank === 3 ? 'is-top3' : ''}`}
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="saikyo-rank">
          <strong>{rank}</strong>
          <small>位</small>
        </span>
        <span className="saikyo-main">
          <span className="saikyo-row">
            <strong>{item.label}</strong>
            <DateText item={item} startDate={startDate} />
          </span>
          <RankingBadges item={item} />
        </span>
        <span className={`saikyo-score ${item.score < 0 ? 'is-bad' : ''}`}>
          {scoreText(item.score)}
          <small>点</small>
        </span>
      </button>
      {isOpen && <RankingDetail item={item} onOpenBoard={onOpenBoard} onGoMap={onGoMap} showMapButton />}
    </div>
  );
}

/** 年額プラン限定の期間を押したときの案内（下から出るシート） */
function UpgradeSheet({ onClose, onUpgrade }) {
  return createPortal(
    <>
      <div className="l3-overlay open" aria-hidden="true" onClick={onClose} />
      <section className="l3-sheet open saikyo-upgrade" role="dialog" aria-modal="true" aria-label="年額プランの案内">
        <div className="l3-top">
          <div className="l3-handle" aria-hidden="true" onClick={onClose} />
          <button type="button" className="l3-close" aria-label="閉じる" onClick={onClose}><span aria-hidden="true">×</span></button>
        </div>
        <div className="l3-content">
          <h3>もっと先の吉日まで探す</h3>
          <p><Ja>年額プランでは、最大1年先まで吉日・吉方位を検索できます。</Ja></p>
          <p><Ja>旅行、引越し、開業、大切な予定など、先の予定から吉を選びたいときに。</Ja></p>
          <button type="button" className="saikyo-cta" onClick={onUpgrade}>年額プランで1年検索を使う</button>
          <button type="button" className="saikyo-sub-cta" onClick={onClose}>今は1ヶ月で探す</button>
        </div>
      </section>
    </>,
    document.body,
  );
}

export default function SaikyoRankingView({
  startDate,
  goodOnly,
  onGoodOnlyChange,
  onOpenBoard,
  onGoMap,                 // { date, palace } → その日・その方位のまま地図（日盤）へ
  longRangeLocked = false, // true: 3ヶ月以上は年額プラン限定（閉じた鍵で見せ、押すと案内を出す）
  annualMark = false,      // true: 鍵をかけていなくても「年額」の印（開いた鍵）を出す。押せば普通に使える
  onUpgrade,
}) {
  const [periodKey, setPeriodKey] = useState('month');
  const [palace, setPalace] = useState(null); // null = 全方位
  const [visibleCount, setVisibleCount] = useState(10);
  const [openDate, setOpenDate] = useState(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const period = PERIODS.find((item) => item.key === periodKey) || PERIODS[1];
  const direction = palace ? DIRECTION_BY_PALACE[palace] : null;
  const directionLabel = direction ? direction.label : '全方位';

  const result = useMemo(() => (
    scanStrongestRanking({ startDate, days: period.days, goodOnly, directionPalace: palace })
  ), [palace, goodOnly, period.days, startDate]);

  const visibleRows = result.rows.slice(0, visibleCount);
  const monthly = useMemo(() => buildMonthlyBest(result.rows), [result.rows]);
  const periodLabel = formatPeriodLabel(result.range);
  // 調べた候補の数: 1日ごとに、全方位なら8方位、方位を選んでいれば1方位を比べている。
  const candidateCount = result.range.days * (palace ? 1 : PALACE_DIRECTIONS.length);

  const handlePeriodChange = (item) => {
    if (item.long && longRangeLocked) {
      setUpgradeOpen(true); // 検索結果は変えない
      return;
    }
    setPeriodKey(item.key);
    setVisibleCount(10);
  };
  const handlePalaceChange = (next) => {
    setPalace(next);
    setVisibleCount(10);
  };
  const toggle = (date) => setOpenDate((current) => (current === date ? null : date));

  return (
    <div className="saikyo-view">
      <div className="saikyo-field">
        <p className="saikyo-field-label">方位</p>
        <div className="saikyo-dir-grid" role="group" aria-label="方位を選ぶ">
          {DIRECTION_GRID.flat().map((key) => {
            const active = (key || null) === palace;
            return (
              <button
                key={key || 'all'}
                type="button"
                className={active ? 'is-active' : ''}
                aria-pressed={active}
                onClick={() => handlePalaceChange(key || null)}
              >
                {key ? DIRECTION_BY_PALACE[key].label : '全方位'}
              </button>
            );
          })}
        </div>
        <p className="saikyo-hint"><Ja>行きたい方位を選ぶと、その方位の吉日を探します。全方位なら、8方位すべてから探します。</Ja></p>
      </div>

      <div className="saikyo-field">
        <p className="saikyo-field-label">期間</p>
        <div className="saikyo-segment" role="group" aria-label="期間を選ぶ">
          {PERIODS.map((item) => {
            const locked = item.long && longRangeLocked;
            const marked = item.long && (locked || annualMark);
            return (
              <button
                key={item.key}
                type="button"
                className={`${periodKey === item.key ? 'is-active' : ''}${locked ? ' is-locked' : ''}${marked && !locked ? ' is-annual-open' : ''}`}
                aria-pressed={periodKey === item.key}
                onClick={() => handlePeriodChange(item)}
              >
                <span>{marked && <i aria-hidden="true">{locked ? '🔒' : '🔓'}</i>}{item.label}</span>
                {marked && <small>年額</small>}
              </button>
            );
          })}
        </div>
        {longRangeLocked && (
          <button type="button" className="saikyo-annual-note" onClick={() => setUpgradeOpen(true)}>
            年額プランなら、最大1年先まで吉日・吉方位を検索できます。 <span aria-hidden="true">›</span>
          </button>
        )}
        {!longRangeLocked && annualMark && (
          <p className="saikyo-annual-note is-open">
            <Ja>3ヶ月以上の検索は、年額プランの機能です。いまはベータ期間のため、どなたでもお試しいただけます。</Ja>
          </p>
        )}
      </div>

      <label className="saikyo-toggle">
        <input
          type="checkbox"
          checked={goodOnly}
          onChange={(event) => onGoodOnlyChange(event.target.checked)}
        />
        <span>吉のみ表示</span>
      </label>

      <div className="saikyo-summary" aria-label="検索条件">
        <div>
          <p className="saikyo-summary-label">検索条件</p>
          <p className="saikyo-summary-main">{directionLabel} × {period.label}</p>
          <p className="saikyo-summary-sub lat">{slash(result.range.startDate)} 〜 {slash(result.range.endDate)}（{result.range.days}日間）</p>
        </div>
        <div className="saikyo-summary-count">
          <b className="lat">{candidateCount}</b><span>件から検索</span>
          <small>（{result.range.days}日 × {palace ? 1 : PALACE_DIRECTIONS.length}方位）</small>
        </div>
      </div>

      {result.errors.length > 0 && result.rows.length === 0 && (
        <div className="reverse-card reverse-placeholder">
          <h3>この期間は表示できません</h3>
          <p>{result.errors[0].message}</p>
        </div>
      )}

      <div className="saikyo-section">
        <h3><small>検索結果</small>{direction ? `${direction.label} トップ` : '総合トップ'}</h3>
        <span>{periodLabel} / {result.rows.length}件</span>
      </div>

      {result.rows.length === 0 && result.errors.length === 0 && (
        <div className="reverse-card reverse-placeholder">
          <h3>該当なし</h3>
          <p><Ja>この条件では、吉の日が見つかりませんでした。期間や方位を変えるか、「吉のみ表示」を外してみてください。</Ja></p>
        </div>
      )}

      <div className="saikyo-list">
        {visibleRows.map((item, index) => (index === 0 ? (
          <BestCard
            key={`${item.date}-${item.palace}`}
            item={item}
            startDate={startDate}
            isOpen={openDate === item.date}
            onToggle={() => toggle(item.date)}
            onOpenBoard={onOpenBoard}
            onGoMap={onGoMap}
          />
        ) : (
          <RankingRow
            key={`${item.date}-${item.palace}`}
            item={item}
            rank={index + 1}
            startDate={startDate}
            isOpen={openDate === item.date}
            onToggle={() => toggle(item.date)}
            onOpenBoard={onOpenBoard}
            onGoMap={onGoMap}
          />
        )))}
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
              <button key={item.monthKey} type="button" onClick={() => onOpenBoard({ date: item.date, boardType: '日' })}>
                <strong>{formatDateForOrigin(item.date, startDate).monthDisplay}</strong>
                <span>{item.label}</span>
                <small>{formatDateForOrigin(item.date, startDate).displayText}({item.weekday})</small>
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

      {upgradeOpen && (
        <UpgradeSheet
          onClose={() => setUpgradeOpen(false)}
          onUpgrade={() => { setUpgradeOpen(false); onUpgrade?.(); }}
        />
      )}
    </div>
  );
}
