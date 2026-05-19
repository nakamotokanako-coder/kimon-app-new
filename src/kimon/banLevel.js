// src/kimon/banLevel.js
// 盤レベル判定（Phase 1: 五不遇時のみ新規実装）
// 出典: ◯◯先生「奇門遁甲講座2025」/ 先生指示 2026-05-19 Phase 1
//
// 注: 伏吟・反吟・門迫の検出は kakkyoku.js の detectBoardKakkyoku が担当。
//     ここでは Phase 1 で新規に必要となった五不遇時のみを実装する。
//     五不遇時の減点値は Phase 2 で先生に確認後に実装予定（今回は検出表示のみ）。

/** 五不遇時の表: 日干 → 凶となる時干 */
const GOFUGUUJI_TABLE = {
  '甲': '庚', '乙': '辛', '丙': '壬', '丁': '癸', '戊': '甲',
  '己': '乙', '庚': '丙', '辛': '丁', '壬': '戊', '癸': '己',
};

/**
 * 五不遇時を判定（時盤のみ判定対象）
 * @param {string} dayKan - 日干（1文字）
 * @param {string} hourKan - 時干（1文字）
 * @param {string} boardType - 盤種（'時' のみ判定対象）
 * @returns {string|null} 該当時は「甲日×庚時」、該当しない時は null
 */
export function detectGofuguuji(dayKan, hourKan, boardType) {
  if (boardType !== '時') return null;
  if (!dayKan || !hourKan) return null;
  if (GOFUGUUJI_TABLE[dayKan] === hourKan) {
    return `${dayKan}日×${hourKan}時`;
  }
  return null;
}

export { GOFUGUUJI_TABLE };
