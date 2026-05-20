// src/kimon/banLevel.js
// 盤レベル判定（Phase 2A: 全面改修）
// 出典: ◯◯先生「奇門遁甲講座2025」/ 先生レビュー回答 (2026-05-19) / 先生指示 2026-05-20 Phase 2A
//
// このモジュールは盤レベル判定と per-palace 減点（門迫・空亡）の全てを担う。
// 旧 kakkyoku.js の detectBoardKakkyoku / scoreBanLevel から移管され、過剰検出を解消した。
//
// 判定一覧:
//   - 干伏吟 (kan_fukugin): 全宮で天盤===地盤 ［全宮 -10］
//   - 星伏吟 (sei_fukugin): 全宮で九星=定位 ［全宮 -10］
//   - 門伏吟 (mon_fukugin): 全宮で八門=定位 ［全宮 -10］
//   - 星反吟 (sei_hangin): 全宮で九星=定位の逆配置 ［全宮 -10］
//   - 門反吟 (mon_hangin): 全宮で八門=定位の逆配置 ［全宮 -10］
//   - 五不遇時 (gofuguuji): 日干×時干の凶組合せ、時盤のみ ［全宮 -10］
//   - 門迫 (monpaku): 4パターン限定の per-palace 減点 ［該当宮 -10］
//       坎+生門 / 震+開門 / 離+休門 / 兌+景門
//   - 空亡 (kuubou): 宮の地支が旬空に該当 ［該当宮 -10］
//
// 中宮は全て判定対象外（PALACE_NAMES が中宮を含まない）。

export const PALACE_NAMES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];

/** 各宮の九星定位 */
const KYUSEI_TEII_BY_PALACE = {
  kan: '天蓬', gon: '天任', shin: '天衝', son: '天輔',
  ri:  '天英', kun: '天芮', da:   '天柱', ken: '天心',
};

/** 各宮の九星反吟（対中宮の九星定位） */
const KYUSEI_HANGIN_BY_PALACE = {
  kan: '天英', gon: '天芮', shin: '天柱', son: '天心',
  ri:  '天蓬', kun: '天任', da:   '天衝', ken: '天輔',
};

/** 各宮の八門定位 */
const HACHIMON_TEII_BY_PALACE = {
  kan: '休門', gon: '生門', shin: '傷門', son: '杜門',
  ri:  '景門', kun: '死門', da:   '驚門', ken: '開門',
};

/** 各宮の八門反吟（対中宮の八門定位） */
const HACHIMON_HANGIN_BY_PALACE = {
  kan: '景門', gon: '死門', shin: '驚門', son: '開門',
  ri:  '休門', kun: '生門', da:   '傷門', ken: '杜門',
};

/** 各宮の地支（空亡判定用） */
const PALACE_ZODIAC = {
  kan: '子', gon: '丑寅', shin: '卯', son: '辰巳',
  ri:  '午', kun: '未申', da:   '酉', ken: '戌亥',
};

/** 門迫 4パターン: 宮 → 該当する八門 */
const MONPAKU_PATTERNS = {
  kan: '生門',  // 土剋水
  shin: '開門', // 金剋木
  ri: '休門',   // 水剋火
  da: '景門',   // 火剋金
};

/** 宮の日本語名（表示用） */
const PALACE_JP = {
  kan: '坎', gon: '艮', shin: '震', son: '巽',
  ri: '離', kun: '坤', da: '兌', ken: '乾',
};

/** 五不遇時の表: 日干 → 凶となる時干 */
const GOFUGUUJI_TABLE = {
  '甲': '庚', '乙': '辛', '丙': '壬', '丁': '癸', '戊': '甲',
  '己': '乙', '庚': '丙', '辛': '丁', '壬': '戊', '癸': '己',
};

/** 九星表記の正規化（天冲↔天衝の同字異体を吸収） */
function normKyusei(s) {
  return s === '天冲' ? '天衝' : s;
}

/** 複合表記の干から先頭1文字を取り出す（旧 detectBoardKakkyoku の流儀を踏襲） */
function firstKan(s) {
  if (!s) return null;
  const valid = '甲乙丙丁戊己庚辛壬癸';
  for (const c of s) if (valid.includes(c)) return c;
  return null;
}

// ============================================================
// 単一判定（全宮一致型）
// ============================================================

/** 干伏吟: 全宮で天盤と地盤の先頭干が一致 */
export function detectKanFukugin(palaces) {
  for (const name of PALACE_NAMES) {
    const p = palaces?.[name];
    if (!p || !p.tenban || !p.chiban) return false;
    const t = firstKan(p.tenban);
    const c = firstKan(p.chiban);
    if (!t || !c || t !== c) return false;
  }
  return true;
}

/** 星伏吟: 全宮で九星が定位通り */
export function detectSeiFukugin(palaces) {
  for (const name of PALACE_NAMES) {
    const p = palaces?.[name];
    if (!p || !p.kyusei) return false;
    if (normKyusei(p.kyusei) !== KYUSEI_TEII_BY_PALACE[name]) return false;
  }
  return true;
}

