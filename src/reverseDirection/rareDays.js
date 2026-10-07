// 稀日（めったにない盤）を見つける。
//
//   満盤（まんばん）  … 時盤で、特別格局が乗った方位が満点（120点）になる時間帯。年に約18回
//   極盤（きょくばん）… 日盤で、特別格局が乗った方位が100点以上になる日。年に約9回
//   双格（そうかく）  … 日盤で、特別格局が2つ並ぶ日。年に4回
//
// 名前は、このアプリだけの呼び名（造語）。効果は約束しない（「運が上がる日」とは書かない）。
// すごさは、実際に数えた回数で伝える。回数と決め方: docs/rare_days_v1.md
// 点数や格局の判定はここではしない。格局検索（kakkyokuSearch.js）の結果をそのまま使う。

import {
  SPECIAL_KAKKYOKU_NAMES, groupRowsByBoard, scanSpecialKakkyoku,
} from './kakkyokuSearch.js';
import { DAY_BOARD_TYPE, TIME_BOARD_TYPE, TIME_SLOTS } from './reverseDirection.js';
import { DAYTIME_HOURS } from './themeSearch.js';

export const MANBAN_SCORE = 120;
export const KYOKUBAN_SCORE = 100;

/** 稀日の種類。order が大きいほど珍しい。perYear は実際の盤を数えた回数（時盤3年・日盤17年） */
export const RARE_TIERS = {
  manban: {
    key: 'manban', order: 1, name: '満盤', reading: 'まんばん', board: TIME_BOARD_TYPE,
    perYear: 18, rarity: '年に約18回', meaning: '点数が満ちた盤',
    desc: '特別な格局が乗った方位が、満点の120点になる時間帯です。',
  },
  kyokuban: {
    key: 'kyokuban', order: 2, name: '極盤', reading: 'きょくばん', board: DAY_BOARD_TYPE,
    perYear: 9, rarity: '年に約9回', meaning: '日盤が極まる日',
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
const spotOf = (row) => ({ palace: row.palace, label: row.label, names: row.matches, score: row.score, hachimon: row.hachimon });
const bySpot = (a, b) => b.score - a.score;

const _cache = new Map();

/**
 * startDate から days 日ぶんの稀日を、早い順に返す。
 * @returns {{ id, tier, date, hour, timeLabel, names: string[], spots: object[], best: object }[]}
 *   hour / timeLabel は満盤だけ（極盤・双格は null / ''）。spots は格局が乗っている方位（点数の高い順）。best は spots[0]
 */
export function findRareEvents({ startDate, days }) {
  const cacheKey = `${startDate}|${days}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);
  const events = [];

  // 満盤: 時盤（朝5時〜夜11時）で、特別格局が乗った方位が満点
  const timeRows = scanSpecialKakkyoku({ startDate, days, selectedNames: SPECIAL_KAKKYOKU_NAMES }).rows
    .filter((row) => DAYTIME_HOURS.includes(row.hour) && row.score >= MANBAN_SCORE);
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

  events.sort((a, b) => a.date.localeCompare(b.date) || slotIndex(a.hour ?? -1) - slotIndex(b.hour ?? -1));
  _cache.set(cacheKey, events);
  return events;
}

/** その稀日が、もう過ぎたか（満盤は、今日の過ぎた時間帯を除く） */
function isPast(event, today, liveSlotHour) {
  if (event.date < today) return true;
  if (event.date > today || event.hour === null || liveSlotHour === null || liveSlotHour === undefined) return false;
  return slotIndex(event.hour) < slotIndex(liveSlotHour);
}

/**
 * いま知らせる稀日（今日から NOTICE_DAYS 日先まで。過ぎたものは除く）。
 * 並びは、珍しいものが先。同じ種類なら早いものが先。
 */
export function upcomingRareEvents({ today, liveSlotHour = null, noticeDays = NOTICE_DAYS }) {
  return findRareEvents({ startDate: today, days: noticeDays + 1 })
    .filter((event) => !isPast(event, today, liveSlotHour))
    .sort((a, b) => RARE_TIERS[b.tier].order - RARE_TIERS[a.tier].order || a.date.localeCompare(b.date) || slotIndex(a.hour ?? -1) - slotIndex(b.hour ?? -1));
}

/** 「今日」「明日」「あと3日」 */
export function countdownLabel(event, today) {
  const diff = daysBetween(today, event.date);
  if (diff <= 0) return '今日';
  if (diff === 1) return '明日';
  return `あと${diff}日`;
}

/** これから見る日数（次に出る日と、12週間の帯を出すため） */
export const OUTLOOK_DAYS = 84;

/**
 * その稀日の「どのくらい珍しいか」。
 *   nextInDays … 同じ種類が次に出るまでの日数（これから OUTLOOK_DAYS 日のうちに無ければ null）
 *   weeks      … 今日から12週間ぶん。その週に同じ種類が出るなら true
 */
export function rareOutlook(event, today) {
  const all = findRareEvents({ startDate: today, days: OUTLOOK_DAYS }).filter((item) => item.tier === event.tier);
  const next = all.find((item) => item.date > event.date);
  const weeks = Array.from({ length: OUTLOOK_DAYS / 7 }, (_, index) => (
    all.some((item) => Math.floor(daysBetween(today, item.date) / 7) === index)
  ));
  return { nextInDays: next ? daysBetween(event.date, next.date) : null, weeks };
}

/** テスト用: 覚えている結果を消す */
export function clearRareCache() {
  _cache.clear();
}
