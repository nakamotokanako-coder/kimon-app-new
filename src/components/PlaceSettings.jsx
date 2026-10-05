import React, { useEffect, useState } from 'react';
import Ja from '../utils/Ja.jsx';
import { MAP_SEARCH_STORAGE_KEY, favoriteDisplayName, favoriteKey } from '../reverseDirection/mapSearch.js';
import { DEFAULT_LOCATIONS } from '../reverseDirection/locations.js';
import {
  BASE_POINT_CHANGED_EVENT,
  BASE_POINT_STORAGE_KEY,
  FAVORITES_CHANGED_EVENT,
  USER_DATA_SYNCED_EVENT,
} from '../sync/userDataSync.js';

// 設定の「場所」。基準点（方位を測るもとの場所）と、お気に入りの一覧。
// 保存先は地図と同じ（端末の保存）。ここで消したら、地図にも同じ合図（FAVORITES_CHANGED_EVENT）で伝える。
// 基準点を変えるのは地図の画面（場所を探して選ぶ仕組みがそちらにあるため、ここからは地図へ送る）。

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function readBasePointName() {
  const saved = readJson(BASE_POINT_STORAGE_KEY, null);
  const ok = Number.isFinite(Number(saved?.location?.latitude)) && Number.isFinite(Number(saved?.location?.longitude));
  return ok ? (saved.location.name || DEFAULT_LOCATIONS[0].name) : DEFAULT_LOCATIONS[0].name;
}

export function readFavorites() {
  const list = readJson(MAP_SEARCH_STORAGE_KEY, []);
  return Array.isArray(list) ? list : [];
}

const favoriteName = (item) => favoriteDisplayName(item) || '名前のない場所';

export default function PlaceSettings({ onChangeBasePoint }) {
  const [baseName, setBaseName] = useState(() => readBasePointName());
  const [favorites, setFavorites] = useState(() => readFavorites());
  const [listOpen, setListOpen] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    const refresh = () => {
      setBaseName(readBasePointName());
      setFavorites(readFavorites());
    };
    const events = [BASE_POINT_CHANGED_EVENT, FAVORITES_CHANGED_EVENT, USER_DATA_SYNCED_EVENT, 'focus'];
    events.forEach((name) => window.addEventListener(name, refresh));
    return () => events.forEach((name) => window.removeEventListener(name, refresh));
  }, []);

  const saveFavorites = (next) => {
    try {
      window.localStorage.setItem(MAP_SEARCH_STORAGE_KEY, JSON.stringify(next));
    } catch {
      setNote('端末に保存できませんでした。');
      return false;
    }
    setFavorites(next);
    window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT, { detail: next }));
    return true;
  };

  const removeFavorite = (item) => {
    const name = favoriteName(item);
    if (!window.confirm(`「${name}」をお気に入りから消しますか？`)) return;
    const key = favoriteKey(item);
    if (saveFavorites(favorites.filter((f) => favoriteKey(f) !== key))) setNote(`「${name}」を消しました。`);
  };

  const clearAll = () => {
    if (!window.confirm('この端末に保存した基準点とお気に入りを、すべて消します。元に戻せません。\n「他の端末でも使う」をオンにしている場合は、アカウントの分も消えます。\n\n消しますか？')) return;
    if (!saveFavorites([])) return;
    try {
      window.localStorage.removeItem(BASE_POINT_STORAGE_KEY);
    } catch {
      // 消せなくても、お気に入りは消えている
    }
    // 地図の画面が持っている基準点も最初の状態に戻すため、読み込み直す
    window.location.reload();
  };

  return (
    <>
      <div className="settings-row">
        <div>
          <strong>基準点</strong>
          <small>方位は、ここから測ります。今は「{baseName}」です。</small>
        </div>
        <button type="button" className="settings-action" onClick={onChangeBasePoint}>地図で変える</button>
      </div>

      <button
        type="button"
        className="settings-link-row"
        aria-expanded={listOpen}
        onClick={() => setListOpen((v) => !v)}
      >
        <span>お気に入りの場所（{favorites.length}件）</span>
        <b aria-hidden="true">{listOpen ? '▾' : '›'}</b>
      </button>
      {listOpen && (
        <div className="place-list">
          {favorites.length === 0 ? (
            <p className="place-list-empty"><Ja>まだありません。地図で場所を選んで、☆を押すと登録できます。</Ja></p>
          ) : (
            <ul>
              {favorites.map((item) => (
                <li key={favoriteKey(item)}>
                  <span>
                    <strong>{favoriteName(item)}</strong>
                    <small>{[item.kind === 'home' ? '拠点' : '', item.addressLine || item.subLabel].filter(Boolean).join('・')}</small>
                  </span>
                  <button type="button" onClick={() => removeFavorite(item)} aria-label={`${favoriteName(item)}を消す`}>消す</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {note && <p className="place-note" role="status">{note}</p>}

      <button type="button" className="settings-link-row is-danger" onClick={clearAll}>
        <span>保存した場所をすべて消す</span>
        <b aria-hidden="true">›</b>
      </button>
    </>
  );
}
