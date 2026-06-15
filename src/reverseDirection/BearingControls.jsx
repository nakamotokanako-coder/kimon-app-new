import React from 'react';
import { BEARING_LABELS } from './mapFan.js';

// 方位法トグル（平面/球面セグメント＋西偏角チェック）の presentational コンポーネント。
// 小枠(compact)／全画面(fullscreen)で同一UIを共有する。state・永続化は持たない。
export default function BearingControls({ value, onChange, variant = 'fullscreen' }) {
  const { mode, declination } = value;

  const setMode = (nextMode) => {
    if (nextMode === mode) return;
    onChange({ mode: nextMode, declination });
  };

  const setDeclination = (nextDeclination) => {
    onChange({ mode, declination: nextDeclination });
  };

  return (
    <div className={`direction-map-controls is-${variant}`} aria-label={BEARING_LABELS.group_aria}>
      <div className="direction-map-toggle" role="group" aria-label={`${BEARING_LABELS.mode_plane}または${BEARING_LABELS.mode_sphere}`}>
        <button
          type="button"
          className={mode === 'plane' ? 'is-active' : ''}
          onClick={() => setMode('plane')}
        >
          {BEARING_LABELS.mode_plane}
        </button>
        <button
          type="button"
          className={mode === 'sphere' ? 'is-active' : ''}
          onClick={() => setMode('sphere')}
        >
          {BEARING_LABELS.mode_sphere}
        </button>
      </div>
      <label className="direction-map-check">
        <input
          type="checkbox"
          checked={declination}
          onChange={(event) => setDeclination(event.target.checked)}
        />
        {BEARING_LABELS.declination_on}
      </label>
    </div>
  );
}
