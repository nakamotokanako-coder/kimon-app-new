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
  // 「〜配置です。重要な…」を1文にするとき「です、」にならないよう「で、」へつなぐ。
  // 「重さを帯びた星。ただ、〜」は「重さを帯びた星だが、〜」へ（「、ただ、」の重なりを避ける）。
  return clip(String(s || '')
    .replace(/です。(?=.)/gu, 'で、')
    .replace(/。ただ、/gu, 'だが、')
    .replace(/。(?=.)/gu, '、'));
}

/** 文の配列を「。」で連結し、句読点の崩れを正規化する */
function finalize(parts) {
  const body = parts.map(clip).filter((p) => p.length > 0);
  if (body.length === 0) return '';
  let s = body.join('。') + '。';
  s = s.replace(/。{2,}/gu, '。').replace(/、。/gu, '。');
  return s;
}

/**
 * 文言の向き（肯定=+1 / 否定=-1 / どちらとも言えない=0）。
 * 八門の軸フレーズは軸の吉凶と独立に書かれているため、凶の軸に「追い風」、吉の軸に「不向き」が
 * 付いて矛盾していた。向きが軸と逆のフレーズは出さないために使う。
 * 「〜なら働く」「〜だけは進む」のような条件付きの使い道は 0（どちらの軸にも置ける）。
 */
const NEGATIVE_WORDS = /不向き|避けたい|控えめが無難|距離を保ちたい|不適|向かず|消耗|止まる|閉じ気味/;

function phraseTone(text) {
  const t = String(text || '');
  if (!t) return 0;
  if (/なら|だけは|むしろ/.test(t)) return 0;
  if (NEGATIVE_WORDS.test(t)) return -1;
  if (/追い風|最良|好適|絶好|最も適した|すんなり通る|滞りなく通り|整えてくれる|勢いを与える|光が当たり|実りに変わる|強い$|運が整う/.test(t)) return 1;
  return 0;
}

/** 吉門（開・休・生＝kichi3 / 景＝chukichi）。軸フレーズ・使い道はすべて吉前提の文体 */
const GOOD_GATE_CLASSES = new Set(['kichi3', 'chukichi']);

/**
 * 軸の吉凶と逆向きのフレーズなら空にする。
 *   凶の軸: 吉門のフレーズ（すべて吉前提）は置かない。凶門の「〜なら働く」等の使い道は残す。
 *   吉の軸: 「〜には不向きだが…なら働く」のような否定語を含むフレーズも置かない。
 */
function alignTone(text, dir, gateClass = '') {
  if (dir < 0 && GOOD_GATE_CLASSES.has(gateClass)) return '';
  if (dir > 0 && NEGATIVE_WORDS.test(text)) return '';
  return phraseTone(text) * dir < 0 ? '' : text;
}

/** 九星のうち特定の軸にしか当てはまらない文言（天心＝通院や検査）。それ以外の軸では出さない */
const STAR_AXIS_ONLY = { '天心': ['kenko'] };

function starPhraseFor(bank, star, axis) {
  const only = STAR_AXIS_ONLY[star];
  if (only && !only.includes(axis)) return '';
  return bank.stars?.[star]?.phrase || '';
}

/** 言い換えの重複検出に使う並びの長さ（8字以上同じなら同じ内容とみなす） */
const OVERLAP_N = 8;

function ngrams(text) {
  const out = [];
  for (let i = 0; i + OVERLAP_N <= text.length; i++) out.push(text.slice(i, i + OVERLAP_N));
  return out;
}

/**
 * 文章で主に語る拒否権。宮ローカルの重い拒否権（三奇入墓・六儀撃刑など）を空亡より優先し、
 * 盤全体の伏吟・反吟は最後。空亡と三奇入墓が重なる宮で「空亡」だけ語っていたのを防ぐ。
 */
function mainVeto(vetoes) {
  return vetoes.find((v) => CELL_LOCAL_VETOES.has(v) && v !== '空亡')
    || vetoes.find((v) => v === '空亡')
    || vetoes[0];
}

/**
 * 象意の文。テーマ別の文（bank.shoui[名].axes[軸]）があれば「総論（phrase の1文目）＋テーマ別の文」、
 * なければ従来の phrase。象意の phrase はテーマ非依存で、勉強のテーマに「商いごとに追い風」が
 * 出るなど関係の薄い内容になっていたため（docs/shoui_axis_review_v1.md）。
 */
