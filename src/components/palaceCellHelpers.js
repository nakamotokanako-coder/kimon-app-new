// src/components/palaceCellHelpers.js
// PalaceCell から切り出した pure helper（テスト可能性のため）。

/**
 * 宮セル内の情報リスト（十干剋応＋格局）を統一順序で組み立てる。
 *
 * Phase 2D 要件1: 全宮で表示順を統一する。
 *   - 上段: 十干剋応 (detected_jukkan)
 *   - 下段: 格局      (detected_kakkyoku)
 *
 * 返り値: [{ kind: 'jukkan'|'kakkyoku', ...originalProps }]
 *
 * @param {Array} detectedJukkan - lookupJukkanKokuouMulti の結果配列
 * @param {Array} detectedKakkyoku - detectPalaceKakkyoku の結果配列
 */
export function buildInfoItems(detectedJukkan, detectedKakkyoku) {
  const items = [];
  for (const j of detectedJukkan || []) {
    items.push({ kind: 'jukkan', ...j });
  }
  for (const k of detectedKakkyoku || []) {
    items.push({ kind: 'kakkyoku', ...k });
  }
  return items;
}
