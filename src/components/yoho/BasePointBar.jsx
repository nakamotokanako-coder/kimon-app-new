import React, { useState } from 'react';
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
      <div className="base-bar" aria-label="基準点">
        <div className="base-meta">
          <span className="base-pin" aria-hidden="true">📍</span>
          <strong>{baseName || '現在地'}</strong>
          <span className="base-mono">{formatCorrection(correction)}</span>
          <span className="base-mono">経度{longitudeLabel}</span>
        </div>
        <button type="button" className="base-change" onClick={() => setIsSheetOpen(true)}>
          変更▾
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
