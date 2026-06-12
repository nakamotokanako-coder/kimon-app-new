// api/kaisetsu.js
// 解説API（無料・short 専用）: 生成済み解説データ（1080局×8宮×5軸）から short(結論1文) のみを配信する。
//
//   GET /api/kaisetsu?key=<局key>   例: /api/kaisetsu?key=陰1局丁卯
//
// このエンドポイントは【認証非依存・short のみ】。mid・full は一切返さない。
// 同一URLのレスポンスが Cookie で変わらないため、CDN(エッジ)で安全に長期キャッシュできる。
// 課金者向けの mid・full は別エンドポイント /api/kaisetsu-full（private, no-store）で配信する。

import { loadKaisetsu, buildPalaces } from '../lib/kaisetsuData.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const key = typeof req.query?.key === 'string' ? req.query.key.trim() : '';
  if (!key) return res.status(400).json({ error: 'bad_request' });

  const { data, version } = loadKaisetsu();
  const board = data[key];
  if (!board) return res.status(404).json({ error: 'unknown_key' });

  // short のみ（paid 指定なし）。認証非依存・short 固定なのでエッジで長期キャッシュ（3a-1 と同一）。
  const palaces = buildPalaces(board);
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json({ key, version, palaces });
}
