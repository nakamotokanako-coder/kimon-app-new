// src/kimon/scoreEngine.js
// 点数判定エンジン（盤全体）。1宮の点数表は palaceScore.js。
// 出典: ◯◯先生「奇門遁甲講座2025」第6章 p78-81

import { PALACE_NAMES } from './kakkyoku.js';
import { detectBanLevel, scoreBoardBanLevel } from './banLevel.js';
import { detectJunri } from './junri.js';
import { applyVetoCap, getPalaceVetoInfo } from './palaceVeto.js';
import {
  scorePalace, getPurposeTags, USABLE_THRESHOLD,
  SCORE_KAN, SCORE_MON, SCORE_KYUSEI, SCORE_HASSHIN, PURPOSE_RULES,
} from './palaceScore.js';

export { scorePalace, getPurposeTags, USABLE_THRESHOLD };
export const MAX_SCORE = 120;
export const JUNRI_BONUS = 20;

// ============================================================
// 盤全体のスコア
// ============================================================

/**
 * 盤全体の点数判定
 * @param {object} board - { meta, palaces }
 * @returns {object}
 */
export function scoreBoard(board) {
  if (!board?.palaces) {
    return {
      palaces: {},
      ban_level: {
        detected: [],
        board_minus: 0,
        total_minus: 0,
        flags: null,
      },
      usable_palaces: [],
      best_overall: null,
      best_by_purpose: {},
      day_kan_palace: null,
      junri_palaces: [],
    };
  }

  // Phase 2A: 盤レベル減点（全宮一律）は banLevel.js から算出。
  // board.banLevel が buildBoard で添付済みなら再利用、なければここで検出する。
  const flags = board.banLevel || detectBanLevel(board);
  const banLevelMinus = scoreBoardBanLevel(flags);
  const detectedNames = [
    flags.kan_fukugin && '干伏吟',
    flags.sei_fukugin && '星伏吟',
    flags.mon_fukugin && '門伏吟',
    flags.sei_hangin && '星反吟',
    flags.mon_hangin && '門反吟',
    flags.gofuguuji && '五不遇時',
  ].filter(Boolean);
  const banLevel = {
    detected: detectedNames,
    board_minus: banLevelMinus,
    total_minus: banLevelMinus, // 互換用エイリアス
    flags,
  };

  // 各宮のスコア
  const palaceScores = {};
  for (const palName of PALACE_NAMES) {
    const palData = board.palaces[palName];
    if (!palData) continue;
    palaceScores[palName] = scorePalace(palData, palName, board.meta, {
      ban_level_minus: banLevelMinus,
    });
  }

  // Phase 3-C (2026-05-22): ◎順利判定。
  // 日干のある宮（無ければ旬首の宮）を起点に、対象宮テーブル上の宮で
  // 「吉門（休/生/開/景）かつ score >= 40」を満たす宮を ◎順利 とする。
  // 評価ランク決定（Phase 3-B）への入力として、各宮に is_junri フラグを付与。
  // detectJunri は順利ボーナス加算前の元スコアで判定する。
  const junri = detectJunri(board, palaceScores);
  for (const palName of PALACE_NAMES) {
    if (palaceScores[palName]) {
      palaceScores[palName].is_junri = junri.junri_palaces.includes(palName);
    }
  }

  // Phase 3-D: 順利ボーナス+20と120点上限クリップ。
  // scorePalace の元スコアは breakdown.raw_score に保持する。
  for (const palName of PALACE_NAMES) {
    const ps = palaceScores[palName];
    if (!ps) continue;

    const rawScore = ps.score;
    const junriBonus = ps.is_junri ? JUNRI_BONUS : 0;
    const withBonus = rawScore + junriBonus;
    const clippedScore = Math.min(withBonus, MAX_SCORE);

    ps.breakdown = {
      ...ps.breakdown,
      junri_bonus: junriBonus,
      raw_score: rawScore,
      clipped: withBonus > MAX_SCORE,
    };
    ps.score = clippedScore;
    ps.usable = clippedScore >= USABLE_THRESHOLD;
  }

  // 拒否権（空亡・三奇入墓・六儀撃刑・五不遇時・天網四張）の点数上限（palaceVeto.js）。
  // 空亡のみ＋開休生門の宮は上限なし（kuubou_relieved=true・効果が遅れやすい注記用）。
  // 上限前の点数は breakdown.pre_veto_score に保持する。
  const boardKey = board.meta?.kyokusu && board.meta?.eto ? `${board.meta.kyokusu}${board.meta.eto}` : null;
  for (const palName of PALACE_NAMES) {
    const ps = palaceScores[palName];
    if (!ps) continue;
    const { vetoes, kuubouRelief } = getPalaceVetoInfo(boardKey, palName);
    ps.vetoes = vetoes;
    if (!vetoes.length) continue;
    ps.kuubou_relieved = kuubouRelief;
    if (ps.kuubou_relieved) continue;
    const capped = applyVetoCap(ps.score, vetoes, kuubouRelief);
    if (capped === ps.score) continue;
    ps.breakdown = { ...ps.breakdown, pre_veto_score: ps.score };
    ps.score = capped;
    ps.usable = capped >= USABLE_THRESHOLD;
    ps.is_junri = false;
  }

  // 使用可能な宮（順利ボーナスとクリップ後のスコアで判定）
  const usablePalaces = Object.entries(palaceScores)
    .filter(([_, s]) => s.usable)
    .map(([name, _]) => name);

  // 最高スコアの宮（順利ボーナスとクリップ後のスコアで判定）
  const bestOverall = Object.entries(palaceScores)
    .reduce((best, [name, s]) => {
      if (!best || s.score > palaceScores[best].score) return name;
      return best;
    }, null);

  // 目的別ベスト宮（順利ボーナスとクリップ後のスコアで判定）
  const bestByPurpose = {};
  for (const purpose of Object.keys(PURPOSE_RULES)) {
    let best = null;
    let bestScore = -Infinity;
    for (const [name, s] of Object.entries(palaceScores)) {
      if (!s.usable) continue; // 使えない宮は除外
      const hasPurpose = s.purposes.some(p => p.purpose === purpose);
      if (hasPurpose && s.score > bestScore) {
        best = name;
        bestScore = s.score;
      }
    }
    bestByPurpose[purpose] = best;
  }

  return {
    palaces: palaceScores,
    ban_level: banLevel,
    usable_palaces: usablePalaces,
    best_overall: bestOverall,
    best_by_purpose: bestByPurpose,
    day_kan_palace: junri.day_kan_palace,
    junri_palaces: junri.junri_palaces,
  };
}

// ============================================================
// エクスポート
// ============================================================

export {
  SCORE_KAN,
  SCORE_MON,
  SCORE_KYUSEI,
  SCORE_HASSHIN,
  PURPOSE_RULES,
};
