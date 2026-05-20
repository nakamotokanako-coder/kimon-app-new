// src/kimon/kakkyoku.js
// 格局判定エンジン
// 出典: ◯◯先生「奇門遁甲講座2025」第5章 p67-76

import kakkyokuData from '../../data/kakkyoku.json' with { type: 'json' };
import { detectBanLevel } from './banLevel.js';

// ============================================================
// 定数定義
// ============================================================

/** 三吉門 */
const SANKICHI_MON = ['休門', '生門', '開門'];

/** 宮名: 8宮（時盤）。中宮は別途扱い */
export const PALACE_NAMES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];

/** 宮名 → 日本語名 */
export const PALACE_JP = {
  kan: '坎', gon: '艮', shin: '震', son: '巽',
  ri: '離', kun: '坤', da: '兌', ken: '乾',
};

/** 日本語宮名 → 英語キー */
export const PALACE_KEY = Object.fromEntries(
  Object.entries(PALACE_JP).map(([k, v]) => [v, k])
);

// Phase 2A (2026-05-20): 盤レベル判定（伏吟・反吟・門迫・五不遇時）の検出と減点は
// すべて banLevel.js に移管した。そのため以下の定数は不要となり削除済み:
//   PALACE_GOGYO / TAICHU_KYU / KYUSEI_TEII / HACHIMON_TEII /
//   HACHIMON_GOGYO / KOKUSU / GOFUGUUJI
// detectBoardKakkyoku は CSV 生成スクリプト等の互換のため facade として残る。

/** 三吉門判定 */
const isSankichi = (mon) => SANKICHI_MON.includes(mon);

// ============================================================
// ヘルパー
// ============================================================

/**
 * 干支文字列から天干1文字を取り出す
 * "戊申" → "戊"
 */
function getKan(eto) {
  if (!eto || typeof eto !== 'string') return null;
  return eto.charAt(0);
}

/**
 * 複合表記の干を分解
 * "戊丁" → ["戊", "丁"]
 * "戊" → ["戊"]
 */
function splitKan(kanString) {
  if (!kanString) return [];
  const valid = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  return [...kanString].filter(c => valid.includes(c));
}

/**
 * 旬首チェック：その干が旬首かどうか
 * （甲の代用として旬首が宮に置かれているため、その干=旬首ならその宮は「甲」扱い）
 */
function isJunshu(kan, boardMeta) {
  if (!boardMeta?.junshu) return false;
  return kan === boardMeta.junshu;
}

/**
 * 天盤干に旬首が含まれているか（複合表記対応）
 */
function tenbanHasJunshu(palaceData, boardMeta) {
  return splitKan(palaceData.tenban).some(k => isJunshu(k, boardMeta));
}

/**
 * 地盤干に旬首が含まれているか（複合表記対応）
 */
function chibanHasJunshu(palaceData, boardMeta) {
  return splitKan(palaceData.chiban).some(k => isJunshu(k, boardMeta));
}

/**
 * 天盤干に特定の干が含まれているか
 */
function tenbanHas(palaceData, targetKan) {
  return splitKan(palaceData.tenban).includes(targetKan);
}

/**
 * 地盤干に特定の干が含まれているか
 */
function chibanHas(palaceData, targetKan) {
  return splitKan(palaceData.chiban).includes(targetKan);
}

// ============================================================
// 1宮分の格局検出
// ============================================================

/**
 * 1宮の格局を検出
 * @param {object} palaceData - { tenban, chiban, kyusei, hasshin, hachimon }
 * @param {string} palaceName - 'kan' | 'gon' | ...
 * @param {object} boardMeta - 盤メタ（junshu, chokushi, eto_day, eto_year, eto_month, eto_time など）
 * @returns {Array} 該当格局の配列
 */
