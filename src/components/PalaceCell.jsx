import React from 'react';
import {
  kanTone,
  kyuseiTone,
  hasshinTone,
  hachimonTone,
  toneClass,
} from '../kimon/palaceColors.js';
import { buildInfoItems } from './palaceCellHelpers.js';

/**
 * 干文字列を1文字ずつ吉凶クラスを付けてレンダリング（複合表記対応）。
 *
 * Phase 2D-followup2 (2026-05-21): 旬首マーカーを「3カラム固定幅スロット構造」で実装。
 * 各干は [左括弧スロット 0.5em] + [干スロット 1em] + [右括弧スロット 0.5em] = 2em 固定幅。
 * 旬首該当の干は左右スロットに ( と ) を入れ、それ以外は空白。
 * 結果として、括弧の有無にかかわらず干文字の中心位置（縦の中心線）が
 * 全干で完全に一致する → 天盤と地盤が綺麗に整列する。
 *
 * @param {string} value - 干文字列（複合可: 例 "丙己" "乙庚"）
 * @param {string|null} markChar - 旬首として括弧表示する文字（このパレースの当該盤側のみセット）
 */
function renderKanText(value, markChar = null) {
  if (!value) return '－';
  return [...value].map((char, index) => {
    const isJunshu = !!markChar && char === markChar;
    const tone = toneClass(kanTone(char));
    return (
      <span
        className={`kan-slot${isJunshu ? ' is-junshu' : ''}`}
        key={`${char}-${index}`}
      >
        <span className="kan-bracket kan-bracket-l">{isJunshu ? '(' : ''}</span>
        <span className={`kan-char ${tone}`}>{char}</span>
        <span className="kan-bracket kan-bracket-r">{isJunshu ? ')' : ''}</span>
      </span>
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
export default function PalaceCell({
  label,
  element,
  data,
  score,
  isCenter,
  centerAlerts = [],
  // Phase 2D (2026-05-21): 旬首マーカー用
  junshu = null,                 // 旬首干（例 "庚"）
  isTenbanJunshuPalace = false,  // この宮が tenban_junshu_p と一致するか
  isChibanJunshuPalace = false,  // この宮が chiban_junshu_p と一致するか
}) {
  // ── 中宮 ──────────────────────────────────────────────
  if (isCenter) {
    return (
      <div className="cell cell-center">
        <div className="cell-center-body">
          {centerAlerts.length > 0 ? (
            <ul className="center-alerts">
              {centerAlerts.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
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
          <div className="kan-tenban">
            {renderKanText(data.tenban, isTenbanJunshuPalace ? junshu : null)}
          </div>
          <div className="kan-chiban">
            {renderKanText(data.chiban, isChibanJunshuPalace ? junshu : null)}
          </div>
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

      {/* ── info: 十干剋応(上) → 格局(下) の固定順 (Phase 2D 要件1) ── */}
      {(score?.detected_kakkyoku?.length > 0 || score?.detected_jukkan?.length > 0) && (
        <ul className="info-list">
          {buildInfoItems(score.detected_jukkan, score.detected_kakkyoku).map((it, i) => {
            if (it.kind === 'jukkan') {
              const cls = it.kikkyo === '〇' ? 'info-kichi'
                : it.kikkyo === '×' ? 'info-kyo' : 'info-neutral';
              return (
                <li key={`j-${i}-${it.name}`} className={`info-item ${cls}`}>
                  <span className="info-prefix">{it.kikkyo}</span>
                  <span className="info-name">{it.name}</span>
                </li>
              );
            }
            // kakkyoku
            return (
              <li
                key={`k-${i}-${it.name}`}
                className={`info-item info-${it.kichi_kyo === 'kichi' ? 'kichi' : 'kyo'}`}
              >
                <span className="info-prefix">{kakkyokuPrefix(it.kichi_kyo)}</span>
                <span className="info-name">{it.name}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
