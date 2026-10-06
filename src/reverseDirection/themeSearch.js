// 目的（テーマ）から方位を探す。
//
// 「その目的に向く方位」＝ テーマ別の◎○×が ◎ か ○ の方位。
// ◎○×は総合点を超えないので（docs/axis_score_alignment_v2.md）、◎か○が付く方位は必ず総合も吉になる。
// 並びは ◎ → ○、同じ記号なら総合点の高い順。

import { AXES, computeAxisRanks } from './FusionCard.jsx';

/** 選べる目的（ご縁・仕事・金運・健康・勉強） */
export const THEMES = AXES;

export function themeLabel(theme) {
  return THEMES.find((item) => item.key === theme)?.label || '';
}

const isGood = (rank) => rank === '◎' || rank === '○';
const rankWeight = (rank) => (rank === '◎' ? 2 : rank === '○' ? 1 : 0);

/**
 * その盤の8方位から、目的に向く方位だけを良い順に返す。各方位に themeRank（◎か○）を付ける。
 * @param {string} boardKey - 解説の鍵（makeKaisetsuKey）
 * @param {object[]} rankings - buildReverseBoard / buildDayReverseBoard の rankings
 * @param {string} theme - 'goen' | 'shigoto' | 'kinun' | 'kenko' | 'benkyo'
 */
export function rankingsForTheme(boardKey, rankings, theme) {
  if (!theme) return [];
  return (rankings || [])
    .map((item) => ({ ...item, themeRank: computeAxisRanks(boardKey, item.palace, item.palaceScore)?.[theme] || '' }))
    .filter((item) => isGood(item.themeRank) && item.score > 0)
    .sort((a, b) => rankWeight(b.themeRank) - rankWeight(a.themeRank) || b.score - a.score);
}

/** 時間帯の一覧（buildTimeline）の「その時間の一番」を、目的に向く方位の一番に置き換える */
export function timelineForTheme(timeline, theme) {
  if (!theme) return timeline;
  return timeline.map((slot) => ({
    ...slot,
    best: rankingsForTheme(slot.boardKey, slot.rankings, theme)[0] || null,
  }));
}

/**
 * 今見ている時間帯のあとで、目的に向く方位がある最初の時間帯。無ければ null。
 * @param {object[]} themedTimeline - timelineForTheme の結果（時間順）
 * @param {number} hour - 今見ている時間帯（TIME_SLOTS の hour）
 */
export function nextSlotForTheme(themedTimeline, hour) {
  const index = themedTimeline.findIndex((slot) => slot.hour === hour);
  return themedTimeline.slice(index + 1).find((slot) => slot.best) || null;
}
