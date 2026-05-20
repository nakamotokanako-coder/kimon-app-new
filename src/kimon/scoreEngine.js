// src/kimon/scoreEngine.js
// 点数判定エンジン
// 出典: ◯◯先生「奇門遁甲講座2025」第6章 p78-81

import {
  scoreJukkanKokuou,
  lookupJukkanKokuouMulti,
} from './jukkanKokuou.js';
import {
  detectPalaceKakkyoku,
  PALACE_NAMES,
  PALACE_JP,
} from './kakkyoku.js';
import {
  detectBanLevel,
  scoreBoardBanLevel,
  scorePalaceBanLevel,
} from './banLevel.js';

// ============================================================
// スコア定義（講座p80）
// ============================================================

/** 三奇六儀のスコア（天盤干） */
const SCORE_KAN = {
  '乙': 10, '丙': 10, '丁': 10,
  '戊': 0, '己': 0, '辛': 0, '壬': 0, '癸': 0,
  '庚': -20,
};

/** 八門のスコア */
const SCORE_MON = {
  '休門': 40, '生門': 40, '開門': 40,
  '景門': 20,
  '傷門': 0, '杜門': 0, '死門': 0, '驚門': 0,
};

/** 天蓬九星のスコア */
const SCORE_KYUSEI = {
  '天衝': 10, '天輔': 10, '天心': 10, '天任': 10,
  '天蓬': 0, '天芮': 0, '天禽': 0, '天柱': 0, '天英': 0,
  // 「天冲」表記も同字異体としてサポート
  '天冲': 10,
};

/** 八神のスコア */
const SCORE_HASSHIN = {
  '直符': 20, '太陰': 20, '六合': 20, '九地': 20, '九天': 20,
  '螣蛇': -20, '勾陳': -20, '朱雀': -20,
};

/** 使用可能判定の閾値 */
export const USABLE_THRESHOLD = 40;

// ============================================================
// 目的別ルール（講座p79）
// ============================================================

const PURPOSE_RULES = {
  '恋愛・結婚・健康': {
    main_mon: ['休門'],
    boost_hasshin: ['六合'],
    gender_specific: { male: '九天', female: '九地' },
  },
  '金運': {
    main_mon: ['生門'],
    boost_hasshin: ['直符'],
  },
  '仕事運': {
    main_mon: ['開門'],
    // 朱雀は凶神だが、他要素が吉のときのみ仕事運をブースト
    boost_hasshin_conditional: ['朱雀'],
  },
  '学力': {
    main_mon: ['休門', '景門'],
    boost_hasshin: ['九天', '直符'],
  },
};

// ============================================================
// ヘルパー
// ============================================================

const VALID_KAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

/** 複合表記の干を分解 */
function splitKan(kanString) {
  if (!kanString) return [];
  return [...kanString].filter(c => VALID_KAN.includes(c));
}

/** 天盤干のスコア（複合表記は全合計） */
function calcKanScore(tenban) {
  if (!tenban) return 0;
  return splitKan(tenban).reduce((sum, k) => sum + (SCORE_KAN[k] || 0), 0);
}

// ============================================================
// 1宮のスコア
// ============================================================

/**
 * 1宮の総合スコア
 * @param {object} palaceData - { tenban, chiban, kyusei, hasshin, hachimon }
 * @param {string} palaceName - 'kan' | 'gon' | ...
 * @param {object} boardMeta - { junshu, chokushi, eto_day, eto_year, eto_month, eto_time, boardType, ... }
 * @param {object} options - { ban_level_minus: 盤レベル減点（外から渡す） }
 * @returns {object}
 */
