// src/kaisetsu/composeText.js
// 解説生成エンジン Phase 2: 判定オブジェクト＋文言バンクから解説文を合成する純関数。
//
// 文体規定（kaisetsu_rules_v3 §0 / bank.meta）:
//   - 各軸2文（結論＋理由 or 注意）・全角90字目安・最大120字
//   - ソフト断定（〜しやすい/〜に向く）
//   - 凶方位も使い道を残す（◎○△▲× のアイコン相当は rank で表現済み・本文は使い道を示す）
//
// 絶対ルール: src/kimon・CSV/JSON は読み込み専用。本モジュールは bank を引数で受け取るのみ。
// バリエーション選択は決定的（同じ盤は何度生成しても同じ文）。ランダム禁止。

const MAX_LEN = 120;

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

/** 文の配列を「。」で連結し、句読点の崩れを正規化する */
function finalize(parts) {
  const body = parts.map(clip).filter((p) => p.length > 0);
  if (body.length === 0) return '';
  let s = body.join('。') + '。';
  // 連続句点・読点＋句点の崩れを正規化
  s = s.replace(/。{2,}/gu, '。').replace(/、。/gu, '。');
  return s;
}

/** rank の向き（吉=+1 / 凶=-1 / 中立=0）。理由・注意の polarity 一致判定に使う */
function rankDirection(rank) {
  if (rank === '◎' || rank === '○') return 1;
  if (rank === '×' || rank === '▲') return -1;
  return 0;
}

/**
 * 判定オブジェクト＋軸＋バンクから解説文と内訳を返す（統計・テスト用）。
 * @returns {{ text:string, reasonSrc:'shoui'|'star'|'gate'|'use', cautionSrc:'veto'|'shoui'|'god'|'none', length:number }}
 */
export function composeDetail(judgment, axis, bank) {
  const { rank, gate, star, starRank, god, godClass, vetoes, shoui, key, palace } = judgment;
  const axisLabel = bank.axisLabels?.[axis] || axis;

  // ---- 1. 結論文（skeletons[rank] から決定的に1本） ----
  const skeletons = bank.skeletons?.[rank] || [''];
  const pick = hashSeed(`${key}|${palace}|${axis}`) % skeletons.length;
  const conclusion = skeletons[pick].replace(/\{axis\}/gu, axisLabel);

  // ---- 2/4. 理由文 ----
  // 注: shoui の吉凶は CSV 接頭辞ではなくバンク polarity（先生レビュー済）を正とする。
  //     両者は同名でも食い違う場合があり、文の意味はバンク側に従う。
  const gateUse = bank.gates?.[gate]?.use || '';
  const isMourning = gateUse.includes('弔');
  const negativeRank = rank === '▲' || rank === '×';
  const gateAxisPhrase = bank.gates?.[gate]?.axes?.[axis] || '';

  let reason = '';
  let reasonSrc = 'gate';
  if (negativeRank && gateUse && !isMourning) {
    // §4 凶の使い道: ▲/× は「◯◯の用事なら、むしろ向いている」を2文目に
    reason = `${gateUse}の用事なら、むしろ向いている`;
    reasonSrc = 'use';
  } else {
    const dir = rankDirection(rank);
    const hit = shoui.map((n) => bank.shoui?.[n]).find((e) => e && e.polarity === dir && e.phrase);
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

  // ---- 3. 注意文（最大1。無ければ省略） ----
  let caution = '';
  let cautionSrc = 'none';
  if (vetoes.length > 0) {
    const v = bank.vetoes?.[vetoes[0]];
    if (v && v.phrase) {
      caution = v.exception ? `${clip(v.phrase)}。ただし${clip(v.exception)}` : v.phrase;
      cautionSrc = 'veto';
    }
  }
  if (!caution) {
    // veto が無く、バンク上 polarity=-1 の象意が同居していれば注意として添える
    const neg = shoui.map((n) => bank.shoui?.[n]).find((e) => e && e.polarity === -1 && e.phrase);
    if (neg) {
      caution = `ただし${clip(neg.phrase)}には注意`;
      cautionSrc = 'shoui';
    }
  }
  if (!caution && godClass === 'kyo') {
    // 凶神（奇門会合なし）は神の凶意を注意に回せる
    const gd = bank.gods?.[god];
    if (gd && gd.phrase) {
      caution = gd.phrase;
      cautionSrc = 'god';
    }
  }

  // ---- 5. 字数ガード ----
  let text = finalize([conclusion, reason, caution]);
  if (len(text) > MAX_LEN) {
    text = finalize([conclusion, reason]);   // 注意文を落とす
    cautionSrc = 'none';
  }
  if (len(text) > MAX_LEN) {
    reason = gateAxisPhrase;                 // 理由文を門の軸フレーズへ差し替え
    reasonSrc = 'gate';
    text = finalize([conclusion, reason]);
  }

  return { text, reasonSrc, cautionSrc, length: len(text) };
}

/**
 * 判定オブジェクト＋軸＋バンクから解説文を合成する。
 * @param {object} judgment - classifyPalace の出力（key/palace を含む）
 * @param {string} axis - 'goen'|'shigoto'|'kinun'|'kenko'|'benkyo'
 * @param {object} bank - kaisetsu_bank_v1.json
 * @returns {string} 解説文（2〜3文・全角90字目安・最大120字）
 */
export function composeText(judgment, axis, bank) {
  return composeDetail(judgment, axis, bank).text;
}

export const AXES = ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'];
