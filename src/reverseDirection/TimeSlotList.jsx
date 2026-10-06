import React, { useState } from 'react';
import Ja from '../utils/Ja.jsx';
import { ELEMENT_TEXTS } from '../kimon/elementTexts.generated.js';
import { BADGE_LABEL } from './FusionCard.jsx';
import { getMiniBoardToneClass, getScoreTone } from './reverseDirection.js';

// 「今日の時間帯から探す」の一覧。いつ・どっちへ行くかを決める画面。
//   時間帯を比べる → 開く → その時間の8方位を比べる → 方位を選ぶ → 地図で行き先を探す
// 点数・吉凶・八門・八神は、渡された結果（buildTimeline）をそのまま出す。ここでは計算しない。
//
// 「その時間で一番良い方位（BEST＝アプリの評価。王冠）」と
// 「いま選んでいる方位（SELECTED＝利用者の選択。金の枠）」は別のものとして扱う。

const LAYOUT = [
  ['ken', 'kan', 'gon'],
  ['da', null, 'shin'],
  ['kun', 'ri', 'son'],
];

const scoreText = (score) => `${score > 0 ? '+' : ''}${score}`;
const gateGod = (item) => [item?.palaceData?.hachimon, item?.palaceData?.hasshin].filter(Boolean).join('・');
const badgeOf = (item) => BADGE_LABEL[getMiniBoardToneClass(item.score, item.palaceScore)] || '';

/** 八門の説明（「物事の入口を開く門。新しい開始や公の手続きに向く。」）を、名前と使い道に分ける */
export function gateSummary(gate) {
  const text = ELEMENT_TEXTS.gates?.[gate] || '';
  const [label = '', use = ''] = text.split('。');
  return { label, use: use.replace(/に向く$/u, '') };
}

/** 選んだ方位の短い説明と、用途のタグ（詳しい理由は盤の詳細に任せる） */
export function directionSummary(item) {
  const { label, use } = gateSummary(item?.palaceData?.hachimon);
  const vetoes = item?.vetoes || [];
  const lines = [];
  if (item.score > 0) {
    if (label) lines.push(`${label}が入る方位です。`);
    if (use) lines.push(`${use}に向きます。`);
  } else if (item.score === 0) {
    lines.push('この時間は、吉とも凶とも言えない方位です。');
  } else {
    lines.push('この時間は、避けたい方位です。');
  }
  if (vetoes.length > 0) lines.push(`注意条件あり（${vetoes.join('・')}）。点数だけで決めず、盤の詳細で確かめてください。`);
  return { lines, tags: item.score > 0 && use ? use.split('・') : [] };
}

function Crown() {
  return (
    <svg className="tsl-crown" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.8 10H4.8z" />
    </svg>
  );
}

