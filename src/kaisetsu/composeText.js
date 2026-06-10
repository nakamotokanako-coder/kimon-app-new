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

const MAX_LEN = 160;

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
 * 判定オブジェクト＋軸＋バンクから full/short 解説文と内訳を返す（統計・テスト用）。
 * @returns {{ full:string, short:string, reasonSrc:'shoui'|'star'|'gate'|'use',
 *             thirdSrc:'veto'|'god'|'gate'|'none', length:number }}
 */
export function composeDetail(judgment, axis, bank) {
  const { rank, gate, star, starRank, god, godClass, vetoes, shoui, key, palace } = judgment;
  const axisLabel = bank.axisLabels?.[axis] || axis;
  const h = hashSeed(`${key}|${palace}|${axis}`);

  // ---- 1. 結論文（skeletons[rank] から決定的に1本）= short 文 ----
  const skeletons = bank.skeletons?.[rank] || [''];
  const conclusion = skeletons[h % skeletons.length].replace(/\{axis\}/gu, axisLabel);
  const short = finalize([conclusion]);

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
  // guard はメタ情報（統計・検証用。出力テキストには影響しない）。
  let guard = 'none';
  let full = finalize([conclusion, reason, third]);
  if (len(full) > MAX_LEN) {
    third = '';
    thirdSrc = 'none';
    guard = 'drop_third';
    full = finalize([conclusion, reason]);
  }
  if (len(full) > MAX_LEN) {
    reason = reason.split('、')[0];        // 修飾節（読点以降）を削る
    guard = 'trim_reason';
    full = finalize([conclusion, reason]);
  }
  if (len(full) > MAX_LEN) {
    reason = toOneSentence(gateAxisPhrase); // 門の軸フレーズへ差し替え
    reasonSrc = 'gate';
    guard = 'replace_gate';
    full = finalize([conclusion, reason]);
  }

  return { full, short, reasonSrc, thirdSrc, guard, length: len(full) };
}

/**
 * 判定オブジェクト＋軸＋バンクから解説文（full・3文構成）を合成する。
 * @param {object} judgment - classifyPalace の出力（key/palace を含む）
 * @param {string} axis - 'goen'|'shigoto'|'kinun'|'kenko'|'benkyo'
 * @param {object} bank - kaisetsu_bank_v1.json
 * @returns {string} 解説文（3文・目安100〜140字・上限160字）
 */
export function composeText(judgment, axis, bank) {
  return composeDetail(judgment, axis, bank).full;
}

export const AXES = ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'];
