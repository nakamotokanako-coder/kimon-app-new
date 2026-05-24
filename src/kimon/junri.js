// src/kimon/junri.js
// ◎順利・秘伝判定エンジン（Phase 3-C）
// 出典: ◯◯先生「奇門遁甲講座2025」順利判定（先生監修 2026-05-22）
//
// 判定ルール:
//   1. 日干のある宮は「天盤の干」で特定する（地盤ではない）。
//      複合表記の天盤干は1文字ずつ分解して日干を探す。
//   2. 日干が天盤のどこにも無い場合、旬首(甲の代用)が乗る宮を代替起点とする。
//      （meta.tenban_junshu_p 優先、無ければ meta.junshu を天盤からスキャン）
//   3. 起点宮に応じた「対象宮テーブル」の各宮について、
//      「八門が吉門(休/生/開/景)」かつ「合計点 >= 40」を満たせば ◎順利。

import { PALACE_NAMES, PALACE_KEY } from './kakkyoku.js';

// ============================================================
// 定数
// ============================================================

/** ◎順利が成立する八門（吉門4種・先生監修 2026-05-22） */
export const JUNRI_KICHIMON = ['休門', '生門', '開門', '景門'];

/** ◎順利の合計点しきい値 */
export const JUNRI_SCORE_THRESHOLD = 40;

/**
 * 対象宮テーブル（先生監修 2026-05-22）
 *   坎→坎兌乾 / 艮→艮離 / 震→震巽坎 / 巽→震巽坎 /
 *   離→離震巽 / 坤→坤離 / 兌→兌乾艮坤 / 乾→兌乾艮坤
 */
export const JUNRI_TARGET_TABLE = {
  kan:  ['kan', 'da',  'ken'],
  gon:  ['gon', 'ri'],
  shin: ['shin', 'son', 'kan'],
  son:  ['shin', 'son', 'kan'],
  ri:   ['ri',  'shin', 'son'],
  kun:  ['kun', 'ri'],
  da:   ['da',  'ken', 'gon', 'kun'],
  ken:  ['da',  'ken', 'gon', 'kun'],
};

// ============================================================
// ヘルパー
// ============================================================

const VALID_KAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

/** 複合表記の天盤干を1文字ずつに分解（kakkyoku/scoreEngine と同等） */
function splitKan(kanString) {
  if (!kanString) return [];
  return [...kanString].filter((c) => VALID_KAN.includes(c));
}

// ============================================================
// 起点宮の特定
// ============================================================

/**
 * 「その日の日干が天盤にある宮」を返す（英字キー）。
 *
 * 探索順:
 *   1) 8宮の天盤干（複合表記は1文字ずつ）に日干が含まれている宮
 *   2) meta.tenban_junshu_p（日本語宮名）が設定されていればその英字キー
 *   3) meta.junshu を天盤からスキャン
 *   4) いずれも該当なし → null
 *
 * @param {Object<string, {tenban?:string}>} palaces - { kan, gon, ..., ken }
 * @param {object} meta - 盤メタ（eto_day, junshu, tenban_junshu_p）
 * @returns {string|null} 'kan' | 'gon' | ... | 'ken' | null
 */
export function findDayKanPalace(palaces, meta) {
  if (!palaces || !meta) return null;
  const dayKan = (meta.eto_day && typeof meta.eto_day === 'string')
    ? meta.eto_day.charAt(0)
    : null;
  if (!dayKan) return null;

  // 1) 天盤に日干あり
  for (const key of PALACE_NAMES) {
    const p = palaces[key];
    if (p && splitKan(p.tenban).includes(dayKan)) return key;
  }

  // 2) tenban_junshu_p（日本語宮名）→ 英字キー
  if (meta.tenban_junshu_p && PALACE_KEY[meta.tenban_junshu_p]) {
    return PALACE_KEY[meta.tenban_junshu_p];
  }

  // 3) junshu を天盤からスキャン
  if (meta.junshu) {
    for (const key of PALACE_NAMES) {
      const p = palaces[key];
      if (p && splitKan(p.tenban).includes(meta.junshu)) return key;
    }
  }

  return null;
}

// ============================================================
// 順利判定
// ============================================================

/**
 * 盤全体の ◎順利 判定。
 *
 * @param {object} board - { meta, palaces }
 * @param {Object<string, {score:number, ...}>} palaceScores - scoreBoard 内で算出済みの各宮スコア
 * @returns {{ day_kan_palace: string|null, targets: string[], junri_palaces: string[] }}
 */
export function detectJunri(board, palaceScores) {
  const empty = { day_kan_palace: null, targets: [], junri_palaces: [] };
  if (!board?.palaces || !palaceScores) return empty;

  const dayKanPalace = findDayKanPalace(board.palaces, board.meta);
  if (!dayKanPalace) return empty;

  const targets = JUNRI_TARGET_TABLE[dayKanPalace] || [];
  const junri_palaces = targets.filter((t) => {
    const pData = board.palaces[t];
    const pScore = palaceScores[t];
    if (!pData || !pScore) return false;
    if (!JUNRI_KICHIMON.includes(pData.hachimon)) return false;
    return pScore.score >= JUNRI_SCORE_THRESHOLD;
  });

  return { day_kan_palace: dayKanPalace, targets, junri_palaces };
}
