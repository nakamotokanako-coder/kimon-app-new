import React from 'react';
import { PALACE_DIRECTIONS } from './reverseDirection.js';

const CENTER = 175;
const RADIUS = 145;
const WISH_MARKER_SIZE = 28;
export const GATE_ICONS = {
  '生門': 'money',
  '休門': 'bond',
  '開門': 'work',
  '杜門': 'health',
  '景門': 'study',
};

function WishIcon({ type, x, y, delay }) {
  const commonProps = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.7',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  const iconX = x - WISH_MARKER_SIZE / 2;
  const iconY = y - WISH_MARKER_SIZE / 2;

  return (
    <svg
      className="reverse-gate-icon"
      style={{ '--wish-delay': `${delay}s` }}
      x={iconX}
      y={iconY}
      width={WISH_MARKER_SIZE}
      height={WISH_MARKER_SIZE}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {type === 'money' && (
        <g {...commonProps}>
          <circle cx="12" cy="12" r="8.8" />
          <rect x="9.4" y="9.4" width="5.2" height="5.2" rx="1" />
        </g>
      )}
      {type === 'bond' && (
        <g {...commonProps}>
          <circle cx="9.2" cy="12" r="4.8" />
          <circle cx="14.8" cy="12" r="4.8" />
        </g>
      )}
      {type === 'work' && (
        <g {...commonProps}>
          <rect x="3.5" y="8" width="17" height="11" rx="2.2" />
          <path d="M8.5 8 V6.6 A1.6 1.6 0 0 1 10.1 5 H13.9 A1.6 1.6 0 0 1 15.5 6.6 V8" />
          <path d="M3.5 12.8 H20.5" />
        </g>
      )}
      {type === 'health' && (
        <g {...commonProps}>
          <path d="M5.5 18.5 C5.5 10 11 5 18.5 5 C18.5 12.5 13 18.5 5.5 18.5 Z" />
          <path d="M8 16 C11 12.5 14 9.5 17 7.5" />
        </g>
      )}
      {type === 'study' && (
        <g {...commonProps}>
          <path d="M12 6.2 C10 4.8 6.2 4.8 4 5.8 V18 C6.2 17 10 17 12 18.2 C14 17 17.8 17 20 18 V5.8 C17.8 4.8 14 4.8 12 6.2 Z" />
          <path d="M12 6.2 V18.2" />
        </g>
      )}
    </svg>
  );
}

function polarPoint(angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return {
    x: CENTER + RADIUS * Math.cos(rad),
    y: CENTER + RADIUS * Math.sin(rad),
  };
}

function wedgePath(angle) {
  const start = angle - 22.5;
  const end = angle + 22.5;
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
          const iconPoint = textPoint(direction.angle, 112);
          const labelPoint = textPoint(direction.angle, 162);
          const isBest = direction.palace === bestPalace;
          return (
            <g key={direction.palace}>
              <path
                className={`reverse-seg tone-${item?.tone || 'neutral'} ${isBest ? 'is-best' : ''}`}
                d={wedgePath(direction.angle)}
              />
              <text className="reverse-score-text" x={scorePoint.x} y={scorePoint.y}>
                {item ? `${item.score > 0 ? '+' : ''}${item.score}` : '0'}
              </text>
              {GATE_ICONS[item?.palaceData?.hachimon] && (
                <WishIcon
                  type={GATE_ICONS[item.palaceData.hachimon]}
                  x={iconPoint.x}
                  y={iconPoint.y}
                  delay={(index % 5) * 0.4}
                />
              )}
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
