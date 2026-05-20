// src/kimon/palaceColors.js
// 表示用の吉凶判定ヘルパー（Phase 2B / 先生指示 2026-05-20）
// 凶=赤、吉=青、それ以外=通常 のルールを一箇所に集約。

/** 吉干（三奇） */
const KAN_KICHI = new Set(['乙', '丙', '丁']);
/** 凶干 */
const KAN_KYO = new Set(['庚']);

/** 吉星（天衝/天輔/天心/天任） */
const KYUSEI_KICHI = new Set(['天衝', '天冲', '天輔', '天心', '天任']);
/** 凶星（天蓬/天芮/天柱/天英） */
const KYUSEI_KYO = new Set(['天蓬', '天芮', '天柱', '天英']);
// 中性: 天禽

/** 吉神 */
const HASSHIN_KICHI = new Set(['直符', '太陰', '六合', '九地', '九天']);
/** 凶神 */
const HASSHIN_KYO = new Set(['螣蛇', '勾陳', '朱雀']);

/** 吉門（三吉門＋景門） */
const HACHIMON_KICHI = new Set(['休門', '生門', '開門', '景門']);
/** 凶門 */
const HACHIMON_KYO = new Set(['傷門', '杜門', '死門', '驚門']);

/**
 * 一文字の干が吉/凶/中性 のどれかを返す。
 * @returns {'kichi' | 'kyo' | 'neutral'}
 */
export function kanTone(kan) {
  if (!kan) return 'neutral';
  if (KAN_KICHI.has(kan)) return 'kichi';
  if (KAN_KYO.has(kan)) return 'kyo';
  return 'neutral';
}

export function kyuseiTone(kyusei) {
  if (!kyusei) return 'neutral';
  if (KYUSEI_KICHI.has(kyusei)) return 'kichi';
  if (KYUSEI_KYO.has(kyusei)) return 'kyo';
  return 'neutral';
}

export function hasshinTone(hasshin) {
  if (!hasshin) return 'neutral';
  if (HASSHIN_KICHI.has(hasshin)) return 'kichi';
  if (HASSHIN_KYO.has(hasshin)) return 'kyo';
  return 'neutral';
}

export function hachimonTone(hachimon) {
  if (!hachimon) return 'neutral';
  if (HACHIMON_KICHI.has(hachimon)) return 'kichi';
  if (HACHIMON_KYO.has(hachimon)) return 'kyo';
  return 'neutral';
}

/**
 * tone → CSS クラス名。コンポーネントから直接利用する。
 * neutral は空文字を返す（クラス無し＝通常色）。
 */
export function toneClass(tone) {
  if (tone === 'kichi') return 'tone-kichi';
  if (tone === 'kyo') return 'tone-kyo';
  return '';
}
