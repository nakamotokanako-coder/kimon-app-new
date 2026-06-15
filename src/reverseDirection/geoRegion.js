// 基準点が日本国内か海外かを判定する純関数ユーティリティ。
// 角度・距離計算（mapFan.js）とは独立させ、地図の背景タイル切替などの
// 表示レイヤ判断にのみ使う。厳密な国境判定はせず、概略バウンディングボックスで足りる。

// 日本の概略バウンディングボックス（離島を含む大まかな範囲）。
// 厳密な領海・領土判定ではなく、地理院タイルが描画できる範囲の近似として使う。
export const JAPAN_BOUNDS = Object.freeze({
  minLat: 24,
  maxLat: 46,
  minLng: 122,
  maxLng: 154,
});

// 座標が日本の概略バウンディングボックス内かどうか。
// 不正値（非有限）は「国内ではない」とは断定せず、海外fallbackを発動させないために false 扱いとする。
export function isInJapan(coords) {
  if (!Array.isArray(coords)) return false;
  const [lat, lng] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= JAPAN_BOUNDS.minLat
    && lat <= JAPAN_BOUNDS.maxLat
    && lng >= JAPAN_BOUNDS.minLng
    && lng <= JAPAN_BOUNDS.maxLng
  );
}

// 座標が海外（日本の概略バウンディングボックス外）かどうか。
// 座標が無効な場合は false（海外と断定しない＝従来の国内タイルのまま）を返す。
export function isOverseas(coords) {
  if (!Array.isArray(coords)) return false;
  const [lat, lng] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return !isInJapan(coords);
}
