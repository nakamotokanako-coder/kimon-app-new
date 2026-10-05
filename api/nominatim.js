// GET /api/nominatim
//   ?q=...&viewbox=...        地図に見えている範囲の中を探す（カフェなどの種類・名前）
//   ?q=...&scope=jp           日本全国を名前で探す（住所の内訳つき・10件）
//   ?resolve=<地図のリンク>     Googleマップの短いリンクをたどって、場所（緯度・経度）を返す
// いずれも無料（OpenStreetMap の Nominatim。Google の API は使わない）。
import { isMapLink, isShortMapLink, parseMapLink } from '../lib/mapLink.js';

const USER_AGENT = 'kimon-app/1.0 (https://kimon-tonko.vercel.app/)';

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 短いリンクをたどる。たどってよいのは Google マップの短いリンクだけ。行き先も Google マップであることを確かめる。
async function resolveMapLink(link, res) {
  if (!isMapLink(link)) return res.status(400).json({ error: 'not_map_link' });
  const direct = parseMapLink(link);
  if (direct && 'latitude' in direct) return res.status(200).json(direct);
  if (!isShortMapLink(link)) return res.status(200).json(direct || { error: 'no_location' });
  // 短いリンクは「行き先のリンク」を返すだけなので、その行き先の文字を読む。
  // 行き先のページそのもの（google.com）は開かない。開くと、サーバーからのアクセスだと
  // 確認ページなどに回されることがあり、場所を読めたり読めなかったりした。
  try {
    let current = link;
    for (let hop = 0; hop < 4; hop += 1) {
      const response = await fetchWithTimeout(current, {
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ja' },
      });
      const location = response.headers?.get?.('location') || '';
      if (!location) break;
      const next = new URL(location, current).toString();
      if (!isMapLink(next)) break;
      const parsed = parseMapLink(next);
      // 座標が入っていればそれを、入っていなければ中の「住所＋名前」の文字を返す（画面の側が、その住所で探す）
      if (parsed) return res.status(200).json(parsed);
      if (!isShortMapLink(next)) break;
      current = next;
    }
    console.warn('[nominatim] map link had no readable location');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ error: 'no_location' });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'resolve_failed' });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const resolve = String(req.query.resolve || '').trim();
  if (resolve) {
    res.setHeader('Cache-Control', 's-maxage=86400');
    return resolveMapLink(resolve, res);
  }

  const q = String(req.query.q || '').trim();
  const viewbox = String(req.query.viewbox || '').trim();
  const nationwide = req.query.scope === 'jp';
  if (!q) return res.status(400).json({ error: 'missing q' });

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('accept-language', 'ja');
  if (nationwide) {
    url.searchParams.set('limit', '10');
    url.searchParams.set('countrycodes', 'jp');
    url.searchParams.set('addressdetails', '1');
    if (req.query.layer === 'poi') url.searchParams.set('layer', 'poi');
  } else {
    url.searchParams.set('limit', '40'); // Nominatim の上限
    url.searchParams.set('addressdetails', '0');
    if (viewbox) {
      url.searchParams.set('viewbox', viewbox);
      url.searchParams.set('bounded', '1');
    }
  }

  try {
    const response = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) {
      return res.status(502).json({ error: 'nominatim upstream', status: response.status });
    }
    const json = await response.json();
    // 同じ言葉の検索は、しばらく同じ答えを返す（無料の検索サーバーに何度も問い合わせない）
    res.setHeader('Cache-Control', nationwide ? 's-maxage=3600' : 's-maxage=300');
    return res.status(200).json(json);
  } catch {
    return res.status(502).json({ error: 'nominatim failed' });
  }
}
