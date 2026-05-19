import React from 'react';
import PalaceCell from './PalaceCell.jsx';

// 宮名 → 五行（先生指示 2026-05-19 Task 3）。中宮は意図的に含めない（「中」のみ表示）
const PALACE_FIVE_ELEMENTS = {
  '坎': '水', '艮': '土', '震': '木', '巽': '木',
  '離': '火', '坤': '土', '兌': '金', '乾': '金',
};

function withFiveElement(palaceName) {
  const el = PALACE_FIVE_ELEMENTS[palaceName];
  return el ? `${palaceName}${el}` : palaceName;
}

const LAYOUT_NORTH_BOTTOM = [
  { key: 'son', label: '巽', zodiac: '辰巳' },
  { key: 'ri', label: '離', zodiac: '午' },
  { key: 'kun', label: '坤', zodiac: '未申' },
  { key: 'shin', label: '震', zodiac: '卯' },
  { key: null, label: '中', zodiac: '' },
  { key: 'da', label: '兌', zodiac: '酉' },
  { key: 'gon', label: '艮', zodiac: '丑寅' },
  { key: 'kan', label: '坎', zodiac: '子' },
  { key: 'ken', label: '乾', zodiac: '戌亥' },
];

const LAYOUT_SOUTH_BOTTOM = [...LAYOUT_NORTH_BOTTOM].slice().reverse();

export default function BoardGrid({ palaces, scores = {}, direction = 'north_bottom' }) {
  const layout = direction === 'south_bottom' ? LAYOUT_SOUTH_BOTTOM : LAYOUT_NORTH_BOTTOM;
  return (
    <div className="board-grid">
      {layout.map((cell, idx) => (
        <PalaceCell
          key={`${direction}-${idx}`}
          label={cell.key ? withFiveElement(cell.label) : cell.label}
          zodiac={cell.zodiac}
          data={cell.key ? palaces[cell.key] : null}
          score={cell.key ? scores[cell.key] : null}
          isCenter={cell.key === null}
        />
      ))}
    </div>
  );
}
