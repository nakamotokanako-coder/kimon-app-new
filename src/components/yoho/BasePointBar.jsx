import React, { useState } from 'react';
import { ic } from '../../utils/icons.js';
import BasePointSheet from './BasePointSheet.jsx';
import { getLongitudeCorrectionMinutes } from '../../reverseDirection/reverseDirection.js';

function formatCorrection(minutes) {
  if (minutes === 0) return '±0分';
  return `${minutes > 0 ? '+' : ''}${minutes}分`;
}

export default function BasePointBar({
  center,
  baseName = '現在地',
  onCenterChange,
  // 地図タブ用: 補正の分数と経度は出さない（詳しい人向けの数字。押したときの説明に入れる）
  compact = false,
  // 「目的で選ぶ」用: 現在地・自然時・現在時刻を1枚のカードにまとめる（経度は出さない）。渡すのは「22:24」の形
  nowLabel = '',
}) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const longitude = Number(center?.[0]);
  const latitude = Number(center?.[1]);
  const correction = getLongitudeCorrectionMinutes(longitude);
  const longitudeLabel = Number.isFinite(longitude) ? longitude.toFixed(2) : '--';
  const sheetCenter = Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;

  const handleSelectCenter = (nextCenter, nextName) => {
    onCenterChange?.(nextCenter, nextName);
    setIsSheetOpen(false);
  };

  return (
    <>
      <div
        className={`base-bar${compact ? ' is-compact' : ''}${nowLabel ? ' is-card' : ''}`}
        aria-label="基準点"
        title={compact ? `自然時補正 ${formatCorrection(correction)}／経度 ${longitudeLabel}` : undefined}
      >
        <div className="base-meta">
          <span className="base-pin" aria-hidden="true">{ic('📍')}</span>
          <strong>{baseName || '現在地'}</strong>
          {nowLabel && <span className="base-natural">自然時 {formatCorrection(correction)}</span>}
          {nowLabel && <small className="base-now">現在 {nowLabel}</small>}
          {!compact && !nowLabel && <span className="base-mono">{formatCorrection(correction)}</span>}
          {!compact && !nowLabel && <span className="base-mono">経度{longitudeLabel}</span>}
        </div>
        <button type="button" className="base-change" onClick={() => setIsSheetOpen(true)}>
          {nowLabel ? '変更' : '変更▾'}
        </button>
      </div>
      {isSheetOpen && (
        <BasePointSheet
          currentCenter={sheetCenter}
          onClose={() => setIsSheetOpen(false)}
          onSelectCenter={handleSelectCenter}
        />
      )}
    </>
  );
}
