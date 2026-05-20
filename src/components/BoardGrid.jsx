import React from 'react';
import PalaceCell from './PalaceCell.jsx';
import { isKuubouZodiac } from '../kimon/banLevel.js';

// 5×5 グリッド。中央 3×3 が宮セル、外周 8 マスにラベル。
// 北を下（南が上）= 先生Excel と同じデフォルト orientation。
// south_bottom 切替時は (row, col) を (6-row, 6-col) で点対称反転。
//
// Phase 2C-followup (2026-05-22): 外周ラベルを以下に再編。
//   ・四隅（r1c1/r1c5/r5c1/r5c5）: 隣接する四隅宮に紐づく 2 文字を angle area で配置
//       例: TL は 巽宮(SE) の外側 → 巳(上辺寄り)と辰(左辺寄り)を対角で
//   ・辺中央（r1c3/r3c1/r3c5/r5c3）: 四正宮の単独十二支
//   ・他の外周セル（r1c2,r1c4,r2c1,r2c5,r4c1,r4c5,r5c2,r5c4）: 空白
// これにより各十二支が紐づく宮の真外側に密集表示される。

const PALACE_FIVE_ELEMENTS = {
  '坎': '水', '艮': '土', '震': '木', '巽': '木',
  '離': '火', '坤': '土', '兌': '金', '乾': '金',
};

/**
 * 四隅 angle area の内部レイアウト（NB orientation）。
 * tl/tr/bl/br = 内部 2×2 サブグリッドの 4 隅。
 *
 * 例 TL (巽宮の外側):
 *   tr = 巳 (上辺寄り、巽の真上方向)
 *   bl = 辰 (左辺寄り、巽の真左方向)
 *   tl と br は空。
 */
const ANGLE_NB = {
  TL: { tr: '巳', bl: '辰' },  // 巽 (SE) の外側
  TR: { tl: '未', br: '申' },  // 坤 (SW) の外側
  BR: { tr: '戌', bl: '亥' },  // 乾 (NW) の外側
  BL: { tl: '寅', br: '丑' },  // 艮 (NE) の外側
};

/** 北を下（南を上）= デフォルト＝先生Excel と同じ orientation の構成要素 */
const NB_ITEMS = [
  // ── 四隅 angle areas ──
  { type: 'angle', row: 1, col: 1, definition: ANGLE_NB.TL },
  { type: 'angle', row: 1, col: 5, definition: ANGLE_NB.TR },
  { type: 'angle', row: 5, col: 1, definition: ANGLE_NB.BL },
  { type: 'angle', row: 5, col: 5, definition: ANGLE_NB.BR },
  // ── 辺中央の単独十二支（四正宮の真外側）──
  { type: 'zodiac', row: 1, col: 3, zodiac: '午' },  // 離宮 (S) の真上
  { type: 'zodiac', row: 3, col: 1, zodiac: '卯' },  // 震宮 (E) の真左
  { type: 'zodiac', row: 3, col: 5, zodiac: '酉' },  // 兌宮 (W) の真右
  { type: 'zodiac', row: 5, col: 3, zodiac: '子' },  // 坎宮 (N) の真下
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

/** angle definition を 180° 回転（south_bottom 用、tl↔br / tr↔bl を swap） */
function rotateAngle(def) {
  const out = {};
  if (def.tl) out.br = def.tl;
  if (def.tr) out.bl = def.tr;
  if (def.bl) out.tr = def.bl;
  if (def.br) out.tl = def.br;
  return out;
}

function getItems(direction) {
  if (direction !== 'south_bottom') return NB_ITEMS;
  return NB_ITEMS.map((it) => {
    const newItem = { ...it, row: 6 - it.row, col: 6 - it.col };
    if (newItem.type === 'angle') {
      newItem.definition = rotateAngle(it.definition);
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

/** 四隅 angle area の 1 セル内に対角配置で 2 文字を描く小コンポーネント */
function ZodiacAngle({ definition, kuubou }) {
  const slots = ['tl', 'tr', 'bl', 'br'];
  return (
    <div className="zodiac-angle">
      {slots.map((slot) => {
        const char = definition[slot];
        if (!char) return null;
        const isKuubou = isKuubouZodiac(char, kuubou);
        return (
          <span
            key={slot}
            className={`zodiac-angle-slot pos-${slot}${isKuubou ? ' is-kuubou' : ''}`}
            aria-label={isKuubou ? `${char}（空亡）` : char}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
}

export default function BoardGrid({ palaces, scores = {}, direction = 'north_bottom', kuubou = null }) {
  const items = getItems(direction);
  const centerKan = deriveCenterKan(palaces);

  return (
    <div className="board-grid">
      {items.map((it, idx) => {
        const style = { gridRow: it.row, gridColumn: it.col };
        if (it.type === 'angle') {
          return (
            <div key={`A-${idx}`} style={style}>
              <ZodiacAngle definition={it.definition} kuubou={kuubou} />
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
