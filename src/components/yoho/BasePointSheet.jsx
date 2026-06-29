import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MAP_SEARCH_STORAGE_KEY,
  favoriteDisplayName,
  favoriteKey,
  pickNearestAddressCandidate,
} from '../../reverseDirection/mapSearch.js';
import { getLongitudeCorrectionMinutes } from '../../reverseDirection/reverseDirection.js';

function formatCorrection(minutes) {
  if (minutes === 0) return '±0分';
  return `${minutes > 0 ? '+' : ''}${minutes}分`;
}

function normalizeFavorite(favorite) {
  const latitude = Number(favorite?.latitude ?? favorite?.lat);
  const longitude = Number(favorite?.longitude ?? favorite?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const normalized = {
    ...favorite,
    name: favorite?.name || favorite?.address || 'お気に入り',
    latitude,
    longitude,
  };
  return {
    ...normalized,
    id: favorite?.id || favoriteKey(normalized),
  };
}

function readFavorites() {
  try {
    if (typeof window === 'undefined') return [];
    const saved = window.localStorage.getItem(MAP_SEARCH_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return (Array.isArray(parsed) ? parsed : [])
      .map(normalizeFavorite)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeGsiCandidate(candidate) {
  const coords = candidate?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    center: [longitude, latitude],
    name: candidate?.properties?.title || '選択地点',
  };
}

export default function BasePointSheet({
  currentCenter,
  onClose,
  onSelectCenter,
}) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState('');
  const [favorites, setFavorites] = useState(() => readFavorites());
  const currentLongitude = Number(currentCenter?.[0]);
  const currentLatitude = Number(currentCenter?.[1]);
  const correction = getLongitudeCorrectionMinutes(currentLongitude);
  const longitudeLabel = Number.isFinite(currentLongitude) ? currentLongitude.toFixed(2) : '--';
  const homeForNearest = Number.isFinite(currentLatitude) && Number.isFinite(currentLongitude)
    ? [currentLatitude, currentLongitude]
    : null;

  useEffect(() => {
    setFavorites(readFavorites());
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const favoriteChips = useMemo(() => favorites.slice(0, 24), [favorites]);

  const useCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('この端末では現在地を取得できません。');
      return;
    }
    setStatus('現在地を取得中です。');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onSelectCenter?.([pos.coords.longitude, pos.coords.latitude], '現在地');
      },
      (error) => {
        console.error(error);
        setStatus('現在地を取得できませんでした。');
      },
      { timeout: 8000, enableHighAccuracy: false },
    );
  };

  const searchPlace = async (event) => {
    event.preventDefault();
    const text = query.trim();
    if (!text || isSearching) return;
    setIsSearching(true);
    setStatus('検索中です。');
    try {
      const response = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(text)}`);
      const data = await response.json();
      const picked = pickNearestAddressCandidate(data, homeForNearest);
      const normalized = normalizeGsiCandidate(picked);
      if (!normalized) {
        setStatus('候補が見つかりませんでした。');
        return;
      }
      onSelectCenter?.(normalized.center, normalized.name);
    } catch (error) {
      console.error(error);
      setStatus('場所検索に失敗しました。');
    } finally {
      setIsSearching(false);
    }
  };

  const sheet = (
    <>
      <button
        type="button"
        className="sheet-backdrop is-open"
        aria-label="基準点変更を閉じる"
        onClick={onClose}
      />
      <div className="bottom-sheet is-open" role="dialog" aria-modal="true" aria-label="基準点を変更">
        <button type="button" className="sheet-handle" aria-label="閉じる" onClick={onClose} />
        <div className="sheet-title-row">
          <h3 className="sheet-title">基準点を変更</h3>
          <button type="button" className="sheet-close" aria-label="閉じる" onClick={onClose}>×</button>
        </div>

        <section className="sheet-section">
          <button type="button" className="sheet-action" onClick={useCurrentLocation}>
            📍 現在地を使う
          </button>
        </section>

        <section className="sheet-section">
          <label className="sheet-label" htmlFor="base-point-search">🔍 場所・地名で検索</label>
          <form onSubmit={searchPlace}>
            <input
              id="base-point-search"
              className="search-input"
              type="search"
              value={query}
              placeholder="例：東京駅、自宅の町名"
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>
        </section>

        <section className="sheet-section">
          <span className="sheet-label">⭐ お気に入りから選ぶ</span>
          <div className="favorite-row">
            {favoriteChips.length > 0 ? favoriteChips.map((favorite) => (
              <button
                key={favorite.id}
                type="button"
                className="favorite-chip"
                onClick={() => onSelectCenter?.(
                  [favorite.longitude, favorite.latitude],
                  favoriteDisplayName(favorite) || 'お気に入り',
                )}
              >
                {favoriteDisplayName(favorite) || 'お気に入り'}
              </button>
            )) : (
              <span className="sheet-empty">お気に入りはまだありません</span>
            )}
          </div>
        </section>

        <section className="sheet-section">
          <div className="correction-box">
            <span>自然時補正 <strong>{formatCorrection(correction)}</strong></span>
            <span>経度 <strong>{longitudeLabel}</strong></span>
          </div>
          {status && <p className="sheet-status">{status}</p>}
        </section>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}
