import React from 'react';
import PalaceCell from './PalaceCell.jsx';

const LAYOUT_NORTH_BOTTOM = [
  { key: 'son', label: '巽', number: 4, zodiac: '辰巳' },
  { key: 'ri', label: '離', number: 9, zodiac: '午' },
  { key: 'kun', label: '坤', number: 2, zodiac: '未申' },
  { key: 'shin', label: '震', number: 3, zodiac: '卯' },
  { key: null, label: '中', number: 5, zodiac: '' },
  { key: 'da', label: '兌', number: 7, zodiac: '酉' },
  { key: 'gon', label: '艮', number: 8, zodiac: '丑寅' },
  { key: 'kan', label: '坎', number: 1, zodiac: '子' },
  { key: 'ken', label: '乾', number: 6, zodiac: '戌亥' },
];

const LAYOUT_SOUTH_BOTTOM = [...LAYOUT_NORTH_BOTTOM].slice().reverse();

export default function BoardGrid({ palaces, scores = {}, direction = 'north_bottom' }) {
  const layout = direction === 'south_bottom' ? LAYOUT_SOUTH_BOTTOM : LAYOUT_NORTH_BOTTOM;
  return (
    <div className="board-grid">
      {layout.map((cell, idx) => (
        <PalaceCell
          key={`${direction}-${idx}`}
          label={cell.label}
          number={cell.number}
          zodiac={cell.zodiac}
          data={cell.key ? palaces[cell.key] : null}
          score={cell.key ? scores[cell.key] : null}
          isCenter={cell.key === null}
        />
      ))}
    </div>
  );
}
