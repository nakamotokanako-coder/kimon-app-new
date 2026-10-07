// 稀日（めったにない盤）を見つける。
//
//   満盤（まんばん）  … 時盤で、特別格局が乗った方位が満点（120点）になる時間帯。深夜・早朝も入れる
//   極盤（きょくばん）… 日盤で、特別格局が乗った方位が100点以上になる日
//   双格（そうかく）  … 日盤で、特別格局が2つ並ぶ日
//
// 名前は、このアプリだけの呼び名（造語）。効果は約束しない（「運が上がる日」とは書かない）。
// すごさは、実際に数えた回数で伝える。回数と決め方: docs/rare_days_v1.md
// 点数や格局の判定はここではしない。格局検索（kakkyokuSearch.js）の結果をそのまま使う。
//
// 画面は、先に数えておいた表（rareDays.generated.js）を引く。1年ぶんの時盤をその場で数えると数秒かかり、
// 「今年はあと何回」をすぐ出せないため。表は scripts/build_rare_days.mjs が computeRareEvents で作る。

import {
  SPECIAL_KAKKYOKU_NAMES, groupRowsByBoard, scanSpecialKakkyoku,
} from './kakkyokuSearch.js';
import { DAY_BOARD_TYPE, PALACE_DIRECTIONS, TIME_BOARD_TYPE, TIME_SLOTS } from './reverseDirection.js';
import { RARE_TABLE } from './rareDays.generated.js';

export const MANBAN_SCORE = 120;
export const KYOKUBAN_SCORE = 100;

/** 稀日の種類。order が大きいほど珍しい。rarity は、表の期間（18年ぶん）を数えた1年あたりの回数 */
export const RARE_TIERS = {
  manban: {
    key: 'manban', order: 1, name: '満盤', reading: 'まんばん', board: TIME_BOARD_TYPE,
    perYear: 18, rarity: '年に約18回', meaning: '点数が満ちた盤',
    desc: '特別な格局が乗った方位が、満点の120点になる時間帯です。',
  },
  kyokuban: {
    key: 'kyokuban', order: 2, name: '極盤', reading: 'きょくばん', board: DAY_BOARD_TYPE,
    perYear: 7, rarity: '年に約7回', meaning: '日盤が極まる日',
    desc: '特別な格局が乗った方位が、日盤で100点以上になる日です。',
  },
  soukaku: {
    key: 'soukaku', order: 3, name: '双格', reading: 'そうかく', board: DAY_BOARD_TYPE,
    perYear: 4, rarity: '年に4回だけ', meaning: '格局が2つ並ぶ日',
    desc: '特別な格局が、同じ日の日盤に2つ並ぶ日です。',
  },
};

/** 稀日を、何日前から知らせるか */
export const NOTICE_DAYS = 3;

export function addDays(date, days) {
  const [year, month, day] = String(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  const utc = (date) => { const [y, m, d] = String(date).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(to) - utc(from)) / 86400000);
}

const slotIndex = (hour) => TIME_SLOTS.findIndex((slot) => slot.hour === hour);
const LABEL_OF = Object.fromEntries(PALACE_DIRECTIONS.map((direction) => [direction.palace, direction.label]));
const timeLabelOf = (hour) => TIME_SLOTS.find((slot) => slot.hour === hour)?.label || '';
const bySpot = (a, b) => b.score - a.score;
const byWhen = (a, b) => a.date.localeCompare(b.date) || slotIndex(a.hour ?? -1) - slotIndex(b.hour ?? -1);

/**
 * その稀日が始まる日（暦の日付）。
 * 23-1時の時間帯は、盤の日付では「次の日」の先頭に数えるが、始まるのは前の日の夜11時。
 */
export function eventStartDate(event) {
  return event.hour === 0 ? addDays(event.date, -1) : event.date;
}

/**
 * 実際の盤を数えて、startDate から days 日ぶんの稀日を、早い順に返す（表を作るときと、テストで使う）。
 * @returns {{ id, tier, date, hour, timeLabel, names: string[], spots: object[], best: object }[]}
 *   hour / timeLabel は満盤だけ（極盤・双格は null / ''）。spots は格局が乗っている方位（点数の高い順）。best は spots[0]
 */
export function computeRareEvents({ startDate, days }) {
  const spotOf = (row) => ({ palace: row.palace, label: row.label, names: row.matches, score: row.score, hachimon: row.hachimon });
  const events = [];

  // 満盤: 時盤で、特別格局が乗った方位が満点
  const timeRows = scanSpecialKakkyoku({ startDate, days, selectedNames: SPECIAL_KAKKYOKU_NAMES }).rows
    .filter((row) => row.score >= MANBAN_SCORE);
  for (const board of groupRowsByBoard(timeRows, SPECIAL_KAKKYOKU_NAMES)) {
    const spots = board.rows.map(spotOf).sort(bySpot);
    events.push({
      id: `manban-${board.date}-${board.hour}`, tier: 'manban', date: board.date, hour: board.hour, timeLabel: board.timeLabel,
      names: [...new Set(spots.flatMap((spot) => spot.names))], spots, best: spots[0],
    });
  }

  // 極盤・双格: 日盤。2つ並ぶ日は双格（100点以上でも双格として出す）
  const dayRows = scanSpecialKakkyoku({ startDate, days, selectedNames: SPECIAL_KAKKYOKU_NAMES, boardType: DAY_BOARD_TYPE }).rows;
  for (const board of groupRowsByBoard(dayRows, SPECIAL_KAKKYOKU_NAMES)) {
    const spots = board.rows.map(spotOf).sort(bySpot);
    const isSoukaku = board.matched.length >= 2;
    if (!isSoukaku && spots[0].score < KYOKUBAN_SCORE) continue;
    const tier = isSoukaku ? 'soukaku' : 'kyokuban';
    const shown = isSoukaku ? spots : spots.filter((spot) => spot.score >= KYOKUBAN_SCORE);
    events.push({
      id: `${tier}-${board.date}`, tier, date: board.date, hour: null, timeLabel: '',
      names: isSoukaku ? board.matched : [...new Set(shown.flatMap((spot) => spot.names))], spots: shown, best: shown[0],
    });
  }

  return events.sort(byWhen);
}

