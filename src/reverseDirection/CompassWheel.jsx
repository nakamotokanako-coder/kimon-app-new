import React from 'react';
import { PALACE_DIRECTIONS, getMiniBoardToneClass } from './reverseDirection.js';
import { DIRECTION_ICONS } from './directionIcons.generated.js';

// 8方位の円盤。扇の色・点数・方位名・選択中の表示は、盤のデータからここで描く。
// 飾りの線画（中央の方位星・テーマのしるし・一番良い方位の印）は public/direction-ui/ の SVG を使う
// （中身は directionIcons.generated.js。scripts/build_direction_ui_assets.py が作る）。
//
// - 方位を押すと、その方位を選ぶ（地図と同じ「選んでいる方位」。onSelectPalace があるときだけ）
// - テーマのしるしは、その方位に入っている門を表す。吉の方位にだけ出す
//   （凶の方位に金運のしるしが付くと、良い方位に見えてしまうため）
// - 一番良い方位の印（bestPalace）と、選んでいる方位（selectedPalace）は別のもの

const CENTER = 175;
const RADIUS = 138;

// 門 → テーマ（吉門だけ）
export const GATE_ICONS = {
  '生門': 'money',
  '休門': 'bond',
  '開門': 'work',
  '杜門': 'health',
  '景門': 'study',
};

// テーマ → しるしの名前と、画面に出す言葉
export const THEME_MARKS = {
  bond: { icon: 'theme-love', label: 'ご縁' },
  work: { icon: 'theme-work', label: '仕事' },
  money: { icon: 'theme-money', label: '金運' },
  health: { icon: 'theme-health', label: '健康' },
  study: { icon: 'theme-study', label: '勉強' },
};

const TONE_LABEL = { daikichi: '大吉', shokichi: '吉', churitsu: '中立', kyo: '凶' };

/** しるしを、SVG の中に描く（色は親の文字色） */
export function DirectionIcon({ name, x = 0, y = 0, size = 24, className = '' }) {
  const inner = DIRECTION_ICONS[name];
  if (!inner) return null;
  return (
    <svg
      className={`direction-icon ${className}`.trim()}
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

function point(angleDeg, distance) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: CENTER + distance * Math.cos(rad), y: CENTER + distance * Math.sin(rad) };
}

function wedgePath(angle, radius = RADIUS) {
  const p1 = point(angle - 22.5, radius);
  const p2 = point(angle + 22.5, radius);
  return `M ${CENTER} ${CENTER} L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${radius} ${radius} 0 0 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} Z`;
}

const scoreText = (score) => `${score > 0 ? '+' : ''}${score}`;

/** その方位に出すテーマ（吉の方位で、吉門が入っているときだけ） */
export function themeOf(item) {
  if (!item || !(item.score > 0)) return null;
  return GATE_ICONS[item.palaceData?.hachimon] || null;
}

export default function CompassWheel({ rankings, bestPalace, selectedPalace = null, onSelectPalace }) {
  const byPalace = Object.fromEntries((rankings || []).map((item) => [item.palace, item]));
  const canSelect = typeof onSelectPalace === 'function';
  const hasSelection = Boolean(selectedPalace);
  const shownThemes = [...new Set(PALACE_DIRECTIONS.map((d) => themeOf(byPalace[d.palace])).filter(Boolean))];
  const hasBest = Boolean(bestPalace && byPalace[bestPalace]);

  return (
    <div className="reverse-compass-frame">
      <svg className="wheel" width="100%" viewBox="0 0 350 350" role="group" aria-label="8方位の円盤">
        <circle className="wheel-rim" cx={CENTER} cy={CENTER} r={RADIUS + 5} />
        {PALACE_DIRECTIONS.map((direction) => {
          const item = byPalace[direction.palace];
          const tone = item?.tone || 'neutral';
          const isBest = direction.palace === bestPalace;
          const isSelected = direction.palace === selectedPalace;
          const theme = themeOf(item);
          const scorePoint = point(direction.angle, theme ? 70 : 84);
          const iconPoint = point(direction.angle, 108);
          const labelPoint = point(direction.angle, 165);
          const bestPoint = point(direction.angle, RADIUS - 1);
          const toneLabel = TONE_LABEL[getMiniBoardToneClass(item?.score || 0, item?.palaceScore)] || '';
          const select = () => onSelectPalace(direction.palace);
          return (
            <g
              key={direction.palace}
              className={`wheel-sector tone-${tone}${isSelected ? ' is-selected' : ''}${hasSelection && !isSelected ? ' is-dim' : ''}`}
              {...(canSelect ? {
                role: 'button',
                tabIndex: 0,
                'aria-pressed': isSelected,
                'aria-label': `${direction.label} ${item ? scoreText(item.score) : ''} ${toneLabel}${isBest ? '（一番良い方位）' : ''}`.trim(),
                onClick: select,
                onKeyDown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    select();
                  }
                },
              } : {})}
            >
              <path className="reverse-seg wheel-fill" d={wedgePath(direction.angle)} />
              <text className="reverse-score-text wheel-score" x={scorePoint.x} y={scorePoint.y}>
                {item ? scoreText(item.score) : '0'}
              </text>
              {theme && <DirectionIcon name={THEME_MARKS[theme].icon} x={iconPoint.x} y={iconPoint.y} size={26} className="wheel-theme" />}
              <text className="reverse-dir-text wheel-label" x={labelPoint.x} y={labelPoint.y}>
                {direction.label}
              </text>
              {isBest && (
                <g className="wheel-best">
                  <circle cx={bestPoint.x} cy={bestPoint.y} r="11" />
                  <DirectionIcon name="best-direction" x={bestPoint.x} y={bestPoint.y} size={20} />
                </g>
              )}
            </g>
          );
        })}
        {/* 選んでいる方位の金の輪郭は、ほかの扇の上に重ねて描く */}
        {selectedPalace && byPalace[selectedPalace] && (
          <path
            className="wheel-selected-outline"
            d={wedgePath(PALACE_DIRECTIONS.find((d) => d.palace === selectedPalace).angle)}
          />
        )}
        <circle className="reverse-center-circle wheel-center" cx={CENTER} cy={CENTER} r="30" />
        <DirectionIcon name="compass-rose" x={CENTER} y={CENTER} size={44} className="wheel-rose" />
      </svg>

      <div className="reverse-legend wheel-legend">
        <span><i className="legend-swatch tone-great" />大吉</span>
        <span><i className="legend-swatch tone-weak" />吉</span>
        <span><i className="legend-swatch tone-neutral" />中立</span>
        <span><i className="legend-swatch tone-bad" />凶</span>
        {hasBest && (
          <span className="wheel-legend-mark">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><DirectionIcon name="best-direction" x={12} y={12} size={22} /></svg>
            一番良い方位
          </span>
        )}
      </div>
      {shownThemes.length > 0 && (
        <div className="wheel-themes" aria-label="しるしの意味">
          {shownThemes.map((theme) => (
            <span key={theme} className="wheel-legend-mark">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><DirectionIcon name={THEME_MARKS[theme].icon} x={12} y={12} size={22} /></svg>
              {THEME_MARKS[theme].label}
            </span>
          ))}
          <small>しるしは、その方位に入っている門のテーマです。</small>
        </div>
      )}
      {canSelect && <p className="wheel-hint">方位を押すと、その方位を選べます。</p>}
    </div>
  );
}