export function scorePalace(palaceData, palaceName, boardMeta, options = {}) {
  if (!palaceData) {
    return { score: 0, usable: false, breakdown: {}, detected_kakkyoku: [], purposes: [] };
  }

  const banLevelMinus = options.ban_level_minus || 0;

  // 各要素のスコア
  const kanScore = calcKanScore(palaceData.tenban);
  const monScore = SCORE_MON[palaceData.hachimon] || 0;
  const kyuseiScore = SCORE_KYUSEI[palaceData.kyusei] || 0;
  const hasshinScore = SCORE_HASSHIN[palaceData.hasshin] || 0;
  const jukkanScore = scoreJukkanKokuou(palaceData.tenban, palaceData.chiban);

  // 格局
  const kakkyokuList = detectPalaceKakkyoku(palaceData, palaceName, boardMeta);
  const kakkyokuScore = kakkyokuList.reduce((sum, k) => sum + (k.score || 0), 0);

  // Phase 2A: per-palace 減点（門迫4パターン・空亡）
  const palaceBan = scorePalaceBanLevel(palaceName, palaceData, boardMeta?.kuubou);

  // 合計
  const subtotal = kanScore + monScore + kyuseiScore + hasshinScore +
                   jukkanScore + kakkyokuScore +
                   palaceBan.monpaku + palaceBan.kuubou;
  const score = subtotal + banLevelMinus;

  // 目的別タグ
  const purposes = getPurposeTags(palaceData);

  return {
    score,
    usable: score >= USABLE_THRESHOLD,
    breakdown: {
      tenban_kan: kanScore,
      hachimon: monScore,
      kyusei: kyuseiScore,
      hasshin: hasshinScore,
      jukkan_kokuou: jukkanScore,
      kakkyoku: kakkyokuScore,
      monpaku: palaceBan.monpaku,
      kuubou: palaceBan.kuubou,
      ban_level_minus: banLevelMinus,
      subtotal,
    },
    detected_kakkyoku: kakkyokuList.map(k => ({
      name: k.name,
      kichi_kyo: k.kichi_kyo,
      score: k.score,
    })),
    purposes,
  };
}

// ============================================================
// 目的別タグ判定
// ============================================================

/**
 * 1宮が該当する目的のタグを返す
 * @param {object} palaceData
 * @returns {object[]} [{ purpose, strength, reasons }]
 *   strength: 'strong' | 'normal' | 'conditional'
 */
export function getPurposeTags(palaceData) {
  if (!palaceData) return [];
  const mon = palaceData.hachimon;
  const shin = palaceData.hasshin;
  const results = [];

  for (const [purpose, rule] of Object.entries(PURPOSE_RULES)) {
    if (!mon || !rule.main_mon.includes(mon)) continue;

    const reasons = [`八門=${mon}`];
    let strength = 'normal';

    // ブースト八神
    if (rule.boost_hasshin?.includes(shin)) {
      strength = 'strong';
      reasons.push(`八神=${shin}（ブースト）`);
    }
    // 条件付きブースト（仕事運の朱雀など）
    if (rule.boost_hasshin_conditional?.includes(shin)) {
      strength = 'conditional';
      reasons.push(`八神=${shin}（他要素が吉のときのみ）`);
    }
    // 性別固有（恋愛の九天/九地）
    if (rule.gender_specific) {
      const { male, female } = rule.gender_specific;
      if (shin === male) {
        reasons.push(`八神=${male}（男性向け）`);
        if (strength === 'normal') strength = 'strong';
      } else if (shin === female) {
        reasons.push(`八神=${female}（女性向け）`);
        if (strength === 'normal') strength = 'strong';
      }
    }

    results.push({ purpose, strength, reasons });
  }

  return results;
}

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

  // 使用可能な宮
  const usablePalaces = Object.entries(palaceScores)
    .filter(([_, s]) => s.usable)
    .map(([name, _]) => name);

  // 最高スコアの宮
  const bestOverall = Object.entries(palaceScores)
    .reduce((best, [name, s]) => {
      if (!best || s.score > palaceScores[best].score) return name;
      return best;
    }, null);

  // 目的別ベスト宮
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
