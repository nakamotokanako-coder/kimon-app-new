import React from 'react';
import PalaceCell from './PalaceCell.jsx';
import { isKuubouZodiac } from '../kimon/banLevel.js';

// 5×5 グリッド。中央 3×3 が宮セル、外周 12 マスに十二支ラベル、四隅は空白。
// 北を下（南が上）= 先生Excel と同じデフォルト orientation。
// south_bottom 切替時は (row, col) を (6-row, 6-col) で点対称反転。
//
// Phase 2C (2026-05-21): 先生指示で四隅宮の十二支 (辰巳/未申/丑寅/戌亥) を分解し、
// 12 十二支を外周の上下左右の辺に振り分け配置。空亡対応十二支は赤字表示。

const PALACE_FIVE_ELEMENTS = {
  '坎': '水', '艮': '土', '震': '木', '巽': '木',
  '離': '火', '坤': '土', '兌': '金', '乾': '金',
};

/**
 * 北を下（南を上）= デフォルト＝先生Excel と同じ orientation。
 * 外周 12 十二支 + 内側 9 セルの 5×5 構成。
 *
 * row1: 空,  巳, 午, 未, 空
 * row2: 辰, 巽, 離, 坤, 申
 * row3: 卯, 震, 中, 兌, 酉
 * row4: 寅, 艮, 坎, 乾, 戌
 * row5: 空, 丑, 子, 亥, 空
 */
const NB_ITEMS = [
  // ── 外周 十二支ラベル（上辺：左→右 巳・午・未） ──
  { type: 'zodiac', row: 1, col: 2, zodiac: '巳' },
  { type: 'zodiac', row: 1, col: 3, zodiac: '午' },
  { type: 'zodiac', row: 1, col: 4, zodiac: '未' },
  // ── 右辺：上→下 申・酉・戌 ──
  { type: 'zodiac', row: 2, col: 5, zodiac: '申' },
  { type: 'zodiac', row: 3, col: 5, zodiac: '酉' },
  { type: 'zodiac', row: 4, col: 5, zodiac: '戌' },
  // ── 下辺：左→右 丑・子・亥 ──
  { type: 'zodiac', row: 5, col: 2, zodiac: '丑' },
  { type: 'zodiac', row: 5, col: 3, zodiac: '子' },
  { type: 'zodiac', row: 5, col: 4, zodiac: '亥' },
  // ── 左辺：上→下 辰・卯・寅 ──
  { type: 'zodiac', row: 2, col: 1, zodiac: '辰' },
  { type: 'zodiac', row: 3, col: 1, zodiac: '卯' },
  { type: 'zodiac', row: 4, col: 1, zodiac: '寅' },
  // ── 宮セル（内側 3×3） ──
  { type: 'cell', row: 2, col: 2, key: 'son',  label: '巽' },
  { type: 'cell', row: 2, col: 3, key: 'ri',   label: '離' },
  { type: 'cell', row: 2, col: 4, key: 'kun',  label: '坤' },
  { type: 'cell', row: 3, col: 2, key: 'shin', label: '震' },
  { type: 'cell', row: 3, col: 3, key: null,   label: '中' },
  { type: 'cell', row: 3, col: 4, key: 'da',   label: '兌' },
  { type: 'cell', row: 4, col: 2, key: 'gon',  label: '艮' },
  { type: 'cell', row: 4, col: 3, key: 'kan',  label: '坎' },
  { type: 'cell', row: 4, col: 4, key: 'ken',  label: '乾' },
];

function getItems(direction) {
  if (direction !== 'south_bottom') return NB_ITEMS;
  // 点対称で位置を反転。十二支ラベルもセルも同じ反転で対応する compass 位置に移る。
  return NB_ITEMS.map((it) => ({ ...it, row: 6 - it.row, col: 6 - it.col }));
}

/** 坤宮地盤が複合表記なら右側の干を中宮に表示する（Phase 2B Task 5） */
function deriveCenterKan(palaces) {
  const kunChiban = palaces?.kun?.chiban || '';
  const chars = [...kunChiban];
  if (chars.length >= 2) {
    return chars[chars.length - 1];
  }
  return '';
}

export default function BoardGrid({ palaces, scores = {}, direction = 'north_bottom', kuubou = null }) {
  const items = getItems(direction);
  const centerKan = deriveCenterKan(palaces);

  return (
    <div className="board-grid">
      {items.map((it, idx) => {
        const style = { gridRow: it.row, gridColumn: it.col };
        if (it.type === 'zodiac') {
          const isKuubou = isKuubouZodiac(it.zodiac, kuubou);
          return (
            <div
              key={`Z-${idx}`}
              className={`zodiac-label${isKuubou ? ' is-kuubou' : ''}`}
              style={style}
              aria-label={isKuubou ? `${it.zodiac}（空亡）` : it.zodiac}
            >
              {it.zodiac}
            </div>
          );
        }
        const isCenter = it.key === null;
        return (
          <div key={`C-${idx}`} style={style}>
            <PalaceCell
              label={it.label}
              element={PALACE_FIVE_ELEMENTS[it.label] || ''}
              data={isCenter ? null : palaces[it.key]}
              score={isCenter ? null : scores[it.key]}
              isCenter={isCenter}
              centerKan={isCenter ? centerKan : ''}
            />
          </div>
        );
      })}
    </div>
  );
}
