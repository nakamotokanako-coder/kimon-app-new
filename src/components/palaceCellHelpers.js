// src/components/palaceCellHelpers.js
// PalaceCell から切り出した pure helper（テスト可能性のため）。

import shouiPriority from '../../data/shoui_priority.json';
import { kikkyoToScore } from '../kimon/jukkanKokuou.js';

const CELL_SHOUI_LIMIT = 4;
const PRIORITY_INDEX = new Map(
  shouiPriority.priority_order.map((name, index) => [name, index]),
);

function itemScore(item) {
  if (item.kind === 'jukkan') return kikkyoToScore(item.kikkyo);
  return item.score || 0;
}

/**
 * 盤セル用の象意を重複排除し、先生確定の優先順位で並べる。
 * detectedJukkan を先に連結するため、同名は十干剋応側が残る。
 */
export function sortPalaceShoui(detectedJukkan, detectedKakkyoku) {
  const seen = new Set();
  const items = [];
  for (const item of [
    ...(detectedJukkan || []).map((entry) => ({ kind: 'jukkan', ...entry })),
    ...(detectedKakkyoku || []).map((entry) => ({ kind: 'kakkyoku', ...entry })),
  ]) {
    if (!item.name || seen.has(item.name)) continue;
    seen.add(item.name);
    items.push(item);
  }

  return items.sort((a, b) => {
    const aPriority = PRIORITY_INDEX.get(a.name) ?? Infinity;
    const bPriority = PRIORITY_INDEX.get(b.name) ?? Infinity;
    if (aPriority !== bPriority) return aPriority - bPriority;
    if (aPriority !== Infinity) return 0;

    const aScore = itemScore(a);
    const bScore = itemScore(b);
    const absoluteDiff = Math.abs(bScore) - Math.abs(aScore);
    if (absoluteDiff !== 0) return absoluteDiff;

    return aScore - bScore;
  });
}

/**
 * 宮セルには優先順の上位4件だけを表示し、残りは +N 行にまとめる。
 * @param {Array} detectedJukkan - lookupJukkanKokuouMulti の結果配列
 * @param {Array} detectedKakkyoku - detectPalaceKakkyoku の結果配列
 */
export function buildInfoItems(detectedJukkan, detectedKakkyoku) {
  const items = sortPalaceShoui(detectedJukkan, detectedKakkyoku);
  const visible = items.slice(0, CELL_SHOUI_LIMIT);
  const remaining = items.length - visible.length;
  return remaining > 0
    ? [...visible, { kind: 'overflow', count: remaining }]
    : visible;
}
