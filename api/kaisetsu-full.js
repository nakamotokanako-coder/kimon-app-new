// api/kaisetsu-full.js
// 解説API（全機能の利用者向け・short+mid+full）: 有効セッション かつ 全機能を使える人だけに配信する
// （判定は lib/accessPolicy.js。ベータ期間はログイン済みなら可、販売開始後は user.status==='paid'）。
//
//   GET /api/kaisetsu-full?key=<局key>
//
// 【重要】このエンドポイントは Cookie によって中身が変わるため、CDN(エッジ)に絶対に載せない。
//   Cache-Control: private, no-store（+ Vary: Cookie）でキャッシュを全面禁止する。
//   Vercel CDN は URL 単位でキャッシュし Cookie を見ないため、s-maxage 等を付けると
//   paid の mid/full が未認証ユーザーに配布される（ペイウォール崩壊）。付けてはならない。
//
// 課金判定はすべてサーバーサイド。クライアント出し分けは禁止。
import { loadKaisetsu, buildPalaces } from '../lib/kaisetsuData.js';
import { getActiveSession } from '../lib/auth.js';

/** 有効セッション かつ 全機能を使える人（lib/accessPolicy.js: ベータ期間はログイン済み、販売後は paid）だけ true。 */
async function canReadFull(req) {
  const active = await getActiveSession(req);
  return Boolean(active?.full);
}

export default async function handler(req, res) {
  // どの分岐でも絶対にエッジへ載せない（最初に固定）。
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const key = typeof req.query?.key === 'string' ? req.query.key.trim() : '';
  if (!key) return res.status(400).json({ error: 'bad_request' });

  if (!(await canReadFull(req))) {
    // 全機能を使えない人には full を一切返さない（存在は秘匿せず明示的に拒否）。
    return res.status(403).json({ error: 'forbidden' });
  }

  const { data, version } = loadKaisetsu();
  const board = data[key];
  if (!board) return res.status(404).json({ error: 'unknown_key' });

  const palaces = buildPalaces(board, { paid: true });
  return res.status(200).json({ key, version, palaces });
}
