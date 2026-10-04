// src/kaisetsu/boardKey.js
// 解説を引くための鍵。局と干支（例「陰1局丁卯」）に、日盤のときだけ印（@日）を付ける。
//
// 同じ局・干支でも、時盤と日盤では成立する格局が違う:
//   時格・天羅・地網 は「時の干」で決まる格局。日盤には時の干が無いので成立しない
//   （点数の計算 src/kimon/kakkyoku.js も、日盤ではこの3つを数えない）。
// 解説文とテーマ別の◎○×を点数と揃えるため、日盤ではこの3つを外した解説を使う。

export const DAY_KEY_SUFFIX = '@日';

/** 「時の干」で決まり、日盤では成立しない格局 */
export const TIME_ONLY_SHOUI = ['時格', '天羅', '地網'];

/** 盤の情報（board.meta）から解説の鍵を作る */
export function makeKaisetsuKey(meta) {
  if (!meta?.kyokusu || !meta?.eto) return '';
  return `${meta.kyokusu}${meta.eto}${meta.boardType === '日' ? DAY_KEY_SUFFIX : ''}`;
}

/** 解説の鍵 → { key: 局と干支, boardType: '時' | '日' } */
export function parseKaisetsuKey(raw) {
  const text = String(raw || '');
  return text.endsWith(DAY_KEY_SUFFIX)
    ? { key: text.slice(0, -DAY_KEY_SUFFIX.length), boardType: '日' }
    : { key: text, boardType: '時' };
}
