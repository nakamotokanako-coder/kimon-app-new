// lib/kaisetsuData.js
// 解説生成物の読み込みと宮×軸の抽出を一元化する。
// /api/kaisetsu（short専用・CDNキャッシュ）と /api/kaisetsu-full（paid・no-store）の
// 両方から使い、short 抽出を完全に一致させる（drift 防止）。
import { readFileSync } from 'node:fs';

const DATA_URL = new URL('../data/kaisetsu/generated/kaisetsu_text_v2.json', import.meta.url);
const BANK_URL = new URL('../data/kaisetsu/kaisetsu_bank_v1.json', import.meta.url);

export const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
export const AXES = ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'];

let _cache = null;

/** 生成物とバンクversionをモジュールスコープに一度だけ読み込む（コールドスタート後は再利用）。 */
export function loadKaisetsu() {
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

/**
 * 宮×軸を抽出する。paid=false（既定）は short のみ、paid=true は mid・full も同梱。
 * short 抽出ロジックは両エンドポイントで共通＝/api/kaisetsu の short と完全一致する。
 */
export function buildPalaces(board, { paid = false } = {}) {
  const palaces = {};
  for (const palace of PALACES) {
    const axes = board[palace] || {};
    const out = {};
    for (const axis of AXES) {
      const cell = axes[axis];
      if (cell && typeof cell.short === 'string') {
        const entry = { short: cell.short };
        if (paid) {
          if (typeof cell.mid === 'string') entry.mid = cell.mid;
          if (typeof cell.full === 'string') entry.full = cell.full;
        }
        out[axis] = entry;
      }
    }
    palaces[palace] = out;
  }
  return palaces;
}
