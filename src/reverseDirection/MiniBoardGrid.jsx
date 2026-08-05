import React from 'react';
import { getMiniBoardToneClass } from './reverseDirection.js';

const MINI_BOARD_LAYOUT = [
  ['ken', 'kan', 'gon'],
  ['da', null, 'shin'],
  ['kun', 'ri', 'son'],
];

function scoreText(score) {
  return `${score > 0 ? '+' : ''}${score}`;
}

export default function MiniBoardGrid({ rankings }) {
  const byPalace = new Map((rankings || []).map((item) => [item.palace, item]));
  const bestPalace = rankings?.[0]?.palace;

  return (
    <div className="mini-board-grid" aria-label="簡易3×3グリッド">
      {MINI_BOARD_LAYOUT.flat().map((palace, index) => {
        if (!palace) {
          return (
            <div key="center" className="mini-board-cell is-center">
              <span className="mini-board-dir">基準点</span>
            </div>
          );
        }

        const item = byPalace.get(palace);
        const score = item?.score ?? 0;
        return (
          <div
            key={`${palace}-${index}`}
            className={`mini-board-cell ${getMiniBoardToneClass(score, item?.palaceScore)} ${palace === bestPalace ? 'is-best' : ''}`}
          >
            <span className="mini-board-dir">{item?.label || '-'}</span>
            <strong className="mini-board-score">{scoreText(score)}</strong>
            <span className="mini-board-gate">{item?.palaceData?.hachimon || '-'}</span>
          </div>
        );
      })}
    </div>
  );
}