export function detectPalaceKakkyoku(palaceData, palaceName, boardMeta) {
  if (!palaceData || !palaceName) return [];
  const results = [];

  const t = palaceData.tenban || '';
  const c = palaceData.chiban || '';
  const mon = palaceData.hachimon || '';
  const shin = palaceData.hasshin || '';

  // ---------- 吉格 ----------
  // 注: 青龍返首・飛鳥跌穴は十干剋応（戊丙〇、丙戊〇）と重複するため、
  //     格局判定からは除外し、jukkanKokuou.js で判定する。

  // 天遁: 天=丙, 地=丁, 八門=生門
  if (tenbanHas(palaceData, '丙') && chibanHas(palaceData, '丁') && mon === '生門') {
    results.push(buildResult('天遁', 'kichi'));
  }

  // 地遁: 天=乙, 地=己, 八門=開門
  if (tenbanHas(palaceData, '乙') && chibanHas(palaceData, '己') && mon === '開門') {
    results.push(buildResult('地遁', 'kichi'));
  }

  // 人遁: 天=丁, 八門=休門, 八神=太陰
  if (tenbanHas(palaceData, '丁') && mon === '休門' && shin === '太陰') {
    results.push(buildResult('人遁', 'kichi'));
  }

  // 雲遁A: 天=乙, 地=辛, 八門=三吉門
  if (tenbanHas(palaceData, '乙') && chibanHas(palaceData, '辛') && isSankichi(mon)) {
    results.push(buildResult('雲遁', 'kichi'));
  }
  // 雲遁B: 天=乙, 八門=開門, 宮=坤
  else if (tenbanHas(palaceData, '乙') && mon === '開門' && palaceName === 'kun') {
    results.push(buildResult('雲遁', 'kichi'));
  }

  // 風遁: 天=乙, 八門=三吉門, 宮=巽
  if (tenbanHas(palaceData, '乙') && isSankichi(mon) && palaceName === 'son') {
    results.push(buildResult('風遁', 'kichi'));
  }

  // 龍遁: 天=乙, 八門=休門, 宮=坎
  if (tenbanHas(palaceData, '乙') && mon === '休門' && palaceName === 'kan') {
    results.push(buildResult('龍遁', 'kichi'));
  }

  // 虎遁: 天=乙, 地=辛, 八門=休門, 宮=艮
  if (tenbanHas(palaceData, '乙') && chibanHas(palaceData, '辛') &&
      mon === '休門' && palaceName === 'gon') {
    results.push(buildResult('虎遁', 'kichi'));
  }

  // 神遁: 天=丙, 八門=生門, 八神=九天
  if (tenbanHas(palaceData, '丙') && mon === '生門' && shin === '九天') {
    results.push(buildResult('神遁', 'kichi'));
  }

  // 鬼遁: 天=乙, 八門=(杜門 or 開門), 八神=九地
  if (tenbanHas(palaceData, '乙') &&
      (mon === '杜門' || mon === '開門') && shin === '九地') {
    results.push(buildResult('鬼遁', 'kichi'));
  }

  // 三奇得使
  if (tenbanHas(palaceData, '乙') && (palaceName === 'ken' || palaceName === 'ri')) {
    results.push(buildResult('乙奇得使', 'kichi'));
  }
  if (tenbanHas(palaceData, '丙') && (palaceName === 'kun' || palaceName === 'kan')) {
    results.push(buildResult('丙奇得使', 'kichi'));
  }
  if (tenbanHas(palaceData, '丁') && (palaceName === 'son' || palaceName === 'gon')) {
    results.push(buildResult('丁奇得使', 'kichi'));
  }

  // 三奇昇殿
  if (tenbanHas(palaceData, '乙') && palaceName === 'shin') {
    results.push(buildResult('乙奇昇殿', 'kichi'));
  }
  if (tenbanHas(palaceData, '丙') && palaceName === 'ri') {
    results.push(buildResult('丙奇昇殿', 'kichi'));
  }
  if (tenbanHas(palaceData, '丁') && palaceName === 'da') {
    results.push(buildResult('丁奇昇殿', 'kichi'));
  }

  // 玉女守門: 天=丁, 八門=その盤の直使
  if (tenbanHas(palaceData, '丁') && mon === boardMeta?.chokushi) {
    results.push(buildResult('玉女守門', 'kichi'));
  }

  // ---------- 凶格 ----------

  // 伏宮格: 天=庚, 地=甲(旬首)
  if (tenbanHas(palaceData, '庚') && chibanHasJunshu(palaceData, boardMeta)) {
    results.push(buildResult('伏宮格', 'kyo'));
  }

  // 飛宮格: 天=甲(旬首), 地=庚
  if (tenbanHasJunshu(palaceData, boardMeta) && chibanHas(palaceData, '庚')) {
    results.push(buildResult('飛宮格', 'kyo'));
  }

  // 刑格: 天=庚, 地=己
  // 先生指示(2026-05-18): 十干剋応「官符刑格」(庚己×) とは「算出の種類が異なる」
  // 別概念として扱う。両方を計上するダブル減点(合計-20)が正しい挙動。
  if (tenbanHas(palaceData, '庚') && chibanHas(palaceData, '己')) {
    results.push(buildResult('刑格', 'kyo'));
  }

  // 注: 以下の格局は十干剋応と重複するため、格局判定からは除外:
  //   戦格 → 庚庚 ×太白同宮
  //   大格 → 庚癸 ×反吟大格
  //   小格 → 庚壬 ×金華水流
  //   焚入太白 → 丙庚 ×焚入太白
  //   太白入熒 → 庚丙 ×太白入熒
  // これらは jukkanKokuou.js で判定される。
  // （刑格は上記の通り別概念として復活。庚己→官符刑格(十干剋応)+刑格(格局)）

  // 庚×干（盤レベル凶意）
  const yearKan = getKan(boardMeta?.eto_year);
  const monthKan = getKan(boardMeta?.eto_month);
  const dayKan = getKan(boardMeta?.eto_day);
  const timeKan = getKan(boardMeta?.eto_time);

  // 歳格・月格・日格・伏干・雲干 は年/月/日干支が必要なので
  // CSV事前計算では判定できない（実行時のみ判定）

  // 歳格: 庚×年干
  if (yearKan && tenbanHas(palaceData, '庚') && chibanHas(palaceData, yearKan)) {
    results.push(buildResult('歳格', 'kyo'));
  }
  // 月格: 庚×月干
  if (monthKan && tenbanHas(palaceData, '庚') && chibanHas(palaceData, monthKan)) {
    results.push(buildResult('月格', 'kyo'));
  }
  // 日格 / 伏干: 庚×日干（日格と伏干は同じ条件で両方カウント）
  if (dayKan && tenbanHas(palaceData, '庚') && chibanHas(palaceData, dayKan)) {
    results.push(buildResult('日格', 'kyo'));
    results.push(buildResult('伏干', 'kyo'));
  }
  // 雲干: 日干×庚
  if (dayKan && tenbanHas(palaceData, dayKan) && chibanHas(palaceData, '庚')) {
    results.push(buildResult('雲干', 'kyo'));
  }
  // 時格: 庚×時干（時盤のみ、CSV事前計算可能）
  if (timeKan && boardMeta?.boardType === '時' &&
      tenbanHas(palaceData, '庚') && chibanHas(palaceData, timeKan)) {
    results.push(buildResult('時格', 'kyo'));
  }

  // 三奇を害する凶格
  // 青龍逃走: 乙×辛
  if (tenbanHas(palaceData, '乙') && chibanHas(palaceData, '辛')) {
    results.push(buildResult('青龍逃走', 'kyo'));
  }
  // 白虎猖狂: 辛×乙
  if (tenbanHas(palaceData, '辛') && chibanHas(palaceData, '乙')) {
    results.push(buildResult('白虎猖狂', 'kyo'));
  }
  // 螣蛇妖矯: 癸×丁
  if (tenbanHas(palaceData, '癸') && chibanHas(palaceData, '丁')) {
    results.push(buildResult('螣蛇妖矯', 'kyo'));
  }
  // 朱雀投江: 丁×癸
  if (tenbanHas(palaceData, '丁') && chibanHas(palaceData, '癸')) {
    results.push(buildResult('朱雀投江', 'kyo'));
  }
  // 天羅: 癸×時干
  if (timeKan && tenbanHas(palaceData, '癸') && chibanHas(palaceData, timeKan)) {
    results.push(buildResult('天羅', 'kyo'));
  }
  // 地網: 壬×時干
  if (timeKan && tenbanHas(palaceData, '壬') && chibanHas(palaceData, timeKan)) {
    results.push(buildResult('地網', 'kyo'));
  }

  // 三奇入墓
  if (tenbanHas(palaceData, '乙') && palaceName === 'kun') {
    results.push(buildResult('乙奇入墓', 'kyo'));
  }
  if (tenbanHas(palaceData, '丙') && palaceName === 'ken') {
    results.push(buildResult('丙奇入墓', 'kyo'));
  }
  if (tenbanHas(palaceData, '丁') && palaceName === 'gon') {
    results.push(buildResult('丁奇入墓', 'kyo'));
  }

  // 六儀撃刑格
  const rokugiPairs = [
    ['戊', 'shin', '六儀撃刑格_戊震'],
    ['己', 'kun', '六儀撃刑格_己坤'],
    ['庚', 'gon', '六儀撃刑格_庚艮'],
    ['辛', 'ri', '六儀撃刑格_辛離'],
    ['壬', 'son', '六儀撃刑格_壬巽'],
    ['癸', 'son', '六儀撃刑格_癸巽'],
  ];
  for (const [kan, pal, key] of rokugiPairs) {
    if (tenbanHas(palaceData, kan) && palaceName === pal) {
      results.push(buildResult(key, 'kyo'));
    }
  }

  return results;
}

