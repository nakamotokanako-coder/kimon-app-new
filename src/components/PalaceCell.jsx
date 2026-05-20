import React from 'react';
import {
  kanTone,
  kyuseiTone,
  hasshinTone,
  hachimonTone,
  toneClass,
} from '../kimon/palaceColors.js';

/** 干文字列を1文字ずつ吉凶クラスを付けてレンダリング（複合表記対応） */
function renderKanText(value) {
  if (!value) return '－';
  return [...value].map((char, index) => {
    const cls = toneClass(kanTone(char));
    return cls ? (
      <span className={cls} key={`${char}-${index}`}>{char}</span>
    ) : (
      <React.Fragment key={`${char}-${index}`}>{char}</React.Fragment>
    );
  });
}

/** ○/×/△ のプレフィックスを返す（格局用：吉=○ 凶=×、十干剋応はそのまま渡す） */
function kakkyokuPrefix(kichi_kyo) {
  return kichi_kyo === 'kichi' ? '○' : '×';
}

/**
 * 中宮セル: 戊1文字のみ（坤宮地盤の右側から渡される）または「－」
 * 通常宮セル: 先生Excel準拠の固定レイアウト。
 *   ┌──────────────────────────────┐
 *   │ [宮名+五行]            [score]│  header
 *   │ [天盤干]      [八神 九星]     │  body row1
 *   │ [地盤干]                       │  body row2
 *   │       [八門 大ピル色付き]      │  center
 *   │ ○格局 / ×格局 / 〇剋応 ...     │  info-list
 *   └──────────────────────────────┘
 */
export default function PalaceCell({ label, element, data, score, isCenter, centerKan }) {
  // ── 中宮 ──────────────────────────────────────────────
  if (isCenter) {
    return (
      <div className="cell cell-center">
        <div className="cell-center-body">
          {centerKan ? (
            <span className={`center-kan ${toneClass(kanTone(centerKan))}`}>
              {centerKan}
            </span>
          ) : (
            <span className="cell-empty">－</span>
          )}
        </div>
      </div>
    );
  }

  // ── 通常宮 ────────────────────────────────────────────
  if (!data) {
    return (
      <div className="cell">
        <div className="cell-empty">－</div>
      </div>
    );
  }

  const hasKyo = score?.detected_kakkyoku?.some((k) => k.kichi_kyo === 'kyo');
  const scoreTone = score?.score >= 40
    ? 'score-positive'
    : score?.score >= 0
      ? 'score-neutral'
      : 'score-negative';

  const cellClass = [
    'cell',
    score?.usable ? 'cell-usable' : '',
    hasKyo ? 'cell-has-kyo' : '',
  ].filter(Boolean).join(' ');

  const monClass = `mon-pill ${toneClass(hachimonTone(data.hachimon))}`;

  return (
    <div className={cellClass}>
      {/* ── header: 宮名 + 五行(薄く) + スコア ── */}
      <div className="cell-header">
        <span className="palace-label">{label}</span>
        {element && <span className="palace-element">{element}</span>}
        {score && <span className={`score-badge ${scoreTone}`}>{score.score}</span>}
      </div>

      {/* ── body row 1: 天盤干(左) / 八神 + 九星(右) ── */}
      <div className="cell-row-top">
        <div className="kan-stack">
          <div className="kan-tenban">{renderKanText(data.tenban)}</div>
          <div className="kan-chiban">{renderKanText(data.chiban)}</div>
        </div>
        <div className="cell-meta-right">
          {data.hasshin && (
            <span className={`hasshin ${toneClass(hasshinTone(data.hasshin))}`}>
              {data.hasshin}
            </span>
          )}
          {data.kyusei && (
            <span className={`kyusei ${toneClass(kyuseiTone(data.kyusei))}`}>
              {data.kyusei}
            </span>
          )}
        </div>
      </div>

      {/* ── center: 八門 大ピル ── */}
      <div className="cell-mon-row">
        {data.hachimon && (
          <span className={monClass}>{data.hachimon}</span>
        )}
      </div>

      {/* ── info: 格局 + 十干剋応 リスト ── */}
      {(score?.detected_kakkyoku?.length > 0 || score?.detected_jukkan?.length > 0) && (
        <ul className="info-list">
          {score.detected_kakkyoku?.map((k, i) => (
            <li
              key={`k-${i}-${k.name}`}
              className={`info-item info-${k.kichi_kyo === 'kichi' ? 'kichi' : 'kyo'}`}
            >
              <span className="info-prefix">{kakkyokuPrefix(k.kichi_kyo)}</span>
              <span className="info-name">{k.name}</span>
            </li>
          ))}
          {score.detected_jukkan?.map((j, i) => {
            const cls = j.kikkyo === '〇' ? 'info-kichi'
              : j.kikkyo === '×' ? 'info-kyo' : 'info-neutral';
            return (
              <li key={`j-${i}-${j.name}`} className={`info-item ${cls}`}>
                <span className="info-prefix">{j.kikkyo}</span>
                <span className="info-name">{j.name}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
