import React, { useState } from 'react';

function displayName(favorite) {
  return favorite?.label?.trim() ? favorite.label.trim() : favorite?.name;
}

export default function BasePointSelector({
  currentMode,
  currentBaseName,
  selectedFavoriteId,
  favorites = [],
  onSelectMode,
}) {
  const [open, setOpen] = useState(false);
  const selectedFavorite = favorites.find((favorite) => favorite.id === selectedFavoriteId) || null;
  const triggerName = currentMode === 'favorite' && selectedFavorite
    ? displayName(selectedFavorite)
    : '現在地';

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
        <span className="base-point-trigger-text">
          <span>{triggerName || currentBaseName || '現在地'}</span>
          <i aria-hidden="true">▼</i>
        </span>
        <small>{selectedFavorite?.name || 'GPSで取得'}</small>
      </button>
      {open && (
        <div className="base-point-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => select('gps')}>
            <span>現在地</span>
            <small>GPSで取得</small>
          </button>
          {favorites.length > 0 && <div className="base-point-menu-label">お気に入り</div>}
          {favorites.map((favorite) => (
            <button
              key={favorite.id}
              type="button"
              role="menuitem"
              onClick={() => select('favorite', favorite.id)}
            >
              <span>{displayName(favorite)}</span>
              <small>{favorite.name}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