function shouiPhrase(entry, axis) {
  if (!entry?.phrase) return '';
  const line = entry.axes?.[axis];
  if (!line) return entry.phrase;
  return `${clip(entry.phrase.split('。')[0])}。${clip(line)}`;
}

/**
 * 象意の文言エントリ。同じ名前で意味が違う十干剋応（華蓋孛師・華蓋蓬星・凶蛇入獄）は、
 * 判定オブジェクトの shouiVariant（天盤×地盤の組み合わせ番号）で bank.shoui[名].variants を引く。
 */
function shouiEntry(bank, name, judgment) {
  const base = bank.shoui?.[name];
  if (!base) return null;
  const no = judgment?.shouiVariant?.[name];
  const variant = no != null ? base.variants?.[String(no)] : null;
  return variant ? { ...base, ...variant } : base;
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
export function composeDetail(rawJudgment, axis, bank) {
  // 文章の吉凶は、画面で同じ行に出る「テーマ別の◎○×」（軸ランク）に合わせる。
  // 総合ランクで組むと、軸チップ×の下に「追い風が吹く方位」が出るなど食い違っていた（約26%）。
  const axisRank = rawJudgment.axisRanks?.[axis];
  const judgment = axisRank ? { ...rawJudgment, rank: axisRank } : rawJudgment;
  const { rank, gate, star, starRank, god, godClass, vetoes, shoui, key, palace } = judgment;
  const axisLabel = bank.axisLabels?.[axis] || axis;
  const h = hashSeed(`${key}|${palace}|${axis}`);

  // ---- 1. 結論文（skeletons[rank] から決定的に1本）= short 文 ----
  const skeletons = bank.skeletons?.[rank] || [''];
  // {topic} は「健康の用事」「金運を動かす」のような不自然な言い回しを避けるためのテーマ別の言い方
  // （健康→「健康に関する用事」、金運→「お金の用事」など。bank.axisTopics）。
  // {start} は ◎「〜なら、まずこの方角。」の書き出し（金運だけ「金運を動かすなら」。bank.axisStarts）。
  const axisTopic = bank.axisTopics?.[axis] || axisLabel;
  const conclusion = skeletons[h % skeletons.length]
    .replace(/\{axis\}/gu, axisLabel)
    .replace(/\{topic\}/gu, axisTopic)
    .replace(/\{start\}/gu, bank.axisStarts?.[axis] || `${axisTopic}なら`);
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
  const gateAxisPhrase = alignTone(bank.gates?.[gate]?.axes?.[axis] || '', rankDirection(rank), judgment.gateClass);
  const starPhrase = starPhraseFor(bank, star, axis);

  let reason = '';
  let reasonSrc = 'gate';
  if (negativeRank && gateUse && !isMourning && !hasKuubou && !GOOD_GATE_CLASSES.has(judgment.gateClass)) {
    // §4 凶の使い道: ▲/× は「◯◯の用事なら、むしろ向いている」。
    // 吉門の宮（拒否権や軸の事情で凶に落ちた）では「新規の開始ならむしろ向く」等が結論と矛盾するため出さない
    // （full の行動提案の修正(c)と同じ扱い）。
    // §2-3: 空亡セルは「やっても空回り」の本質と矛盾するため使い道文を出さない。
    reason = `${gateUse}の用事なら、むしろ向いている`;
    reasonSrc = 'use';
  } else {
    const dir = rankDirection(rank);
    const hit = dir !== 0
      ? shoui.map((n) => shouiEntry(bank, n, judgment)).find((e) => e && e.polarity === dir && e.phrase)
      : null;
    if (hit) {
      // a. 象意（rank の向きと一致する最上位1件）。mid は3文の短い構成なので、テーマ別の文があれば
      //    それだけを理由文にする（総論と1文につなぐと長く、言い回しも重なるため。総論は full で出す）。
      reason = hit.axes?.[axis] || hit.phrase;
      reasonSrc = 'shoui';
    } else if (starRank === 'jokichi' || starRank === 'daikyo') {
      reason = starPhrase || gateAxisPhrase;  // c. 上吉/大凶の星
      reasonSrc = starPhrase ? 'star' : 'gate';
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
  if (isPositive && judgment.kuubouRelief && bank.vetoes?.['空亡']?.relief) {
    // 空亡＋開休生門（classifyPalace kuubouRelief）: 凶ではなく「遅れて効く」注記。
    third = bank.vetoes['空亡'].relief;
    thirdSrc = 'veto';
  } else if (isPositive && vetoes.length > 0 && bank.vetoes?.[mainVeto(vetoes)]?.caution) {
    third = CAUTION_TYPES[h % CAUTION_TYPES.length](bank.vetoes[mainVeto(vetoes)].caution);
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
  // ◎昇格象意（「最大限に働く」等の絶賛文）は、この軸が吉のときだけ主役にする。
  const rankUpName = isPositive
    ? shoui.find((n) => RANK_UP_GENERAL.has(n) && shouiEntry(bank, n, judgment)?.phrase)
    : null;
  const shouiHit = rankDir !== 0
    ? shoui.find((n) => { const e = shouiEntry(bank, n, judgment); return e && e.polarity === rankDir && e.phrase; })
    : null;
  if (vetoes.length > 0 && !judgment.kuubouRelief && bank.vetoes?.[mainVeto(vetoes)]?.phrase) {
    lead = bank.vetoes[mainVeto(vetoes)].phrase;          // 第1位: 拒否権（吉門で和らぐ空亡は主役にしない）
    leadSrc = 'veto';
  } else if (rankUpName) {
    lead = shouiPhrase(shouiEntry(bank, rankUpName, judgment), axis); // 第2位: ◎昇格象意
    leadSrc = 'shoui_up';
  } else if (shouiHit) {
    lead = shouiPhrase(shouiEntry(bank, shouiHit, judgment), axis);   // 第3位: rank方向の象意
    leadSrc = 'shoui';
  } else if (gateAxisPhrase) {
    // 第4位: 門。門が主役のときは門ラベルを冠して門名を明示する。
    lead = gateLabel ? `${clip(gateLabel)}。${clip(gateAxisPhrase)}` : gateAxisPhrase;
    leadSrc = 'gate';
  } else if (starPhraseFor(bank, star, axis) && !(isNegative && starRank === 'jokichi')) {
    lead = starPhraseFor(bank, star, axis);               // 第5位: 星（凶の軸で上吉星は主役にしない）
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
    // テーマ別の文がある象意では、テーマ非依存の hint は出さない（主役文がテーマ別に具体化済み）。
    const nmEntry = shouiEntry(bank, nm, judgment);
    const ht = nmEntry?.axes?.[axis] ? '' : (nmEntry?.hint || '');
    if (ht && !lead.includes(ht) && !ht.includes(lead)) hintText = ht;
  } else if (leadSrc === 'veto') {
    const lv = mainVeto(vetoes);
    // 伏吟の例外「財の整理や貯蓄など、守りの用事だけは向く」は金運の話なので金運のときだけ。
    const exc = (lv === '伏吟' && axis !== 'kinun') ? '' : (bank.vetoes?.[lv]?.exception || '');
    if (exc) excText = `ただし${clip(exc)}`;
  }

  // ---- 4. なのに文（補強より先に確定し要素を予約。1宮最大1本）----
  let nanoni = '';
  let nanoniType = 'none';
  // 吉門で救済された空亡（kuubouRelief）は「影響が勝つ」主因にしない。
  const hasCellLocalVeto = vetoes.some((v) => CELL_LOCAL_VETOES.has(v) && !(v === '空亡' && judgment.kuubouRelief));
  if (isNegative && hasCellLocalVeto) {
    // 好材料負け型: 宮ローカル拒否権 ∩ (kichi3門 or 実吉神5)
    const goodGate = gateClass === 'kichi3';
    const goodGod = GOD_KICHI.includes(god);
    if (goodGate || goodGod) {
      const goodLabel = goodGate ? gateLabel : godLabel;
      const localVeto = vetoes.find((v) => CELL_LOCAL_VETOES.has(v) && v !== '空亡')
        || vetoes.find((v) => v === '空亡' && !judgment.kuubouRelief);
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
  // 凶の軸で吉神の同居文（「長く続く土台があります」等）をそのまま出すと結論と逆を向くので出さない。
  const godFits = godClass === 'kyo' || (godClass === 'kichi' && !isNegative);
  if (!usedGod && godFits && bank.gods?.[god]?.copresence) {
    reinforce = bank.gods[god].copresence;
    reinforceSrc = 'god';
  } else if (!usedStar && (starRank === 'daikyo' || (starRank === 'jokichi' && !isNegative))
             && starPhraseFor(bank, star, axis)) {
    // 凶の軸で上吉星の褒め文（「幅広く力を貸す」等）は出さない（吉神の同居文と同じ扱い）。
    reinforce = starPhraseFor(bank, star, axis);
    reinforceSrc = 'star';
  }

  // ---- 追加スロット c. 門の総説 general（行動提案文の直前）----
  // 主役が第4位経路（門）または なのにで門ラベルを使った場合は、門の話が重複するため出さない。
  let general = '';
  const gateReferenced = leadSrc === 'gate' || usedGoodGate;
  // 凶の軸では吉門の総説（「万事の入口を開く吉門」等）も結論と逆を向くので出さない。
  if (!gateReferenced && !(isNegative && GOOD_GATE_CLASSES.has(gateClass))) general = bank.gates?.[gate]?.general || '';

  // ---- 5. 行動提案文 ----
  let action = bank.gates?.[gate]?.actions?.[axis] || '';
  // 修正(c): ▲/× かつ 吉門(kichi3/chukichi)は actions を出さない。
  //   吉門 actions は吉前提の文体（「向いています」）で、拒否権で凶に落ちた宮では直前の文と矛盾するため。
  //   凶門(shokyo/kyo/daikyo)の actions は「なら使えます」形で ▲× と整合するので必須を維持（死門ルール含め不変）。
  let fallbackClose = '';
  if (isNegative && (gateClass === 'kichi3' || gateClass === 'chukichi')) {
    action = '';
    // v2.1: 行動提案を出せない▲×∩吉門の宮には、代替の締め文（fallbackClosings）を充てる。
    //   選択は決定的: h(=hash(局key|palace|axis)) % 本数。適用は full のみ。
    //   死門は従来の死門特別ルールを優先し本締め文を重ねない（死門は凶門クラスのため
    //   本来この分岐には入らないが、念のため明示ガード）。
    const fc = bank.fallbackClosings;
    if (gate !== '死門' && Array.isArray(fc) && fc.length) {
      fallbackClose = fc[h % fc.length];
    }
  }
  // 死門特別ルール: goen軸は弔事文を無条件採用可。その他の軸は「むしろ向いています」へ強調しない。
  if (gate === '死門' && axis !== 'goen' && action.includes('むしろ向いています')) action = '';
  const actionUsed = !!action;

  // ---- 6. 締め（注意文・現行ルール・◎○のみ。悪材料負け型で語った凶神は二重にしない）----
  let shime = '';
  let shimeSrc = 'none';
  if (isPositive && judgment.kuubouRelief && bank.vetoes?.['空亡']?.relief) {
    shime = bank.vetoes['空亡'].relief;
    shimeSrc = 'veto';
  } else if (isPositive && vetoes.length > 0 && bank.vetoes?.[mainVeto(vetoes)]?.caution) {
    shime = CAUTION_TYPES[h % CAUTION_TYPES.length](bank.vetoes[mainVeto(vetoes)].caution);
    shimeSrc = 'veto';
  } else if (isPositive && vetoes.length === 0 && godClass === 'kyo'
             && bank.gods?.[god]?.caution && nanoniType !== 'warukinai' && reinforceSrc !== 'god') {
    // 補強(同居文)で同じ凶神を語っている場合は二重を避けて省略（規則e）。
    shime = CAUTION_TYPES[h % CAUTION_TYPES.length](bank.gods[god].caution);
    shimeSrc = 'god';
  }
  // v2.1: ▲×∩吉門で行動提案を出せない宮は、代替締め文を締めに採用する。
  //   従来 ▲× は締め無し（行動提案で終わるか、それも無い）。空いた締めスロットに充当する。
  if (fallbackClose && !shime) {
    shime = fallbackClose;
    shimeSrc = 'fallback';
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

/**
 * full の文連結。空・重複パートを除いて finalize する（同一フレーズの二重防止）。
 * 完全一致に加え、先に置いた文と8字以上同じ並びを含む言い換え（hint と主役文など）も落とす。
 */
function assembleFull(parts) {
  const out = [];
  const seenSentences = new Set();
  const seenGrams = new Set();
  for (const p of parts) {
    const c = clip(p);
    if (!c) continue;
    const own = c.split('。').filter(Boolean);
    if (own.some((x) => seenSentences.has(x) || ngrams(x).some((g) => seenGrams.has(g)))) continue;
    for (const x of own) {
      seenSentences.add(x);
      for (const g of ngrams(x)) seenGrams.add(g);
    }
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
