// src/kaisetsu/classifyPalace.js
// 解説生成エンジン Phase 1: 宮別判定（Level 0〜5）
//
// 原典準拠ルール kaisetsu_rules_v3_final.md の判定階層を実装する純関数。
// chito_v2_with_kakkyoku.csv の1行（1局）と宮キーを受け取り、判定オブジェクトを返す。
//
// 絶対ルール（指示書 claude_code_shiji_kaisetsu_phase1.md）:
//   - src/kimon/ 配下・CSV/JSON データは読み込み専用。本モジュールは import のみ。
//   - 文言バンク・旺相休囚係数・UI 組み込みは Phase 2 以降（ここでは作らない）。
//
// CSV の per-palace カラム（事前計算済み）を読む:
//   tenban_<p> / chiban_<p> / kyusei_<p> / hasshin_<p> / hachimon_<p>
//   jukkan_kokuou_<p> / kakkyoku_<p>（〇◯×△ 接頭辞つき・';' 区切り）
//   board レベル: ban_level / kuubou / junshu / chokufu / chokushi

import { isKuubouCell, isMonpakuCell, PALACE_NAMES } from '../kimon/banLevel.js';
import { SANDAI_KYOKAKU } from './kyoVeto.js';

// ============================================================
// 定数
// ============================================================

/** 総合ランクの梯子（昇順）。index で段の上げ下げを行う */
const RANK_LADDER = ['×', '▲', '△', '○', '◎'];

/** 三奇 */
const SANKI = ['乙', '丙', '丁'];
/** 三吉門 */
const SANKICHI_MON = ['開門', '休門', '生門'];

/**
 * 八門 → { gateClass, base }（Level 2: 基礎ランク）
 *   三吉門=○起点 / 景=○弱(中吉) / 杜=▲(小凶) / 傷驚=▲(凶) / 死=×起点(大凶)
 */
const GATE_TABLE = {
  '開門': { gateClass: 'kichi3', base: '○' },
  '休門': { gateClass: 'kichi3', base: '○' },
  '生門': { gateClass: 'kichi3', base: '○' },
  '景門': { gateClass: 'chukichi', base: '○' },
  '杜門': { gateClass: 'shokyo', base: '▲' },
  '傷門': { gateClass: 'kyo', base: '▲' },
  '驚門': { gateClass: 'kyo', base: '▲' },
  '死門': { gateClass: 'daikyo', base: '×' },
};

/**
 * 凶門被迫（Level 2）: 八門 → 該当宮。gateForce='kyomon_hisako' を立てる（文言用・ランクは変えない）
 *   傷門・杜門 → 坤(kun)艮(gon) / 死門 → 坎(kan) / 驚門 → 震(shin)巽(son)
 * 吉門被迫（開→震/休→離/生→坎/景→兌）は banLevel.isMonpakuCell を再利用する。
 */
const KYOMON_HISAKO = {
  '傷門': ['kun', 'gon'],
  '杜門': ['kun', 'gon'],
  '死門': ['kan'],
  '驚門': ['shin', 'son'],
};

/**
 * 九星 → { starRank, step }（Level 3）
 *   上吉=+1段 / 小吉・小凶=±0(文言のみ) / 大凶=-1段
 *   天冲↔天衝の異体は normStar で吸収。
 */
const STAR_TABLE = {
  '天輔': { starRank: 'jokichi', step: 1 },
  '天禽': { starRank: 'jokichi', step: 1 },
  '天心': { starRank: 'jokichi', step: 1 },
  '天衝': { starRank: 'shokichi', step: 0 },
  '天任': { starRank: 'shokichi', step: 0 },
  '天英': { starRank: 'shokyo', step: 0 },
  '天柱': { starRank: 'shokyo', step: 0 },
  '天芮': { starRank: 'daikyo', step: -1 },
  '天蓬': { starRank: 'daikyo', step: -1 },
};