function SlotDetail({ slot, onGoMap, onOpenBoard }) {
  const byPalace = new Map(slot.rankings.map((item) => [item.palace, item]));
  const bestPalace = slot.rankings[0]?.palace;
  const [selected, setSelected] = useState(slot.best?.palace || bestPalace);
  const item = byPalace.get(selected) || slot.rankings[0];
  const summary = directionSummary(item);
  const isBest = item.palace === bestPalace;

  return (
    <div className="tsl-detail">
      <div className="tsl-picked">
        <p className={`tsl-picked-kicker${isBest ? ' is-best' : ''}`}>
          {isBest ? <><Crown />この時間の最良方位</> : '選んでいる方位'}
        </p>
        <p className="tsl-picked-main">
          <strong>{item.label}</strong>
          <span className={`tsl-picked-score lat ${item.score < 0 ? 'is-bad' : ''}`}>{scoreText(item.score)}</span>
          {badgeOf(item) && <span className={`tsl-badge is-${getMiniBoardToneClass(item.score, item.palaceScore)}`}>{badgeOf(item)}</span>}
        </p>
        <p className="tsl-picked-elements">{gateGod(item) || '—'}</p>
      </div>

      <div className="tsl-grid-wrap">
        <p className="tsl-grid-title">この時間の8方位の評価</p>
        <div className="tsl-grid" role="group" aria-label="8方位から選ぶ">
          {LAYOUT.flat().map((palace) => {
            if (!palace) return <div key="center" className="tsl-cell is-center">基準点</div>;
            const cell = byPalace.get(palace);
            return (
              <button
                key={palace}
                type="button"
                className={`tsl-cell is-${getScoreTone(cell.score, cell.palaceScore)}${palace === selected ? ' is-selected' : ''}`}
                aria-pressed={palace === selected}
                aria-label={`${cell.label} ${scoreText(cell.score)}点 ${cell.palaceData?.hachimon || ''}${palace === bestPalace ? '（最良）' : ''}`}
                onClick={() => setSelected(palace)}
              >
                {palace === bestPalace && <Crown />}
                <span className="tsl-cell-dir">{cell.label}</span>
                <strong className="tsl-cell-score lat">{scoreText(cell.score)}</strong>
                <span className="tsl-cell-gate">{cell.palaceData?.hachimon || '—'}</span>
              </button>
            );
          })}
        </div>
        <p className="tsl-legend">青は吉方位、赤は凶方位です。数字が大きいほど良い方位です。</p>
      </div>

      <div className="tsl-summary">
        {summary.lines.map((line) => <p key={line}><Ja>{line}</Ja></p>)}
        {summary.tags.length > 0 && (
          <div className="tsl-tags">
            {summary.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        )}
      </div>

      <div className="tsl-actions">
        <button type="button" className="tsl-cta" onClick={() => onGoMap({ hour: slot.hour, palace: item.palace })}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 12 3.5 6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>
          <span>{item.label}の場所を地図で探す</span>
          <b aria-hidden="true">→</b>
        </button>
        <button type="button" className="tsl-sub-cta" onClick={() => onOpenBoard(slot.hour)}>
          盤の詳細を見る <span aria-hidden="true">↗</span>
        </button>
      </div>
    </div>
  );
}

export default function TimeSlotList({ timeline, nowHour, onGoMap, onOpenBoard }) {
  const [openHour, setOpenHour] = useState(null);
  const scores = timeline.map((slot) => slot.best?.score).filter((score) => typeof score === 'number');
  const topScore = scores.length > 0 ? Math.max(...scores) : null;

  return (
    <div className="tsl" aria-label="時間帯ごとの吉方位">
      {timeline.map((slot) => {
        const isOpen = openHour === slot.hour;
        const best = slot.best;
        const isTop = best && topScore !== null && best.score === topScore && topScore > 0;
        return (
          <div key={slot.hour} className={`tsl-block${isOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className={`tsl-row${slot.hour === nowHour ? ' is-now' : ''}`}
              aria-expanded={isOpen}
              onClick={() => setOpenHour((current) => (current === slot.hour ? null : slot.hour))}
            >
              <span className="tsl-time lat">
                {slot.label}
                {slot.hour === nowHour && <small>いま</small>}
              </span>
              <span className="tsl-main">
                <strong>{best?.label || '該当なし'}</strong>
                <span>{best ? gateGod(best) : '吉の方位がありません'}</span>
              </span>
              <span className={`tsl-score lat ${(best?.score || 0) < 0 ? 'is-bad' : ''}${best ? '' : ' is-none'}`}>{best ? scoreText(best.score) : '—'}</span>
              {best && (isTop
                ? <span className="tsl-badge is-top"><Crown />今日の最高</span>
                : badgeOf(best) && <span className={`tsl-badge is-${getMiniBoardToneClass(best.score, best.palaceScore)}`}>{badgeOf(best)}</span>)}
              <span className="tsl-chevron" aria-hidden="true">{isOpen ? '⌃' : '›'}</span>
            </button>
            {isOpen && <SlotDetail slot={slot} onGoMap={onGoMap} onOpenBoard={onOpenBoard} />}
          </div>
        );
      })}
    </div>
  );
}
