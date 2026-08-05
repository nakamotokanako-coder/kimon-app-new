// 三大凶格の拒否権判定
// 出典: shoui_dict.json の kakkyoku 配列で説明文に「三大凶格」を含む3件
export const SANDAI_KYOKAKU = ['伏宮格', '飛宮格', '戦格'];

/**
 * scorePalace() の返り値に三大凶格が含まれるか
 * @param {object|Array} scoreResult - scorePalace() の返り値（detected_kakkyoku を持つ）または detected_kakkyoku 配列
 * @returns {string|null} 該当した格局名（複数該当時は最初の1件）、なければ null
 */
export function detectSandaiKyokaku(scoreResult) {
  const detected = Array.isArray(scoreResult) ? scoreResult : scoreResult?.detected_kakkyoku;
  if (!Array.isArray(detected) || detected.length === 0) return null;
  return detected.find((item) => SANDAI_KYOKAKU.includes(item?.name))?.name || null;
}

/**
 * 格局名の文字列（classifyPalace 側の生カラム値、例 "×飛宮格;×地網"）に三大凶格が含まれるか
 * @param {string|string[]|null|undefined} raw
 * @returns {string|null}
 */
export function detectSandaiKyokakuFromRaw(raw) {
  if (raw === null || raw === undefined) return null;
  const values = Array.isArray(raw) ? raw : [raw];
  for (const value of values) {
    const text = String(value || '');
    if (!text) continue;
    const hit = SANDAI_KYOKAKU.find((name) => text.includes(name));
    if (hit) return hit;
  }
  return null;
}
