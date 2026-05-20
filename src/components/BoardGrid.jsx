import React from 'react';
import PalaceCell from './PalaceCell.jsx';

// 5×5 グリッド（外周に方位+十二支ラベル）。
// 中央 3×3 が宮セル、外周 8 マスに方位ラベル。
// 北を下（南が上）= 先生Excel と同じデフォルト orientation。
// south_bottom 切替時は (row, col) を (6-row, 6-col) で点対称反転。

const PALACE_FIVE_ELEMENTS = {
  '坎': '水', '艮': '土', '震': '木', '巽': '木',
  '離': '火', '坤': '土', '兌': '金', '乾': '金',
};

/** 北を下（南を上）= デフォルト＝先生Excel と同じ orientation */
const NB_ITEMS = [
  // ── 方位ラベル + 十二支（外周）──
  { type: 'label', row: 1, col: 2, dir: '南東', zodiac: '辰巳' },
  { type: 'label', row: 1, col: 3, dir: '南',   zodiac: '午'   },
  { type: 'label', row: 1, col: 4, dir: '南西', zodiac: '未申' },
  { type: 'label', row: 3, col: 1, dir: '東',   zodiac: '卯'   },
  { type: 'label', row: 3, col: 5, dir: '西',   zodiac: '酉'   },
  { type: 'label', row: 5, col: 2, dir: '北東', zodiac: '丑寅' },
  { type: 'label', row: 5, col: 3, dir: '北',   zodiac: '子'   },
  { type: 'label', row: 5, col: 4, dir: '北西', zodiac: '戌亥' },
  // ── 宮セル（内側 3×3）──
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
  // 点対称で位置を反転。direction ラベル文言と zodiac も同じ反転で move する。
  return NB_ITEMS.map((it) => ({ ...it, row: 6 - it.row, col: 6 - it.col }));
}

/** 坤宮地盤が複合表記なら右側の干を中宮に表示する（先生指示 Task 5） */
function deriveCenterKan(palaces) {
  const kunChiban = palaces?.kun?.chiban || '';
  const chars = [...kunChiban];
  if (chars.length >= 2) {
    return chars[chars.length - 1];
  }
  return '';
}

export default function BoardGrid({ palaces, scores = {}, direction = 'north_bottom' }) {
  const items = getItems(direction);
  const centerKan = deriveCenterKan(palaces);

  return (
    <div className="board-grid">
      {items.map((it, idx) => {
        const style = { gridRow: it.row, gridColumn: it.col };
        if (it.type === 'label') {
          return (
            <div key={`L-${idx}`} className={`direction-label dir-${it.dir}`} style={style}>
              <span className="dir-name">{it.dir}</span>
              <span className="dir-zodiac">{it.zodiac}</span>
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
