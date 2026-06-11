// src/kaisetsu/composeText.js
// 解説生成エンジン Phase 2.5: 判定オブジェクト＋文言バンクから解説文を合成する純関数。
//
// 文体規定 v2（kaisetsu_rules_v3 §0 / bank.meta / Phase 2.5 指示書）:
//   - 構成は3文: 結論 → 理由（1文として展開）→ 補足 or 注意
//   - 文字数 目安100〜140字・上限160字
//   - ソフト断定（〜に向く。/ 〜が出やすい配置。/ 〜は別の日に。）
//   - 凶方位も使い道を残す（▲/× は理由文に使い道を示す。ただし空亡セルは除く）
//   - 禁止表現（AI的な過剰配慮・緩衝材）はテンプレ・接続句・生成文に一切使わない
//
// 3文目（補足 or 注意）の決定（§2-2 全面改修）:
//   1. rank ◎/○ かつ veto あり        → 注意文 = bank.vetoes[キー].caution
//   2. rank ◎/○ かつ veto なし・凶神    → 注意文 = bank.gods[神名].caution
//   3. それ以外                        → 補足文 = bank.gates[gate].axes[axis]
//   ※ ▲/× ランクには注意文を生成しない（結論が既にネガ）。
//   ※ polarity=-1 象意由来の注意（旧仕様）と「ただし{phrase}には注意」は廃止。
//
// 絶対ルール: src/kimon・CSV/JSON は読み込み専用。本モジュールは bank を引数で受け取るのみ。
// バリエーション選択は決定的（同じ盤は何度生成しても同じ文）。ランダム禁止。

import { GOD_KICHI, RANK_UP_GENERAL } from './classifyPalace.js';

const MAX_LEN = 160;       // mid（3文）の上限
const FULL_MAX = 320;      // full（v2・5〜6文）の上限

/** 宮ローカルの拒否権（なのに文・好材料負け型の発動対象。盤全体由来の伏吟・反吟は対象外） */
const CELL_LOCAL_VETOES = new Set(['空亡', '六儀撃刑', '三奇入墓', '天網四張', '五不遇時']);

/**
 * 禁止表現（テンプレ・接続句・生成文に一切使わない）。
 * build_stats / テストの混入0件チェックでも参照する。
 */
export const FORBIDDEN_EXPRESSIONS = [
  'と安心', 'すると良いでしょう', 'してみましょう', '心がけましょう',
  '無理のない範囲で', '焦らずに', 'ゆっくりと', 'リラックスして',
  'かもしれません', '寄り添う', 'あなたらしく', '大切にして',
  'うまく付き合っていきましょう', '意識してみて',
];

/**
 * 注意文の型（caution は名詞句なので「には注意」直前が必ず名詞で終わり破綻しない）。
 * ハッシュで決定的にローテーションする。
 */
const CAUTION_TYPES = [
  (c) => `ただし、${c}には注意`,
  (c) => `気をつけたいのは${c}`,
  (c) => `${c}が出やすい配置でもある`,
];

/** 全角込みの文字数（コードポイント単位） */
function len(s) {
  return [...String(s || '')].length;
}

/** FNV-1a。局key+palace+axis から決定的にバリエーション index を選ぶための安定ハッシュ */
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 末尾の句点を落とす（連結時の二重句点防止） */
function clip(s) {
  return String(s || '').replace(/[。\s]+$/u, '');
}

/**
 * 文中の内部句点「。」を読点「、」に畳み、理由文・補足文を「名詞止め＋断片」ではなく
 * 1文として読ませる（§2-1「名詞の羅列で終わらせず1文として展開」の構造的対処）。
 * 語彙そのものの展開（医薬例の通院/検査など）は v1.2 のバンク改訂で扱う。
 */
function toOneSentence(s) {
  return clip(String(s || '').replace(/。(?=.)/gu, '、'));
}

/** 文の配列を「。」で連結し、句読点の崩れを正規化する */
function finalize(parts) {
  const body = parts.map(clip).filter((p) => p.length > 0);
  if (body.length === 0) return '';
  let s = body.join('。') + '。';
  s = s.replace(/。{2,}/gu, '。').replace(/、。/gu, '。');
  return s;
}