// ============================================================
// 盤レベル格局検出
// ============================================================

/**
 * 盤全体の盤レベル判定（旧 detectBoardKakkyoku の互換 facade）。
 *
 * Phase 2A 以降、検出ロジックは banLevel.js に移管された。
 * この関数は CSV 生成スクリプトなど旧来の {name} 配列を期待する呼び出し元との
 * 後方互換のために残してある。新コードからは detectBanLevel(board) を直接使うこと。
 *
 * 返却名は新仕様: 干伏吟 / 星伏吟 / 門伏吟 / 星反吟 / 門反吟 / 五不遇時。
 * 門迫・空亡は per-palace 判定に再分類されたため facade からは除外。
 *
 * @param {object} board - { meta, palaces }
 * @returns {Array<{ name: string, count_for_minus: boolean, score: number }>}
 */
export function detectBoardKakkyoku(board) {
  if (!board?.palaces) return [];
  const bl = detectBanLevel(board);
  const out = [];
  if (bl.kan_fukugin) out.push({ name: '干伏吟', count_for_minus: true, score: -10 });
  if (bl.sei_fukugin) out.push({ name: '星伏吟', count_for_minus: true, score: -10 });
  if (bl.mon_fukugin) out.push({ name: '門伏吟', count_for_minus: true, score: -10 });
  if (bl.sei_hangin) out.push({ name: '星反吟', count_for_minus: true, score: -10 });
  if (bl.mon_hangin) out.push({ name: '門反吟', count_for_minus: true, score: -10 });
  if (bl.gofuguuji) out.push({ name: '五不遇時', count_for_minus: true, score: -10 });
  return out;
}

