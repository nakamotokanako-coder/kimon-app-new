// src/kimon/jukkanKokuou.js
// 十干剋応の lookup ロジック
// 出典: ◯◯先生「奇門遁甲講座2025」p43-52

import jukkanData from '../../data/jukkanKokuou.json' with { type: 'json' };

const VALID_KAN = ['乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

/**
 * 単一の天盤干×地盤干の組み合わせから十干剋応を引く
 * @param {string} tenban_kan - 天盤干（1文字）
 * @param {string} chiban_kan - 地盤干（1文字）
 * @returns {object|null} { kikkyo, name, reading, meaning } or null
 */
export function lookupJukkanKokuou(tenban_kan, chiban_kan) {
  if (!tenban_kan || !chiban_kan) return null;
  if (!VALID_KAN.includes(tenban_kan) || !VALID_KAN.includes(chiban_kan)) {
    return null; // 甲・空文字・複合表記の単体などは null
  }
  return jukkanData.table[tenban_kan]?.[chiban_kan] ?? null;
}

/**
 * 複合表記（"戊丁"、"丙己" など）を1文字ずつに分解
 * 旬首中宮による2つの値が入る宮の処理
 * @param {string} kanString - 1文字または2文字の干
 * @returns {string[]} 分解された干の配列
 */
export function splitCompoundKan(kanString) {
  if (!kanString) return [];
  return [...kanString].filter(c => VALID_KAN.includes(c) || c === '甲');
}

/**
 * 複合表記対応版の lookup
 * 天盤・地盤いずれかが複合表記の場合、全ペアの結果を配列で返す
 * @param {string} tenban_kan - 天盤干（1〜2文字）
 * @param {string} chiban_kan - 地盤干（1〜2文字）
 * @returns {object[]} lookup結果の配列（空配列の可能性あり）
 */
export function lookupJukkanKokuouMulti(tenban_kan, chiban_kan) {
  const tenbans = splitCompoundKan(tenban_kan);
  const chibans = splitCompoundKan(chiban_kan);
  const results = [];
  for (const t of tenbans) {
    for (const c of chibans) {
      const r = lookupJukkanKokuou(t, c);
      if (r) results.push({ tenban: t, chiban: c, ...r });
    }
  }
  return results;
}

/**
 * 点数判定エンジン用のスコア変換
 * @param {string} kikkyo - "〇" | "△" | "×"
 * @returns {number} スコア
 */
export function kikkyoToScore(kikkyo) {
  return jukkanData.meta.score_for_engine[kikkyo] ?? 0;
}

/**
 * 1宮分のスコアを返す（複合表記対応、複数該当時は平均）
 * 点数判定エンジンから直接呼ぶ用
 * @param {string} tenban_kan
 * @param {string} chiban_kan
 * @returns {number} スコア（該当なしは0）
 */
export function scoreJukkanKokuou(tenban_kan, chiban_kan) {
  const results = lookupJukkanKokuouMulti(tenban_kan, chiban_kan);
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + kikkyoToScore(r.kikkyo), 0);
  return sum / results.length;
}

export { jukkanData };
