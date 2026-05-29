import React, { useMemo, useState } from 'react';
import { favoriteDisplayName, favoriteKey } from './mapSearch.js';

function favoriteAddress(favorite) {
  return favorite?.name || favorite?.address || '';
}

export default function BasePointSelector({
  currentMode,
  currentBaseName,
  selectedFavoriteId,
  favorites = [],
  onSelectMode,
}) {
  const [open, setOpen] = useState(false);
  const currentFavorite = useMemo(() => (
    currentMode === 'favorite'
      ? favorites.find((favorite) => favoriteKey(favorite) === selectedFavoriteId) || null
      : null
  ), [currentMode, favorites, selectedFavoriteId]);

  if (!favorites.length) {
    return (
      <button type="button" onClick={() => onSelectMode('gps')}>
        現在地
      </button>
    );
  }

  const buttonLabel = currentMode === 'favorite' ? currentBaseName : '現在地';
  const buttonSubLabel = currentMode === 'favorite'
    ? favoriteAddress(currentFavorite)
    : 'GPS';

  const select = (mode, favoriteId) => {
    setOpen(false);
    onSelectMode(mode, favoriteId);
  };

  return (
    <div className="base-point-selector">
      <button
        type="button"
        className="base-point-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{buttonLabel}</span>
        <small>{buttonSubLabel}</small>
      </button>
      {open && (
        <div className="base-point-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => select('gps')}>
            <span>現在地</span>
            <small>GPSで取得</small>
          </button>
          <div className="base-point-menu-label">お気に入り</div>
          {favorites.map((favorite) => {
            const id = favoriteKey(favorite);
            return (
              <button key={id} type="button" role="menuitem" onClick={() => select('favorite', id)}>
                <span>{favoriteDisplayName(favorite)}</span>
                <small>{favoriteAddress(favorite)}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