/** 門伏吟: 全宮で八門が定位通り */
export function detectMonFukugin(palaces) {
  for (const name of PALACE_NAMES) {
    const p = palaces?.[name];
    if (!p || !p.hachimon) return false;
    if (p.hachimon !== HACHIMON_TEII_BY_PALACE[name]) return false;
  }
  return true;
}

/** 星反吟: 全宮で九星が定位の逆配置 */
export function detectSeiHangin(palaces) {
  for (const name of PALACE_NAMES) {
    const p = palaces?.[name];
    if (!p || !p.kyusei) return false;
    if (normKyusei(p.kyusei) !== KYUSEI_HANGIN_BY_PALACE[name]) return false;
  }
  return true;
}

/** 門反吟: 全宮で八門が定位の逆配置 */
export function detectMonHangin(palaces) {
  for (const name of PALACE_NAMES) {
    const p = palaces?.[name];
    if (!p || !p.hachimon) return false;
    if (p.hachimon !== HACHIMON_HANGIN_BY_PALACE[name]) return false;
  }
  return true;
}

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

// ============================================================
// per-palace 判定（該当宮のみ減点）
// ============================================================

/** 門迫: その宮+八門の組合せが 4パターンに該当するか */
export function isMonpakuCell(palaceName, hachimon) {
  return !!hachimon && MONPAKU_PATTERNS[palaceName] === hachimon;
}

/** 空亡: 宮の地支が旬空文字列に1文字でも含まれるか */
export function isKuubouCell(palaceName, kuubouStr) {
  if (!kuubouStr) return false;
  const zodiac = PALACE_ZODIAC[palaceName];
  if (!zodiac) return false;
  for (const c of zodiac) {
    if (kuubouStr.includes(c)) return true;
  }
  return false;
}

/** 門迫該当宮の配列 */
export function detectMonpakuPalaces(palaces) {
  return PALACE_NAMES.filter((n) => isMonpakuCell(n, palaces?.[n]?.hachimon));
}

/** 空亡該当宮の配列 */
export function detectKuubouPalaces(palaces, kuubouStr) {
  if (!kuubouStr) return [];
  return PALACE_NAMES.filter((n) => isKuubouCell(n, kuubouStr));
}

// ============================================================
// 統合: 盤全体の banLevel 構造
// ============================================================

/**
 * 盤全体の盤レベル判定を実行し、構造化された結果を返す。
 * @param {object} board - { meta, palaces }
 * @returns {object} banLevel 構造（buildBoard / MetaPanel / scoreEngine から共通参照）
 */
export function detectBanLevel(board) {
  const palaces = board?.palaces || {};
  const meta = board?.meta || {};
  const dayKan = (meta.eto_day || '').charAt(0);
  const hourKan = meta.boardType === '時' ? (meta.eto_time || '').charAt(0) : '';

  return {
    kan_fukugin: detectKanFukugin(palaces),
    sei_fukugin: detectSeiFukugin(palaces),
    mon_fukugin: detectMonFukugin(palaces),
    sei_hangin: detectSeiHangin(palaces),
    mon_hangin: detectMonHangin(palaces),
    monpaku_palaces: detectMonpakuPalaces(palaces),
    kuubou_palaces: detectKuubouPalaces(palaces, meta.kuubou),
    kuubou_text: meta.kuubou || null,
    gofuguuji: detectGofuguuji(dayKan, hourKan, meta.boardType),
  };
}

// ============================================================
// スコア集計
// ============================================================

/** 全宮 -10 が適用される盤レベル要素のキー */
const BOARD_LEVEL_FLAGS = [
  'kan_fukugin', 'sei_fukugin', 'mon_fukugin',
  'sei_hangin', 'mon_hangin',
  'gofuguuji',
];

/** 盤レベル合算 (-10 × 該当数) を返す。全宮スコアから一律で引かれる */
export function scoreBoardBanLevel(banLevel) {
  if (!banLevel) return 0;
  let count = 0;
  for (const k of BOARD_LEVEL_FLAGS) {
    if (banLevel[k]) count++;
  }
  // 0 件のときは正のゼロを返す（JS の -10*0=-0 を避ける）
  return count === 0 ? 0 : -10 * count;
}

/**
 * per-palace 減点（門迫 / 空亡）を返す。scorePalace から呼ばれる。
 * @returns {{ monpaku: number, kuubou: number }}
 */
export function scorePalaceBanLevel(palaceName, palaceData, kuubouStr) {
  return {
    monpaku: isMonpakuCell(palaceName, palaceData?.hachimon) ? -10 : 0,
    kuubou: isKuubouCell(palaceName, kuubouStr) ? -10 : 0,
  };
}

export { GOFUGUUJI_TABLE, PALACE_JP, PALACE_ZODIAC, MONPAKU_PATTERNS };