/** rank の向き（吉=+1 / 凶=-1 / 中立=0）。理由文の polarity 一致判定に使う */
function rankDirection(rank) {
  if (rank === '◎' || rank === '○') return 1;
  if (rank === '×' || rank === '▲') return -1;
  return 0;
}

/**
 * 判定オブジェクト＋軸＋バンクから short/mid/full 解説文と内訳を返す（統計・テスト用）。
 *   short = 結論1文 / mid = 現行3文構成（Phase 2.5・文面不変） / full = v2の5〜6文鑑定文
 * @returns {{ short:string, mid:string, full:string,
 *             reasonSrc:string, thirdSrc:string, guard:string, midLength:number,
 *             leadSrc:string, nanoniType:string, reinforceSrc:string, shimeSrc:string,
 *             actionUsed:boolean, fullGuard:string, length:number }}
 */
export function composeDetail(judgment, axis, bank) {
  const { rank, gate, star, starRank, god, godClass, vetoes, shoui, key, palace } = judgment;
  const axisLabel = bank.axisLabels?.[axis] || axis;
  const h = hashSeed(`${key}|${palace}|${axis}`);

  // ---- 1. 結論文（skeletons[rank] から決定的に1本）= short 文 ----
  const skeletons = bank.skeletons?.[rank] || [''];
  const conclusion = skeletons[h % skeletons.length].replace(/\{axis\}/gu, axisLabel);
  const short = finalize([conclusion]);

  // ====================================================================
  // mid（現行3文構成・Phase 2.5）。short/mid は full v2 でも文面不変（差分ゼロ）。
  // ※ 以下のロジック・分岐は一切変更しないこと（出力変数のみ full→mid に改名）。
  // ====================================================================
  // ---- 2. 理由文（1文として展開）----
  const gateUse = bank.gates?.[gate]?.use || '';
  const isMourning = gateUse.includes('弔');
  const negativeRank = rank === '▲' || rank === '×';
  const hasKuubou = vetoes.includes('空亡');
  const gateAxisPhrase = bank.gates?.[gate]?.axes?.[axis] || '';

  let reason = '';
  let reasonSrc = 'gate';
  if (negativeRank && gateUse && !isMourning && !hasKuubou) {
    // §4 凶の使い道: ▲/× は「◯◯の用事なら、むしろ向いている」。
    // §2-3: 空亡セルは「やっても空回り」の本質と矛盾するため使い道文を出さない。
    reason = `${gateUse}の用事なら、むしろ向いている`;
    reasonSrc = 'use';
  } else {
    const dir = rankDirection(rank);
    const hit = dir !== 0
      ? shoui.map((n) => bank.shoui?.[n]).find((e) => e && e.polarity === dir && e.phrase)
      : null;
    if (hit) {
      reason = hit.phrase;          // a. 象意（rank の向きと一致する最上位1件）
      reasonSrc = 'shoui';
    } else if (starRank === 'jokichi' || starRank === 'daikyo') {
      reason = bank.stars?.[star]?.phrase || gateAxisPhrase;  // c. 上吉/大凶の星
      reasonSrc = bank.stars?.[star]?.phrase ? 'star' : 'gate';
    } else {
      reason = gateAxisPhrase;       // b. 門の軸フレーズ
      reasonSrc = 'gate';
    }
  }
  reason = toOneSentence(reason);

  // ---- 3. 3文目（注意 or 補足）----
  const isPositive = rank === '◎' || rank === '○';
  let third = '';
  let thirdSrc = 'none';
  if (isPositive && vetoes.length > 0 && bank.vetoes?.[vetoes[0]]?.caution) {
    third = CAUTION_TYPES[h % CAUTION_TYPES.length](bank.vetoes[vetoes[0]].caution);
    thirdSrc = 'veto';
  } else if (isPositive && vetoes.length === 0 && godClass === 'kyo' && bank.gods?.[god]?.caution) {
    third = CAUTION_TYPES[h % CAUTION_TYPES.length](bank.gods[god].caution);
    thirdSrc = 'god';
  } else {
    // 補足: 軸の具体性を3文目で出す。理由文と重複する場合は置かない（2文に収める）。
    const suppl = toOneSentence(gateAxisPhrase);
    if (suppl && suppl !== reason) {
      third = suppl;
      thirdSrc = 'gate';
    }
  }

  // ---- 4. 字数ガード（上限160）。削り順: 注意/補足 → 理由の修飾節 → 理由を門軸フレーズへ ----
  let guard = 'none';
  let mid = finalize([conclusion, reason, third]);
  if (len(mid) > MAX_LEN) {
    third = '';
    thirdSrc = 'none';
    guard = 'drop_third';
    mid = finalize([conclusion, reason]);
  }
  if (len(mid) > MAX_LEN) {
    reason = reason.split('、')[0];        // 修飾節（読点以降）を削る
    guard = 'trim_reason';
    mid = finalize([conclusion, reason]);
  }
  if (len(mid) > MAX_LEN) {
    reason = toOneSentence(gateAxisPhrase); // 門の軸フレーズへ差し替え
    reasonSrc = 'gate';
    guard = 'replace_gate';
    mid = finalize([conclusion, reason]);
  }

  // ====================================================================
  // full（v2: 判定階層を 5〜6文に展開した鑑定文）
  // ====================================================================
  const f = buildFull(judgment, axis, bank, conclusion, gateAxisPhrase, h);

  return {
    short,
    mid,
    full: f.full,
    // mid メタ（現行統計・テスト互換）
    reasonSrc, thirdSrc, guard, midLength: len(mid),
    // full メタ（v2 統計・テスト用）
    leadSrc: f.leadSrc, nanoniType: f.nanoniType, reinforceSrc: f.reinforceSrc,
    shimeSrc: f.shimeSrc, actionUsed: f.actionUsed, generalUsed: f.generalUsed,
    extraSrc: f.extraSrc, fullGuard: f.fullGuard,
    length: len(f.full),
  };
}