/** 八神（Level 5） */
const GOD_KICHI = ['直符', '九天', '九地', '太陰', '六合'];
const GOD_KYO = ['玄武', '白虎', '勾陳', '螣蛇', '朱雀'];

/**
 * ◎ 引き上げ格（拒否権非発動時のみ rank を◎へ）。
 * 指示書は「青龍返首・飛鳥跌穴」を明記。固定テスト（陰1局丁卯×kun→◎、丙奇得使）に整合させるため、
 * ルール v3 で「全般◎/最吉」に位置づく三奇得使（乙/丙/丁奇得使）まで拡張した。← 要・先生確認（曖昧点）
 */
const RANK_UP_GENERAL = new Set([
  '青龍返首', '飛鳥跌穴', '乙奇得使', '丙奇得使', '丁奇得使',
]);

/** Level 1 拒否権（該当宮 ×固定）の判定語。空亡は kuubou カラムで別途判定 */
const PALACE_VETO_TERMS = [
  { term: '六儀撃刑', name: '六儀撃刑' },
  { term: '奇入墓', name: '三奇入墓' },   // 乙/丙/丁奇入墓
  { term: '五不遇時', name: '五不遇時' },
  { term: '天網四張', name: '天網四張' },
  ...SANDAI_KYOKAKU.map((name) => ({ term: name, name })),
];

/**
 * 願い5軸（goen=ご縁 / shigoto=仕事 / kinun=金運 / kenko=健康 / benkyo=勉強）への傾き辞典。
 * ルール v3「2. 願い5軸×全要素マッピング」/「Level 4 用途辞典」より作成。
 * ★ Phase 1 の暫定値（-2〜+2）。係数チューニングと網羅は Phase 2 で先生確認。
 */
const GATE_AXIS = {
  '開門': { shigoto: 2 },
  '休門': { goen: 2, kenko: 1 },
  '生門': { kinun: 2, kenko: 2 },
  '景門': { benkyo: 2 },
  '杜門': { benkyo: 1 },
  '傷門': {},
  '驚門': {},
  '死門': { goen: -2, shigoto: -2, kinun: -2, kenko: -2, benkyo: -2 },
};
const STAR_AXIS = {
  '天輔': { benkyo: 1 },
  '天禽': { shigoto: 1 },
  '天心': { kenko: 2, kinun: 1 },
  '天衝': {},
  '天任': { kinun: 1, goen: 1 },
  '天英': { kinun: -1 },
  '天柱': {},
  '天芮': { benkyo: 1, kenko: -1 },
  '天蓬': {},
};
const GOD_AXIS = {
  '直符': { shigoto: 1, benkyo: 1 },
  '九天': { shigoto: 1 },
  '九地': { kinun: 1, kenko: 1 },
  '太陰': { goen: 1 },
  '六合': { goen: 1 },
  '白虎': { goen: -1 },
  '朱雀': { benkyo: -1 },
  '螣蛇': { goen: -1 },
  '玄武': { kinun: -1 },
  '勾陳': {},
};
const SHOUI_AXIS = {
  // 吉
  '玉女守門': { goen: 2 },
  '人遁': { goen: 1, kinun: 1 },
  '地遁': { kinun: 1 },
  '天遁': { shigoto: 1 },
  '神遁': { shigoto: 1 },
  '青龍返首': { shigoto: 2 },
  '飛鳥跌穴': { shigoto: 1, kinun: 1 },
  '乙奇得使': { shigoto: 1 },
  '丙奇得使': { kinun: 1 },
  '丁奇得使': { goen: 1 },
  // 凶
  '青龍逃走': { kinun: -2 },
  '白虎猖狂': { goen: -2 },
  '朱雀投江': { benkyo: -2 },
  '朱雀入江': { benkyo: -2 },
  '螣蛇妖矯': { goen: -1 },
  '螣蛇夭矯': { goen: -1 },
  '官符刑格': { kenko: -2, kinun: -1 },
  '刑格': { kenko: -2, kinun: -1 },
  '小格': { shigoto: -1 },
  '大格': { shigoto: -1 },
  '反吟大格': { shigoto: -1 },
  '伏宮格': { shigoto: -1 },
  '飛宮格': { shigoto: -1 },
  '太白同宮': { shigoto: -1 },
  '五不遇時': { goen: -1, shigoto: -1, kinun: -1, kenko: -1, benkyo: -1 },
};

