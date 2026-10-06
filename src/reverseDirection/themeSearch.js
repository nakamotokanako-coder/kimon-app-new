// 目的（テーマ）から方位を探す。
//
// 「その目的に向く方位」＝ テーマ別の◎○×が ◎ か ○ の方位。
// ◎○×は総合点を超えないので（docs/axis_score_alignment_v2.md）、◎か○が付く方位は必ず総合も吉になる。
// 並びは ◎ → ○、同じ記号なら総合点の高い順。

import { AXES, computeAxisRanks } from './FusionCard.jsx';
import { buildReverseBoard, buildDayReverseBoard, TIME_SLOTS } from './reverseDirection.js';
import { makeKaisetsuKey } from '../kaisetsu/boardKey.js';

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

// ---- いつ・どの方位が一番向くか（順位）----

/** 出かけやすい時間帯（5-7時 〜 21-23時）。深夜・早朝の時間帯は順位に入れない */
export const DAYTIME_HOURS = TIME_SLOTS.filter((slot) => slot.hour >= 6).map((slot) => slot.hour);

// ◎が先、同じ記号なら総合点の高い順、それも同じなら早いほう
const byBest = (a, b) => (
  rankWeight(b.item.themeRank) - rankWeight(a.item.themeRank)
  || b.item.score - a.item.score
  || a.order - b.order
);

/**
 * 時盤で、目的に一番向く「時間帯と方位」を良い順に返す。1つの時間帯からは、一番向く方位を1つだけ出す。
 * @param {object} options
 * @param {string} options.theme
 * @param {string[]} options.dates - 調べる日（'YYYY-MM-DD'）。先頭の日は fromHour 以降の時間帯だけを見る
 * @param {number|null} options.fromHour - 先頭の日の、今の時間帯（TIME_SLOTS の hour）。null なら1日ぶん
 * @param {number} options.limit
 * @returns {{ date: string, hour: number, label: string, item: object }[]}
 */
export function bestTimesForTheme({ theme, dates, fromHour = null, limit = 3 }) {
  if (!theme) return [];
  const fromIndex = fromHour === null ? 0 : Math.max(0, TIME_SLOTS.findIndex((slot) => slot.hour === fromHour));
  const found = [];
  (dates || []).forEach((date, dateIndex) => {
    TIME_SLOTS.forEach((slot, slotIndex) => {
      const isNow = dateIndex === 0 && fromHour !== null && slot.hour === fromHour;
      if (dateIndex === 0 && slotIndex < fromIndex) return;       // 今日の、もう過ぎた時間帯
      if (!isNow && !DAYTIME_HOURS.includes(slot.hour)) return;   // 深夜・早朝（今の時間帯だけは出す）
      let result;
      try {
        result = buildReverseBoard({ date, hour: slot.hour });
      } catch {
        return; // 暦の範囲の外
      }
      const item = rankingsForTheme(makeKaisetsuKey(result.board.meta), result.rankings, theme)[0];
      if (item) found.push({ date, hour: slot.hour, label: slot.label, item, order: dateIndex * 100 + slotIndex });
    });
  });
  return found.sort(byBest).slice(0, limit).map(({ order, ...entry }) => entry);
}

/**
 * 日盤で、目的に一番向く「日と方位」を良い順に返す。1つの日からは、一番向く方位を1つだけ出す。
 * @returns {{ date: string, item: object }[]}
 */
export function bestDaysForTheme({ theme, dates, limit = 3 }) {
  if (!theme) return [];
  const found = [];
  (dates || []).forEach((date, order) => {
    let result;
    try {
      result = buildDayReverseBoard({ date });
    } catch {
      return; // 日盤の範囲の外
    }
    const item = rankingsForTheme(makeKaisetsuKey(result.board.meta), result.rankings, theme)[0];
    if (item) found.push({ date, item, order });
  });
  return found.sort(byBest).slice(0, limit).map(({ order, ...entry }) => entry);
}
