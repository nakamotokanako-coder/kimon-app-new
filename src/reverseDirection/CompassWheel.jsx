import React from 'react';
import { PALACE_DIRECTIONS } from './reverseDirection.js';

const CENTER = 175;
const RADIUS = 145;
const START_OFFSET = -112.5;

function polarPoint(angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return {
    x: CENTER + RADIUS * Math.cos(rad),
    y: CENTER + RADIUS * Math.sin(rad),
  };
}

function wedgePath(index) {
  const start = START_OFFSET + index * 45;
  const end = start + 45;
  const p1 = polarPoint(start);
  const p2 = polarPoint(end);
  return `M ${CENTER} ${CENTER} L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${RADIUS} ${RADIUS} 0 0 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} Z`;
}

function textPoint(angleDeg, distance) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return {
    x: CENTER + distance * Math.cos(rad),
    y: CENTER + distance * Math.sin(rad),
  };
}

export default function CompassWheel({ rankings, bestPalace }) {
  const byPalace = Object.fromEntries((rankings || []).map((item) => [item.palace, item]));

  return (
    <div className="reverse-compass-frame">
      <svg width="100%" viewBox="0 0 350 350" role="img" aria-label="45度8区画の方位盤">
        {PALACE_DIRECTIONS.map((direction, index) => {
          const item = byPalace[direction.palace];
          const scorePoint = textPoint(direction.angle, 92);
          const labelPoint = textPoint(direction.angle, 162);
          const isBest = direction.palace === bestPalace;
          return (
            <g key={direction.palace}>
              <path
                className={`reverse-seg tone-${item?.tone || 'neutral'} ${isBest ? 'is-best' : ''}`}
                d={wedgePath(index)}
              />
              <text className="reverse-score-text" x={scorePoint.x} y={scorePoint.y}>
                {item ? `${item.score > 0 ? '+' : ''}${item.score}` : '0'}
              </text>
              <text className="reverse-dir-text" x={labelPoint.x} y={labelPoint.y}>
                {direction.label}
              </text>
            </g>
          );
        })}
        <circle className="reverse-center-circle" cx={CENTER} cy={CENTER} r="28" />
        <text className="reverse-center-text" x={CENTER} y={CENTER}>基準点</text>
      </svg>
      <div className="reverse-legend">
        <span><i className="legend-swatch tone-great" />大吉</span>
        <span><i className="legend-swatch tone-weak" />小吉</span>
        <span><i className="legend-swatch tone-neutral" />中立</span>
        <span><i className="legend-swatch tone-bad" />凶</span>
        <span><i className="legend-swatch tone-best" />最大吉</span>
      </div>
    </div>
  );
}