const AXIS_KEYS = ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'];

/**
 * 象意の言及順（shoui_priority.json の priority_order を内蔵・順序の正本）。
 * src/kaisetsu は data/*.json を直接 import すると node(.mjs スクリプト)と vitest で
 * JSON import 属性の互換が割れるため、ここに同期コピーを持つ。
 * ドリフトは classifyPalace.test.js が data/shoui_priority.json と突き合わせて検出する。
 */
export const PRIORITY_ORDER = [
  '青龍返首', '飛鳥跌穴', '青龍逃走', '焚入太白', '朱雀投江', '太白入熒',
  '官符刑格', '太白同宮', '金華水流', '反吟大格', '白虎猖狂', '伏宮格',
  '飛宮格', '戦格', '大格', '小格', '刑格', '螣蛇妖矯', '五不遇時',
  '玉女守門', '天遁', '地遁', '人遁', '神遁', '鬼遁', '風遁', '虎遁',
  '雲遁', '龍遁',
];
const PRIORITY_INDEX = new Map(PRIORITY_ORDER.map((n, i) => [n, i]));

// ============================================================
// ヘルパー
// ============================================================

/** 九星表記の正規化（天冲→天衝） */
function normStar(s) {
  return s === '天冲' ? '天衝' : s;
}

function rankIdx(r) {
  return RANK_LADDER.indexOf(r);
}
function clampIdx(i) {
  return Math.max(0, Math.min(RANK_LADDER.length - 1, i));
}
/** rank を上限 cap で頭打ちにする */
function capRank(rank, cap) {
  return RANK_LADDER[Math.min(rankIdx(rank), rankIdx(cap))];
}

function axisScoreToRank(score) {
  return RANK_LADDER[clampIdx(Number(score || 0) + 2)];
}

function buildAxisRanks(axes, { boardFukugin, boardHangin, hardVeto, vetoRelief }) {
  const ranks = {};
  for (const k of AXIS_KEYS) ranks[k] = axisScoreToRank(axes[k]);

  if (boardFukugin) {
    for (const k of AXIS_KEYS) ranks[k] = '×';
    ranks.kinun = '△';
  }

  if (boardHangin) {
    for (const k of AXIS_KEYS) ranks[k] = vetoRelief ? '△' : '×';
  }

  if (hardVeto) {
    for (const k of AXIS_KEYS) ranks[k] = '×';
  }

  return ranks;
}

/**
 * jukkan_kokuou_<p> / kakkyoku_<p> を象意リストへ。
 * 〇◯ → polarity +1 / × → -1 / △ → 0。十干剋応を先に並べ、同名は先勝ちで重複排除。
 * @returns {Array<{name:string, polarity:number, score:number}>}
 */
export function parseShoui(row, palace) {
  const seen = new Set();
  const out = [];
  for (const col of [`jukkan_kokuou_${palace}`, `kakkyoku_${palace}`]) {
    const raw = row[col];
    if (!raw) continue;
    for (const tok of raw.split(';')) {
      const t = tok.trim();
      if (!t) continue;
      let polarity = 0;
      let name = t;
      const head = t[0];
      if (head === '〇' || head === '◯') { polarity = 1; name = t.slice(1); }
      else if (head === '×') { polarity = -1; name = t.slice(1); }
      else if (head === '△') { polarity = 0; name = t.slice(1); }
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, polarity, score: polarity * 10 });
    }
  }
  return out;
}

/**
 * 象意を言及順に整列（shoui_priority.json 規則）:
 *   priority_order 掲載分を上から → 残りは fallback（|score| 降順・凶を中立より先・安定）
 */
