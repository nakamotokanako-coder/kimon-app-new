// api/kaisetsu.js
// 解説API Phase 3a: 生成済み解説データ（1080局×8宮×5軸）から short(結論1文) のみを配信する。
//
//   GET /api/kaisetsu?key=<局key>   例: /api/kaisetsu?key=陰1局丁卯
//
// mid・full は課金認証後（Phase 3b）まで一切返さない。クライアント出し分け禁止の原則に従い、
// サーバー側で short のみ抽出して返す（送ってUIで隠す方式は不可）。
//
// データはデプロイ単位で静的。コールドスタート後はモジュールスコープに一度だけ読み込んで再利用する。

import { readFileSync } from 'node:fs';

// 生成物JSON（vercel.json の includeFiles で関数バンドルに同梱）。
const DATA_URL = new URL('../data/kaisetsu/generated/kaisetsu_text_v2.json', import.meta.url);
// バンク（version 取得用。生成物JSONには version が含まれないため）。
const BANK_URL = new URL('../data/kaisetsu/kaisetsu_bank_v1.json', import.meta.url);

const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
const AXES = ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'];

let _cache = null;

/** 生成物とバンクversionをモジュールスコープに一度だけ読み込む（コールドスタート後は再利用）。 */
function load() {
  if (_cache) return _cache;
  const data = JSON.parse(readFileSync(DATA_URL, 'utf8'));
  let version = null;
  try {
    const bank = JSON.parse(readFileSync(BANK_URL, 'utf8'));
    version = bank?.meta?.version ?? null;
  } catch {
    version = null;
  }
  _cache = { data, version };
  return _cache;
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const key = typeof req.query?.key === 'string' ? req.query.key.trim() : '';
  if (!key) return res.status(400).json({ error: 'bad_request' });

  const { data, version } = load();
  const board = data[key];
  if (!board) return res.status(404).json({ error: 'unknown_key' });

  // short のみ抽出して返す。mid・full はレスポンスに一切含めない。
  const palaces = {};
  for (const palace of PALACES) {
    const axes = board[palace] || {};
    const out = {};
    for (const axis of AXES) {
      const cell = axes[axis];
      if (cell && typeof cell.short === 'string') out[axis] = { short: cell.short };
    }
    palaces[palace] = out;
  }

  // デプロイ単位で静的なデータなのでエッジで長期キャッシュ。
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json({ key, version, palaces });
}
