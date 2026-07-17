/**
 * 年盤・月盤局数 計算ロジック
 *
 * 【確定データ】(奇門遁甲講座2025_まとめ.md 第2章より・先生教材)
 *   上元 1864-1923: 陰1局
 *   中元 1924-1983: 陰4局
 *   下元 1984-2043: 陰7局 ← 現在
 *   月盤実例: 下元(2024-2028)陰7局 → 上元(2029-2033)陰1局
 *
 * 【標準理論で補完した部分】(要・先生ダブルチェック推奨)
 *   - 三元の入れ子構造は「上元→中元→下元」で局数+3(mod9, 1始まり)ずつ進む
 *     という奇門遁甲の一般原則(局数1→4→7)を、月盤の5年ブロックにも適用。
 *   - 月盤の5年ブロックは、60年の親「元」の開始年から
 *     上元→中元→下元を5年ごとに繰り返す(これは2024-2028/2029-2033の
 *     実例から逆算して検証済み・100%一致)。
 *   - 陰陽(inton_youton)は親の60年区間全体で固定(現在の下元は「陰」で確定)。
 *     2044年以降(次の60年サイクル)の陰陽切替は未確認のため、
 *     このモジュールは 1900-2044 の範囲に限定する。
 *
 * 【year引数について】(§1調査確定・2026-07-17)
 *   ここでの year は西暦(Gregorian year)ではなく「実効年」(立春基準の
 *   年境界に沿った年)を渡すこと。実効年の算出は呼び出し側
 *   (src/kimon/buildBoard.js の resolveKey 内)で、koyomi.eto_year を
 *   使って行う。本モジュール自体は純粋関数のまま(koyomiデータに依存しない)。
 */

const YEAR_ERAS = [
  { label: '上元', start: 1864, end: 1923, kyoku: 1, polarity: '陰' },
  { label: '中元', start: 1924, end: 1983, kyoku: 4, polarity: '陰' },
  { label: '下元', start: 1984, end: 2043, kyoku: 7, polarity: '陰' },
];

const SUBBLOCK_SEQUENCE = [
  { label: '上元', kyoku: 1 },
  { label: '中元', kyoku: 4 },
  { label: '下元', kyoku: 7 },
];

/**
 * 年盤局数を取得
 * @param {number} year - 実効年(立春基準。呼び出し側で eto_year の
 *   切替タイミングに合わせて算出済みであること)
 */
export function getYearKyokusu(year) {
  const era = YEAR_ERAS.find(e => year >= e.start && year <= e.end);
  if (!era) {
    throw new Error(
      `年盤局数: ${year}年は対応範囲外(1864-2043のみ確定データあり。` +
      `2044年以降は次の60年サイクルの陰陽未確認)`
    );
  }
  return {
    era: era.label,
    kyoku: era.kyoku,
    polarity: era.polarity,
    display: `${era.polarity}${era.kyoku}局`,
  };
}

/**
 * 月盤局数を取得
 * @param {number} year - 実効年(月盤局数は5年区切りなので月は不要。
 *   年盤と同じく立春基準の実効年を渡すこと)
 */
export function getMonthKyokusu(year) {
  const parentEra = YEAR_ERAS.find(e => year >= e.start && year <= e.end);
  if (!parentEra) {
    throw new Error(`月盤局数: ${year}年は対応範囲外`);
  }
  const blockIndex = Math.floor((year - parentEra.start) / 5);
  const sub = SUBBLOCK_SEQUENCE[blockIndex % 3];
  const blockStart = parentEra.start + blockIndex * 5;
  const blockEnd = blockStart + 4;
  return {
    era: sub.label,
    kyoku: sub.kyoku,
    polarity: parentEra.polarity, // 親の60年区間で固定
    display: `${parentEra.polarity}${sub.kyoku}局`,
    blockRange: `${blockStart}-${blockEnd}`,
  };
}
