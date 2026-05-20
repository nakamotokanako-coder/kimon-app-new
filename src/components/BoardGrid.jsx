import React from 'react';
import PalaceCell from './PalaceCell.jsx';
import { isKuubouZodiac } from '../kimon/banLevel.js';

// 5×5 グリッド。中央 3×3 が宮セル、外周 8 マスにラベル。
// 北を下（南が上）= 先生Excel と同じデフォルト orientation。
// south_bottom 切替時は (row, col) を (6-row, 6-col) で点対称反転。
//
// Phase 2C-followup2 (2026-05-22): 外周ラベルを先生Excel の方位ラベル位置に統一。
//   ・四隅の outer corner (r1c1/r1c5/r5c1/r5c5) は空白
//   ・四隅 adjacent (r1c2/r1c4/r5c2/r5c4) に 2 文字ペアをコンパクト配置
//       (= Excel の 南東/南西/北東/北西 ラベル位置)
//   ・辺中央 (r1c3/r3c1/r3c5/r5c3) に四正宮の単独十二支
//       (= Excel の 南/東/西/北 ラベル位置)

const PALACE_FIVE_ELEMENTS = {
  '坎': '水', '艮': '土', '震': '木', '巽': '木',
  '離': '火', '坤': '土', '兌': '金', '乾': '金',
};

/**
 * 四隅ペアの 2 文字配列（NB orientation・左から右への順）。
 *
 *   - r1c2 (巽宮の真上, 旧"南東"): [辰, 巳] (辰=左寄り, 巳=右寄り)
 *   - r1c4 (坤宮の真上, 旧"南西"): [未, 申] (未=左寄り, 申=右寄り)
 *   - r5c4 (乾宮の真下, 旧"北西"): [亥, 戌] (亥=左寄り, 戌=右寄り)
 *   - r5c2 (艮宮の真下, 旧"北東"): [寅, 丑] (寅=左寄り, 丑=右寄り)
 */
const PAIR_NB = {
  TL: ['辰', '巳'],
  TR: ['未', '申'],
  BR: ['亥', '戌'],
  BL: ['寅', '丑'],
};

/** 北を下（南を上）= デフォルト＝先生Excel と同じ orientation の構成要素 */
const NB_ITEMS = [
  // ── 四隅ペア（角の宮の真外側、2 文字 横並び）──
  { type: 'pair', row: 1, col: 2, chars: PAIR_NB.TL },  // 巽 真上 (南東位置)
  { type: 'pair', row: 1, col: 4, chars: PAIR_NB.TR },  // 坤 真上 (南西位置)
  { type: 'pair', row: 5, col: 4, chars: PAIR_NB.BR },  // 乾 真下 (北西位置)
  { type: 'pair', row: 5, col: 2, chars: PAIR_NB.BL },  // 艮 真下 (北東位置)
  // ── 辺中央の単独十二支（四正宮の真外側）──
  { type: 'zodiac', row: 1, col: 3, zodiac: '午' },  // 離 真上 (南位置)
  { type: 'zodiac', row: 3, col: 1, zodiac: '卯' },  // 震 真左 (東位置)
  { type: 'zodiac', row: 3, col: 5, zodiac: '酉' },  // 兌 真右 (西位置)
  { type: 'zodiac', row: 5, col: 3, zodiac: '子' },  // 坎 真下 (北位置)
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
  // 180° 点対称反転。ペアは 2 文字の順序も反転（左右が入れ替わる）。
  return NB_ITEMS.map((it) => {
    const newItem = { ...it, row: 6 - it.row, col: 6 - it.col };
    if (newItem.type === 'pair') {
      newItem.chars = [...it.chars].reverse();
    }
    return newItem;
  });
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
        if (it.type === 'pair') {
          return (
            <div key={`P-${idx}`} className="zodiac-pair" style={style}>
              {it.chars.map((char, i) => {
                const isKuubou = isKuubouZodiac(char, kuubou);
                return (
                  <span
                    key={`${char}-${i}`}
                    className={`zodiac-pair-char${isKuubou ? ' is-kuubou' : ''}`}
                    aria-label={isKuubou ? `${char}（空亡）` : char}
                  >
                    {char}
                  </span>
                );
              })}
            </div>
          );
        }
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