function orderShoui(items) {
  return [...items]
    .map((it, i) => ({ ...it, _i: i }))
    .sort((a, b) => {
      const pa = PRIORITY_INDEX.has(a.name) ? PRIORITY_INDEX.get(a.name) : Infinity;
      const pb = PRIORITY_INDEX.has(b.name) ? PRIORITY_INDEX.get(b.name) : Infinity;
      if (pa !== pb) return pa - pb;
      // 以降は fallback（priority 非掲載どうし）
      const absA = Math.abs(a.score);
      const absB = Math.abs(b.score);
      if (absA !== absB) return absB - absA;          // 絶対値が大きい順
      const negA = a.score < 0 ? 0 : 1;               // 凶(負)を中立(0)より先に
      const negB = b.score < 0 ? 0 : 1;
      if (negA !== negB) return negA - negB;
      return a._i - b._i;                              // 安定（元の出現順）
    });
}

function addAxes(target, delta) {
  if (!delta) return;
  for (const k of AXIS_KEYS) {
    if (delta[k]) target[k] += delta[k];
  }
}

// ============================================================
// 本体
// ============================================================

/**
 * 1宮の判定オブジェクトを返す純関数。
 * @param {object} row - chito_v2_with_kakkyoku.csv の1行（loadChito の出力形式）
 * @param {string} palace - 'kan'|'gon'|'shin'|'son'|'ri'|'kun'|'da'|'ken'
 * @returns {object} judgment
 */