/** 表の1行（短い形）を、画面で使う形に戻す */
function expand(entry) {
  const spots = entry.s.map(([palace, score, names, hachimon]) => ({ palace, label: LABEL_OF[palace], names, score, hachimon }));
  return {
    id: entry.h === null ? `${entry.t}-${entry.d}` : `${entry.t}-${entry.d}-${entry.h}`,
    tier: entry.t, date: entry.d, hour: entry.h, timeLabel: entry.h === null ? '' : timeLabelOf(entry.h),
    names: entry.n, spots, best: spots[0],
  };
}

/** 表を作るとき用: 画面で使う形を、表の1行（短い形）にする */
export function compact(event) {
  return { t: event.tier, d: event.date, h: event.hour, n: event.names, s: event.spots.map((spot) => [spot.palace, spot.score, spot.names, spot.hachimon]) };
}

let _all = null;
function allEvents() {
  if (!_all) _all = RARE_TABLE.events.map(expand);
  return _all;
}

/** 表の期間（この外の日付には、稀日を出せない） */
export const RARE_RANGE = { min: RARE_TABLE.min, max: RARE_TABLE.max };

/** startDate から days 日ぶんの稀日を、早い順に返す（表を引く） */
export function findRareEvents({ startDate, days }) {
  const end = addDays(startDate, days - 1);
  return allEvents().filter((event) => event.date >= startDate && event.date <= end);
}

/** その稀日が、もう過ぎたか（満盤は、今日の過ぎた時間帯を除く） */
function isPast(event, today, liveSlotHour) {
  if (event.date < today) return true;
  if (event.date > today || event.hour === null || liveSlotHour === null || liveSlotHour === undefined) return false;
  return slotIndex(event.hour) < slotIndex(liveSlotHour);
}

/**
 * いま知らせる稀日（始まる日が、今日から NOTICE_DAYS 日先まで。過ぎたものは除く）。
 * 並びは、珍しいものが先。同じ種類なら早いものが先。
 */
export function upcomingRareEvents({ today, liveSlotHour = null, noticeDays = NOTICE_DAYS }) {
  return findRareEvents({ startDate: today, days: noticeDays + 2 })
    .filter((event) => !isPast(event, today, liveSlotHour) && daysBetween(today, eventStartDate(event)) <= noticeDays)
    .sort((a, b) => RARE_TIERS[b.tier].order - RARE_TIERS[a.tier].order || byWhen(a, b));
}

/** 「今日」「明日」「あと3日」（始まる日で数える） */
export function countdownLabel(event, today) {
  const diff = daysBetween(today, eventStartDate(event));
  if (diff <= 0) return '今日';
  if (diff === 1) return '明日';
  return `あと${diff}日`;
}

/**
 * 今年のうちに、同じ種類の稀日があと何回出るか（この回を入れて数える）。
 * 年は、その稀日が始まる日の年。
 */
export function remainingThisYear(event) {
  const year = eventStartDate(event).slice(0, 4);
  return allEvents().filter((item) => (
    item.tier === event.tier && eventStartDate(item).slice(0, 4) === year && byWhen(item, event) >= 0
  )).length;
}

/** 「今年はこの回を入れて、あと3回」「今年はこれが最後」 */
export function remainingLabel(event) {
  const count = remainingThisYear(event);
  const year = Number(eventStartDate(event).slice(0, 4));
  return count <= 1 ? `${year}年は、これが最後` : `${year}年は、この回を入れてあと${count}回`;
}

/** これから見る日数（12週間の帯を出すため） */
export const OUTLOOK_DAYS = 84;

/**
 * その稀日の「どのくらい珍しいか」。
 *   nextInDays … 同じ種類が次に出るまでの日数（表の期間のうちに無ければ null）
 *   weeks      … 今日から12週間ぶん。その週に同じ種類が出るなら true
 */
export function rareOutlook(event, today) {
  const same = allEvents().filter((item) => item.tier === event.tier);
  const next = same.find((item) => byWhen(item, event) > 0);
  const weeks = Array.from({ length: OUTLOOK_DAYS / 7 }, (_, index) => (
    same.some((item) => { const diff = daysBetween(today, eventStartDate(item)); return diff >= 0 && Math.floor(diff / 7) === index; })
  ));
  return { nextInDays: next ? daysBetween(eventStartDate(event), eventStartDate(next)) : null, weeks };
}
