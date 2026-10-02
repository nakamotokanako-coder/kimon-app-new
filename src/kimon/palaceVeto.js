// src/kimon/palaceVeto.js
// 宮の拒否権（古典準拠）による点数上限。
//
// 総合スコアは加点式のため、飛鳥跌穴などの吉格が乗ると空亡・三奇入墓の宮でも
// 「大吉」になり、解説エンジン（classifyPalace: 拒否権で願い5軸すべて×）と真逆の結論を
// 出していた。古典の扱いに合わせ、吉方位としては出さないよう点数に上限を掛ける。
//   - 三奇入墓・六儀撃刑・五不遇時・天網四張: 「縦吉宿臨門、不可挙百事」等＝使えない → 凶
//   - 空亡のみ: 「吉不吉、凶不凶」＝吉の効果が出ない → 中立(0)止まり（凶はそのまま）。
//     ただし開・休・生の吉門が同宮なら上限を掛けない（出行で「所往之方遇空亡，但臨開休生吉門…
//     亦不為凶」）。空亡は「時が来れば填実・冲空で実る」＝効果が遅れやすい扱いにとどめる。
// 判定は classifyPalace の Level 1 と同一にして、解説側と食い違わせない。
// 盤レベルの反吟・伏吟は ban_level_minus で減点済みなので対象外。
// 三大凶格（伏宮格・飛宮格・戦格）も拒否権だが、#138 の方針（点数は変えずトーンのみ凶。
// kyoVeto.js / getScoreTone）に従い点数上限の対象外。空亡の救済（遅効）は妨げる。
// 根拠: docs/palace_veto_policy_v1.md

import { lookupChito } from './loadChito.js';
import { classifyPalace } from '../kaisetsu/classifyPalace.js';
import { SANDAI_KYOKAKU } from '../kaisetsu/kyoVeto.js';

export const VETO_KYO_SCORE_CAP = -20;

/**
 * @param {string} boardKey - 局数＋干支（例 '陰6局壬申'）
 * @param {string} palace - 'kan' | 'gon' | ...
 * @returns {string[]} 拒否権の名前（空亡・三奇入墓 など）。該当なし/判定不能は []
 */
export function getPalaceVetoes(boardKey, palace) {
  if (!boardKey) return [];
  try {
    return classifyPalace(lookupChito(boardKey), palace).vetoes
      .filter((name) => name !== '反吟' && name !== '伏吟');
  } catch {
    return [];
  }
}

/** 空亡でも上限を掛けない吉門（開・休・生） */
export const KUUBOU_RELIEF_GATES = ['開門', '休門', '生門'];

/** 空亡だけで、吉門が救っている（＝上限なし・効果が遅れやすい）か */
export function isKuubouRelieved(vetoes, gate) {
  return Boolean(vetoes?.length)
    && vetoes.every((name) => name === '空亡')
    && KUUBOU_RELIEF_GATES.includes(gate);
}

export function applyVetoCap(score, vetoes, gate = '') {
  const capping = (vetoes || []).filter((name) => !SANDAI_KYOKAKU.includes(name));
  if (!capping.length) return score;
  const hardVeto = capping.some((name) => name !== '空亡');
  if (hardVeto) return Math.min(score, VETO_KYO_SCORE_CAP);
  if (isKuubouRelieved(vetoes, gate)) return score;
  return Math.min(score, 0);
}