/**
 * full（v2）の合成。構成順: 結論 → 主役 → 補強 → なのに → 行動提案 → 締め。
 * 判定階層（拒否権→象意→門→星→神）を主役選定に反映する。
 */
function buildFull(judgment, axis, bank, conclusion, gateAxisPhrase, h) {
  const { rank, gate, gateClass, star, starRank, god, godClass, vetoes, shoui } = judgment;
  const rankDir = rankDirection(rank);
  const isPositive = rank === '◎' || rank === '○';
  const isNegative = rank === '▲' || rank === '×';
  const gateLabel = bank.gates?.[gate]?.label || '';
  const godLabel = bank.gods?.[god]?.label || '';

  // 補強↔なのに で同一要素（神・星）を二重に語らないための予約フラグ
  let usedGod = false;
  let usedStar = false;
  let usedGoodGate = false; // なのに(好材料負け型)が門ラベルを使ったか（general の二重言及防止）

  // ---- 2. 主役文（判定階層に一致した優先順で1要素を選ぶ）----
  let lead = '';
  let leadSrc = 'gate';
  const rankUpName = shoui.find((n) => RANK_UP_GENERAL.has(n) && bank.shoui?.[n]?.phrase);
  const shouiHit = rankDir !== 0
    ? shoui.find((n) => bank.shoui?.[n] && bank.shoui[n].polarity === rankDir && bank.shoui[n].phrase)
    : null;
  if (vetoes.length > 0 && bank.vetoes?.[vetoes[0]]?.phrase) {
    lead = bank.vetoes[vetoes[0]].phrase;                 // 第1位: 拒否権
    leadSrc = 'veto';
  } else if (rankUpName) {
    lead = bank.shoui[rankUpName].phrase;                 // 第2位: ◎昇格象意
    leadSrc = 'shoui_up';
  } else if (shouiHit) {
    lead = bank.shoui[shouiHit].phrase;                   // 第3位: rank方向の象意
    leadSrc = 'shoui';
  } else if (gateAxisPhrase) {
    // 第4位: 門。門が主役のときは門ラベルを冠して門名を明示する。
    lead = gateLabel ? `${clip(gateLabel)}。${clip(gateAxisPhrase)}` : gateAxisPhrase;
    leadSrc = 'gate';
  } else if (bank.stars?.[star]?.phrase) {
    lead = bank.stars[star].phrase;                       // 第5位: 星
    leadSrc = 'star';
    usedStar = true;
  }

  // ---- 追加スロット（既存フィールドの流用・文言は不変・挿入のみ）----
  // a. 主役が象意 → 直後に shoui.hint を独立1文で（内容重複しない場合のみ）
  // b. 主役が veto → 直後に veto.exception を「ただし〜」で
  let hintText = '';
  let excText = '';
  if (leadSrc === 'shoui_up' || leadSrc === 'shoui') {
    const nm = leadSrc === 'shoui_up' ? rankUpName : shouiHit;
    const ht = bank.shoui?.[nm]?.hint || '';
    if (ht && !lead.includes(ht) && !ht.includes(lead)) hintText = ht;
  } else if (leadSrc === 'veto') {
    const exc = bank.vetoes?.[vetoes[0]]?.exception || '';
    if (exc) excText = `ただし${clip(exc)}`;
  }

  // ---- 4. なのに文（補強より先に確定し要素を予約。1宮最大1本）----
  let nanoni = '';
  let nanoniType = 'none';
  const hasCellLocalVeto = vetoes.some((v) => CELL_LOCAL_VETOES.has(v));
  if (isNegative && hasCellLocalVeto) {
    // 好材料負け型: 宮ローカル拒否権 ∩ (kichi3門 or 実吉神5)
    const goodGate = gateClass === 'kichi3';
    const goodGod = GOD_KICHI.includes(god);
    if (goodGate || goodGod) {
      const goodLabel = goodGate ? gateLabel : godLabel;
      const localVeto = vetoes.find((v) => CELL_LOCAL_VETOES.has(v));
      const dominantLabel = bank.vetoes?.[localVeto]?.label || '';
      if (goodLabel && dominantLabel) {
        nanoni = `${clip(goodLabel)}が入ってはいるものの、${clip(dominantLabel)}の影響が勝つため、その力は十分に発揮されません`;
        nanoniType = 'sukinai';
        if (goodGate) usedGoodGate = true;                 // 門ラベルを使ったら general を出さない
        if (goodGod && !goodGate) usedGod = true;          // 実吉神を使ったら補強で再利用しない
      }
    }
  } else if (isPositive && (godClass === 'kyo' || godClass === 'kyo_muko')) {
    // 悪材料負け型: ◎○ ∩ 凶神
    const badLabel = godLabel;
    const upName = shoui.find((n) => RANK_UP_GENERAL.has(n));
    const dominantLabel = upName ? `${upName}の吉格` : gateLabel;
    // 規則e（主役 vs なのに支配要素）: 支配要素が主役で使った門と同一になる場合は なのに文を省略。
    const dominantIsLeadGate = !upName && leadSrc === 'gate';
    if (badLabel && dominantLabel && !dominantIsLeadGate) {
      nanoni = `${clip(badLabel)}も同居していますが、${clip(dominantLabel)}の勢いが上回るため、大きな妨げにはなりません`;
      nanoniType = 'warukinai';
      usedGod = true;                                      // 凶神を使ったら補強・締めで再利用しない
      if (!upName) usedGoodGate = true;                    // 支配要素に門ラベルを使ったら general を出さない（規則e）
    }
  }

  // ---- 3. 補強文（0〜1本。なのにで予約済みの要素は使わない）----
  let reinforce = '';
  let reinforceSrc = 'none';
  if (!usedGod && (godClass === 'kichi' || godClass === 'kyo') && bank.gods?.[god]?.copresence) {
    reinforce = bank.gods[god].copresence;
    reinforceSrc = 'god';
  } else if (!usedStar && (starRank === 'jokichi' || starRank === 'daikyo') && bank.stars?.[star]?.phrase) {
    reinforce = bank.stars[star].phrase;
    reinforceSrc = 'star';
  }

  // ---- 追加スロット c. 門の総説 general（行動提案文の直前）----
  // 主役が第4位経路（門）または なのにで門ラベルを使った場合は、門の話が重複するため出さない。
  let general = '';
  const gateReferenced = leadSrc === 'gate' || usedGoodGate;
  if (!gateReferenced) general = bank.gates?.[gate]?.general || '';

  // ---- 5. 行動提案文 ----
  let action = bank.gates?.[gate]?.actions?.[axis] || '';
  // 修正(c): ▲/× かつ 吉門(kichi3/chukichi)は actions を出さない。
  //   吉門 actions は吉前提の文体（「向いています」）で、拒否権で凶に落ちた宮では直前の文と矛盾するため。
  //   凶門(shokyo/kyo/daikyo)の actions は「なら使えます」形で ▲× と整合するので必須を維持（死門ルール含め不変）。
  if (isNegative && (gateClass === 'kichi3' || gateClass === 'chukichi')) action = '';
  // 死門特別ルール: goen軸は弔事文を無条件採用可。その他の軸は「むしろ向いています」へ強調しない。
  if (gate === '死門' && axis !== 'goen' && action.includes('むしろ向いています')) action = '';
  const actionUsed = !!action;

  // ---- 6. 締め（注意文・現行ルール・◎○のみ。悪材料負け型で語った凶神は二重にしない）----
  let shime = '';
  let shimeSrc = 'none';
  if (isPositive && vetoes.length > 0 && bank.vetoes?.[vetoes[0]]?.caution) {
    shime = CAUTION_TYPES[h % CAUTION_TYPES.length](bank.vetoes[vetoes[0]].caution);
    shimeSrc = 'veto';
  } else if (isPositive && vetoes.length === 0 && godClass === 'kyo'
             && bank.gods?.[god]?.caution && nanoniType !== 'warukinai' && reinforceSrc !== 'god') {
    // 補強(同居文)で同じ凶神を語っている場合は二重を避けて省略（規則e）。
    shime = CAUTION_TYPES[h % CAUTION_TYPES.length](bank.gods[god].caution);
    shimeSrc = 'god';
  }

  // ---- 組み立て（順: 結論→主役→hint/exception→補強→なのに→general→行動提案→締め）----
  // 字数ガード（上限320）。脱落順: 補強 → なのに → general → hint（exception は保持）→ 主役を門軸へ。
  const parts = () => [conclusion, lead, hintText || excText, reinforce, nanoni, general, action, shime];
  let fullGuard = 'none';
  let full = assembleFull(parts());
  if (len(full) > FULL_MAX) { reinforce = ''; reinforceSrc = 'none'; fullGuard = 'drop_reinforce'; full = assembleFull(parts()); }
  if (len(full) > FULL_MAX) { nanoni = ''; nanoniType = 'none'; fullGuard = 'drop_nanoni'; full = assembleFull(parts()); }
  if (len(full) > FULL_MAX) { general = ''; fullGuard = 'drop_general'; full = assembleFull(parts()); }
  if (len(full) > FULL_MAX) { hintText = ''; fullGuard = 'drop_hint'; full = assembleFull(parts()); }
  if (len(full) > FULL_MAX) { lead = gateAxisPhrase; leadSrc = 'gate'; fullGuard = 'replace_lead'; full = assembleFull(parts()); }

  const extraSrc = hintText ? 'hint' : (excText ? 'exception' : 'none');
  return { full, leadSrc, nanoniType, reinforceSrc, shimeSrc, actionUsed, generalUsed: !!general, extraSrc, fullGuard };
}

/** full の文連結。空・完全一致の重複パートを除いて finalize する（同一フレーズの二重防止）。 */
function assembleFull(parts) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const c = clip(p);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return finalize(out);
}

/**
 * 判定オブジェクト＋軸＋バンクから解説文（full・v2の5〜6文構成）を合成する。
 * @param {object} judgment - classifyPalace の出力（key/palace を含む）
 * @param {string} axis - 'goen'|'shigoto'|'kinun'|'kenko'|'benkyo'
 * @param {object} bank - kaisetsu_bank_v1.json
 * @returns {string} 解説文（full・5〜6文・目安220〜280字・上限320字）
 */
export function composeText(judgment, axis, bank) {
  return composeDetail(judgment, axis, bank).full;
}

export const AXES = ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'];
