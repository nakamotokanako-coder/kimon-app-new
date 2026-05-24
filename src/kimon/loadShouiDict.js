// src/kimon/loadShouiDict.js
// 十干剋応・格局の象意（解説）辞書ローダー (Phase 3-D)
//
// 出典: 十干剋応と格局の象意_わかりやすい解説_v2.xlsx (先生監修 2026-05-24)
// 形式: { meta, jukan_kokuou[], kakkyoku[], jukan_index_by_name, kakkyoku_index_by_name }
//
// 注: 判定（どの名称が出るか）は既存の jukkanKokuou.js / kakkyoku.js が担当する。
// このローダーは「判定で出た名称 → 解説テキスト」を引くだけ。

import shouiDict from '../../data/shoui_dict.json';

/**
 * 十干剋応の名称から解説エントリを取得。
 *
 * 同名で複数 no を持つのは下記3名称のみ（天盤×地盤の組合せ違いで別配置）:
 *   - 華蓋蓬星 → [9, 73]
 *   - 華蓋孛師 → [18, 74]
 *   - 凶蛇入獄 → [62, 68]
 * これら3名称を引く場合は no の指定が必要。
 *
 * @param {string} name 十干剋応名（記号なし。判定側 jukkanKokuou が返す name と完全一致）
 * @param {number} [no] 同名複数の場合の no
 * @returns {object|null} 該当エントリ or null
 */
export function getJukanShoui(name, no = null) {
  if (!name) return null;
  const indices = shouiDict.jukan_index_by_name?.[name];
  if (!indices || indices.length === 0) return null;

  let targetNo;
  if (indices.length === 1) {
    targetNo = indices[0];
  } else {
    if (no == null) return null; // 同名複数 → no 必須
    if (!indices.includes(no)) return null;
    targetNo = no;
  }
  return shouiDict.jukan_kokuou.find((e) => e.no === targetNo) || null;
}

/**
 * 格局の名称から解説エントリを取得。
 *
 * @param {string} name 格局名（判定側 kakkyoku.js が返す name と一致）
 * @returns {object|null} 該当エントリ or null
 */
export function getKakkyokuShoui(name) {
  if (!name) return null;
  const no = shouiDict.kakkyoku_index_by_name?.[name];
  if (no == null) return null;
  return shouiDict.kakkyoku.find((e) => e.no === no) || null;
}

/**
 * 天盤干×地盤干から no を算出（甲を除く乙〜癸の9種×9種＝81通り）。
 *   no = tenban_index * 9 + chiban_index + 1
 *   tenban_index, chiban_index は KAN_ORDER (0〜8) のインデックス
 *
 * 同名複数（華蓋蓬星 / 華蓋孛師 / 凶蛇入獄）の引き分けに使う。
 *
 * @param {string} tenban 天盤干（乙〜癸の1文字）
 * @param {string} chiban 地盤干（乙〜癸の1文字）
 * @returns {number|null} 1〜81 / 不正入力は null
 */
const KAN_ORDER = ['乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

export function noFromKanPair(tenban, chiban) {
  const t = KAN_ORDER.indexOf(tenban);
  const c = KAN_ORDER.indexOf(chiban);
  if (t < 0 || c < 0) return null;
  return t * 9 + c + 1;
}

/**
 * 天盤干×地盤干から十干剋応の解説エントリを取得。
 * 同名3名称は no で確実に引き分けられる。
 *
 * @param {string} tenban 天盤干
 * @param {string} chiban 地盤干
 * @returns {object|null} 該当エントリ or null
 */
export function getJukanShouiByPair(tenban, chiban) {
  const no = noFromKanPair(tenban, chiban);
  if (no == null) return null;
  return shouiDict.jukan_kokuou.find((e) => e.no === no) || null;
}

/** 辞書本体への参照（テスト用途）。 */
export function getShouiDict() {
  return shouiDict;
}