// ============================================================
// スコア集計
// ============================================================

/**
 * 1宮分の格局スコアを返す
 * @param {object} palaceData
 * @param {string} palaceName
 * @param {object} boardMeta
 * @returns {number}
 */
export function scoreKakkyoku(palaceData, palaceName, boardMeta) {
  const results = detectPalaceKakkyoku(palaceData, palaceName, boardMeta);
  return results.reduce((sum, r) => sum + (r.score || 0), 0);
}

// Phase 2A: scoreBanLevel は廃止。盤レベル減点は scoreEngine.js が
// banLevel.js の scoreBoardBanLevel / scorePalaceBanLevel から直接合算する。

// ============================================================
// 結果オブジェクトのビルダー
// ============================================================

function buildResult(key, kichiKyo) {
  const data = kakkyokuData[kichiKyo]?.[key];
  if (!data) {
    return { name: key, kichi_kyo: kichiKyo, score: kichiKyo === 'kichi' ? 10 : -10 };
  }
  return {
    name: data.display_name || key,
    kichi_kyo: kichiKyo,
    category: data.category,
    meaning: data.meaning,
    reading: data.reading,
    score: data.score,
    warning: data.warning,
  };
}

// buildBanLevelResult は scoreBanLevel と共に廃止（banLevel.js に集約）。

export { kakkyokuData };
