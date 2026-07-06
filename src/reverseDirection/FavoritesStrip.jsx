import React from 'react';
import { favoriteDisplayName, favoriteKey } from './mapSearch.js';
import { getFanColor } from './mapFan.js';

function scoreText(score) {
  return `${score > 0 ? '+' : ''}${score}`;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '-';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

/**
 * PR-2.6 GOゾーン再構成: 地図直下の横スクロール お気に入りストリップ。
 * 方位ピル・点数の色は getFanColor(tone) をそのまま呼ぶだけ（吉凶色ロジックは無改変）。
 * 編集・削除・名前変更・拠点トグルはここには置かず、「すべて見る」で
 * 従来の direction-place-panel（DirectionMap.jsx 内）に集約する。
 */
export default function FavoritesStrip({ chips, focusedKey, onFocusKey, onShowAll }) {
  const list = chips || [];
  return (
    <>
      <div className="fav-head">
        <span className="fav-head-en lat">Favorites</span>
        <span className="fav-head-cnt">お気に入り（{list.length}）</span>
        <button type="button" className="fav-head-all" onClick={onShowAll}>
          すべて見る ›
        </button>
      </div>
      <div className="fav-strip" aria-label="お気に入り">
        {list.length > 0 ? list.map((item) => {
          const key = favoriteKey(item);
          const color = getFanColor(item.direction?.tone);
          const selected = key === focusedKey;
          return (
            <button
              key={key}
              type="button"
              className={`fav-card${selected ? ' is-selected' : ''}`}
              aria-pressed={selected}
              onClick={() => onFocusKey(key)}
            >
              <div className="fav-card-top">
                <span className="fav-dir-pill" style={{ background: color }}>
                  {item.direction?.label || '-'}
                </span>
                <span className="fav-score lat" style={{ color }}>
                  {scoreText(item.direction?.score || 0)}
                </span>
              </div>
              <div className="fav-name">{favoriteDisplayName(item)}</div>
              <div className="fav-dist lat">{formatDistance(item.distanceM)}</div>
            </button>
          );
        }) : (
          <p className="fav-empty">地図で見つけた場所をお気に入りに追加すると、ここに表示されます。</p>
        )}
      </div>
    </>
  );
}
