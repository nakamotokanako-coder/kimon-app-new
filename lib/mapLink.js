// lib/mapLink.js
// 地図のリンクや座標の文字から、場所（緯度・経度）を取り出す。
// 無料の検索に載っていないお店でも、Googleマップで開いて「共有」のリンクを貼れば場所を出せるようにするためのもの。
// 画面（src）と入口（api/nominatim.js）の両方から使う。Google の API は使わない（リンクの文字を読むだけ）。

const MAP_LINK_RE = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.|maps\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i;

/** 入口でたどってよい、短いリンクのホスト（ここ以外はたどらない） */
export const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);

export function isMapLink(text) {
  return MAP_LINK_RE.test(String(text || '').trim());
}

/** 短いリンク（たどらないと場所が分からないもの）か */
export function isShortMapLink(text) {
  try {
    const url = new URL(String(text || '').trim());
    return SHORT_LINK_HOSTS.has(url.hostname) && (url.hostname !== 'goo.gl' || url.pathname.startsWith('/maps'));
  } catch {
    return false;
  }
}

function validPoint(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/** 「35.6812, 139.7671」のような座標だけの文字 */
export function parseCoordinates(text) {
  const m = String(text || '').trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,、\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  return m ? validPoint(m[1], m[2]) : null;
}

function decodeName(raw) {
  try {
    return decodeURIComponent(String(raw || '').replace(/\+/g, ' ')).trim();
  } catch {
    return String(raw || '').replace(/\+/g, ' ').trim();
  }
}

/**
 * Googleマップのリンク（長い形）から場所を取り出す。
 * @returns {{latitude:number, longitude:number, name:string}|{query:string}|null}
 *   座標が読めれば座標。座標がなく、名前や住所の文字だけ入っているリンクなら { query }。
 */
export function parseMapLink(text) {
  const raw = String(text || '').trim();
  if (!isMapLink(raw)) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const full = `${url.pathname}${url.search}${url.hash}`;
  const nameMatch = url.pathname.match(/\/maps\/place\/([^/@]+)/);
  const name = nameMatch ? decodeName(nameMatch[1]) : '';

  // 1) その場所そのものの座標（!3d緯度!4d経度）
  const pin = full.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const fromPin = pin && validPoint(pin[1], pin[2]);
  if (fromPin) return { ...fromPin, name };

  // 2) q= / query= / ll= / destination= に座標が入っている形
  for (const key of ['q', 'query', 'll', 'destination', 'daddr', 'center']) {
    const value = url.searchParams.get(key);
    const point = value && parseCoordinates(value);
    if (point) return { ...point, name };
  }

  // 3) 地図の中心（@緯度,経度）。場所そのものではなく画面の中心だが、ほぼ同じ位置
  const at = full.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const fromAt = at && validPoint(at[1], at[2]);
  if (fromAt) return { ...fromAt, name };

  // 4) 座標がなく、名前や住所だけ入っている形
  const query = decodeName(url.searchParams.get('q') || url.searchParams.get('query') || '') || name;
  return query ? { query } : null;
}

/**
 * 共有リンクの中の文字（「〒259-1215 神奈川県平塚市寺田縄４９６−１ 神奈川県立…「花菜ガーデン」」のような形）を、
 * 住所として探す文字と、表示する名前に分ける。
 */
export function splitLinkQuery(query) {
  const text = String(query || '')
    .normalize('NFKC')
    .replace(/〒/g, '')
    .replace(/^\s*\d{3}[-‐−ー]?\d{4}\s*/, '')
    .replace(/(\d)[‐−ー](\d)/g, '$1-$2')
    .trim();
  const parts = text.split(/\s+/).filter(Boolean);
  const rest = parts.slice(1).join(' ');
  const quoted = rest.match(/[「『]([^」』]+)[」』]/);
  return {
    search: text,                        // 住所検索に渡す文字（名前が付いていても、住所の部分で見つかる）
    name: (quoted ? quoted[1] : rest) || parts[0] || '',
  };
}