export function classifyPalace(row, palace) {
  if (!row) throw new Error('classifyPalace: row is required');
  if (!PALACE_NAMES.includes(palace)) {
    throw new Error(`classifyPalace: invalid palace: ${palace}`);
  }

  const gate = row[`hachimon_${palace}`] || '';
  const star = normStar(row[`kyusei_${palace}`] || '');
  const god = row[`hasshin_${palace}`] || '';
  const tenban = row[`tenban_${palace}`] || '';
  const banLevel = row.ban_level || '';
  const kuubouStr = row.kuubou || '';

  const shouiItems = orderShoui(parseShoui(row, palace));
  const shouiNames = shouiItems.map((s) => s.name);

  // 三奇＋三吉門 同居（反吟緩和・凶神無効化の条件）
  const hasSanki = SANKI.some((k) => tenban.includes(k));
  const kimonAtari = hasSanki && SANKICHI_MON.includes(gate);

  // ---- Level 0: 盤全体の拒否権（ban_level） ----
  const boardFukugin = banLevel.includes('伏吟');
  const boardHangin = banLevel.includes('反吟');

  // ---- Level 1: 宮ごとの拒否権（×固定） ----
  const vetoes = [];
  if (isKuubouCell(palace, kuubouStr)) vetoes.push('空亡');
  for (const { term, name } of PALACE_VETO_TERMS) {
    if (shouiNames.some((n) => n.includes(term))) vetoes.push(name);
  }
  const hardVeto = vetoes.length > 0;

  // 盤レベル拒否権は vetoes 末尾に（×固定ではなく上限cap）
  let vetoRelief = null;
  if (boardHangin) {
    vetoes.push('反吟');
    if (kimonAtari) vetoRelief = '反吟だが奇門が蓋う';
  }
  if (boardFukugin) vetoes.push('伏吟');

  // ---- Level 2: 八門で基礎ランク + 門迫 ----
  const g = GATE_TABLE[gate] || { gateClass: 'kyo', base: '▲' };
  const gateClass = g.gateClass;
  let idx = rankIdx(g.base);
  let gateForce = null;
  if (isMonpakuCell(palace, gate)) {
    // 吉門被迫: ランク1段下げ
    gateForce = 'kichimon_hisako';
    idx -= 1;
  } else if ((KYOMON_HISAKO[gate] || []).includes(palace)) {
    // 凶門被迫: 文言用フラグのみ（ランクは変えない）
    gateForce = 'kyomon_hisako';
  }

  // ---- Level 3: 九星で補正 + 天蓬の救済 ----
  const st = STAR_TABLE[star] || { starRank: 'shokichi', step: 0 };
  const starRank = st.starRank;
  let starStep = st.step;
  let tenpouKyusai = false;
  if (star === '天蓬' && gate === '生門' && (tenban.includes('乙') || tenban.includes('丙'))) {
    // 天蓬大凶でも 生門＋乙or丙 同宮なら万事昌栄（-1段を打ち消す）
    tenpouKyusai = true;
    starStep = 0;
  }
  idx = clampIdx(idx + starStep);

  // ---- Level 4: ◎ 引き上げ格（拒否権非発動時のみ） ----
  const hasRankUp = shouiNames.some((n) => RANK_UP_GENERAL.has(n));
  if (hasRankUp && !hardVeto) idx = rankIdx('◎');

  let rank = RANK_LADDER[idx];

  // 盤レベル上限cap（伏吟=▲ / 反吟=▲、ただし奇門で蓋う宮は△）
  if (boardFukugin) rank = capRank(rank, '▲');
  if (boardHangin) rank = capRank(rank, vetoRelief ? '△' : '▲');

  // 宮の拒否権は ×固定（全てに優先）
  if (hardVeto) rank = '×';

  // ---- Level 4: 願い5軸 ----
  const axes = { goen: 0, shigoto: 0, kinun: 0, kenko: 0, benkyo: 0 };
  addAxes(axes, GATE_AXIS[gate]);
  addAxes(axes, STAR_AXIS[star]);
  addAxes(axes, GOD_AXIS[god]);
  for (const n of shouiNames) addAxes(axes, SHOUI_AXIS[n]);
  // 伏吟: 金運軸のみ「守りの用事可」（財の整理・貯蓄）。負へ振り切らないよう下限0で守る
  let fukuginKinunGuard = false;
  if (boardFukugin) {
    fukuginKinunGuard = true;
    if (axes.kinun < 0) axes.kinun = 0;
  }
  for (const k of AXIS_KEYS) axes[k] = Math.max(-2, Math.min(2, axes[k]));
  const axisRanks = buildAxisRanks(axes, { boardFukugin, boardHangin, hardVeto, vetoRelief });

  // ---- Level 5: 八神 ----
  let godClass = GOD_KICHI.includes(god) ? 'kichi' : (GOD_KYO.includes(god) ? 'kyo' : 'kichi');
  if (godClass === 'kyo' && kimonAtari) godClass = 'kyo_muko';

  // ---- patternId ----
  const vetoMain = vetoes[0] || 'none';
  const shouiTop = shouiNames[0] || 'none';
  // patternId は5キー構成（rank_gateClass_starRank_godClass_vetoMain）。
  // 裁定 2026-06: 生の象意名 shouiTop をキーから外し、パターン空間を文言バンク執筆可能な規模に収める。
  // shouiTop は文言合成で使うため判定オブジェクトの別フィールドとして残す。
  const patternId = `${rank}_${gateClass}_${starRank}_${godClass}_${vetoMain}`;

  // 象意は最大4件（指示書）。十干剋応側優先・重複排除済みの言及順上位4。
  const shoui = shouiNames.slice(0, 4);

  return {
    // 局key・宮（Phase 2 composeText の決定的バリエーション hash 用）
    key: row.key,
    palace,
    rank,
    vetoes,
    vetoRelief,
    gate,
    gateClass,
    gateForce,
    star,
    starRank,
    god,
    godClass,
    shoui,
    shouiTop,
    axes,
    axisRanks,
    patternId,
    // 付帯情報（文言生成・デバッグ用。判定の核ではない）
    tenpouKyusai,
    fukuginKinunGuard,
    shouiDetail: shouiItems.slice(0, 4).map(({ name, polarity }) => ({ name, polarity })),
  };
}

export { RANK_LADDER, GATE_TABLE, STAR_TABLE, GOD_KICHI, GOD_KYO, RANK_UP_GENERAL };
