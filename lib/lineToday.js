// lib/lineToday.js
// LINE で返す吉方位の文を作る。
// 中身は scripts/build_line_today.mjs が先に作った表を引くだけ。ここでは点数や吉凶を決めない。
//   今の吉方位       … 今の時間帯の時盤で、一番点数の高い吉方位
//   選んだ日の吉方位 … その日の日盤で、一番点数の高い吉方位
//   方位から探す     … これから30日の日盤で、その方位の点数が高い日
import { readFileSync } from 'node:fs';
import { getBoardDate } from '../src/utils/boardDate.js';
import { getJishinSlotHour } from '../src/utils/jishinLabels.js';

const DATA_URL = new URL('../data/line/generated/today.json', import.meta.url);
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 方位から探すときに見る日数（今日から） */
export const WHEN_DAYS = 30;
const WHEN_TOP = 3;

let _cache = null;

export function loadLineToday() {
  if (!_cache) _cache = JSON.parse(readFileSync(DATA_URL, 'utf8'));
  return _cache;
}

/** テスト用: 表を差し替える（null で元に戻す） */
export function setLineTodayData(data) {
  _cache = data;
}

export function isDateText(value) {
  return typeof value === 'string' && DATE_RE.test(value);
}

export function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const weekdayOf = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** '2026-10-06' → '10月6日（火）' */
export function dateLabel(date) {
  const [, m, d] = date.split('-').map(Number);
  return `${m}月${d}日（${WEEKDAYS[weekdayOf(date)]}）`;
}

/** 時間帯の値（0,2,…,22）→ '23-1時' '13-15時'（アプリの TIME_SLOTS と同じ書き方） */
export function slotLabel(slotHour) {
  return slotHour === 0 ? '23-1時' : `${slotHour - 1}-${slotHour + 1}時`;
}

/** 基準点の経度 → 時間帯を何分ずらすか（アプリの getLongitudeCorrectionMinutes と同じ式） */
export function correctionMinutes(longitude) {
  return Math.round((longitude - 135) * 4);
}

const scoreText = (score) => `${score > 0 ? '+' : ''}${score}`;
const linkLine = (appUrl, go) => (appUrl ? `\n${appUrl}/?go=${go}` : '');

/** 一番の吉方位の中身を、行に分けて書く（最初の1行は呼ぶ側が書く） */
function detailLines(entry) {
  const lines = [`${scoreText(entry.score)}点・${entry.badge}`];
  if (entry.gate) lines.push(entry.theme ? `${entry.gate}｜${entry.theme}のテーマ` : entry.gate);
  if (entry.others.length) lines.push(`ほかに${entry.others.join('・')}も吉です。`);
  if (entry.vetoes.length) {
    lines.push(`注意条件あり（${entry.vetoes.join('・')}）。点数だけで決めず、盤で確かめてください。`);
  }
  return lines;
}

/**
 * 今の時間帯の吉方位の文（時盤）。
 * 日付と時間帯の決め方はアプリのホームと同じ: 日付は今の時刻（23時から翌日の盤）、
 * 時間帯は基準点の経度のぶんだけずらした時刻で決める。
 * @param {Date} now
 * @param {string|null} appUrl - アプリのアドレス（無ければリンクを付けない）
 * @param {number} correction - 時間帯を何分ずらすか（基準点を受け取っていない人は 0）
 */
export function buildNowText(now = new Date(), appUrl = null, correction = 0) {
  const date = getBoardDate(now);
  const slotHour = getJishinSlotHour(new Date(now.getTime() + correction * 60 * 1000));
  const when = `${dateLabel(date)}${slotLabel(slotHour)}`;
  const { entries, time } = loadLineToday();
  const entry = entries[time[date]?.[slotHour / 2]];
  const link = linkLine(appUrl, 'time');
  if (!entry) return `${when}の吉方位は、まだ用意できていません。${link}`;
  if (!entry.dir) {
    return `${when}の時盤には、吉の方位がありません。\n次の時間帯か、日盤で探せます。${link}`;
  }
  return [
    `今から使える吉方位は「${entry.dir}」です。`,
    `${when}まで`,
    ...detailLines(entry),
    '',
    '今の時間帯の時盤で見た方位です。行き先は、アプリの地図で探せます。',
  ].join('\n') + link;
}

/** 選んだ日の吉方位の文（日盤） */
export function buildDayText(date, appUrl = null) {
  const { entries, day } = loadLineToday();
  const entry = entries[day[date]];
  const link = linkLine(appUrl, 'day');
  if (!entry) return `${dateLabel(date)}の吉方位は、まだ用意できていません。${link}`;
  if (!entry.dir) {
    return `${dateLabel(date)}の日盤には、吉の方位がありません。\n別の日か、その日の時盤で探せます。${link}`;
  }
  return [
    `${dateLabel(date)}の吉方位は「${entry.dir}」です。`,
    ...detailLines(entry),
    '',
    '日盤で見た、その日1日の方位です。遠出の行き先は、アプリの地図で探せます。',
  ].join('\n') + link;
}

/** その方位が吉の日（今日から30日の日盤。点数の高い順に3日） */
export function buildWhenText(dir, now = new Date(), appUrl = null) {
  const { dirs, entries, dayDirs } = loadLineToday();
  const index = dirs.indexOf(dir);
  const link = linkLine(appUrl, 'ranking');
  if (index < 0) return null;

  const today = getBoardDate(now);
  const hits = [];
  for (let i = 0; i < WHEN_DAYS; i += 1) {
    const date = addDays(today, i);
    const mark = entries[dayDirs[date]?.[index]];
    if (mark) hits.push({ date, ...mark });
  }
  if (!hits.length) {
    return `これから${WHEN_DAYS}日のあいだに、「${dir}」が吉の日はありません。\nもっと先の日は、アプリで探せます。${link}`;
  }
  hits.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  return [
    `「${dir}」が吉の日（これから${WHEN_DAYS}日・点数の高い順）`,
    ...hits.slice(0, WHEN_TOP).map((hit) => `${dateLabel(hit.date)} ${scoreText(hit.score)}点・${hit.badge}`),
    '',
    '日盤で見た方位です。もっと先の日や時間帯は、アプリで探せます。',
  ].join('\n') + link;
}

/** 「次の休み」の候補: 明日と、明日以降でいちばん近い土曜・日曜（同じ日は1つにまとめる） */
export function restDayChoices(now = new Date()) {
  const today = getBoardDate(now);
  const tomorrow = addDays(today, 1);
  const nextOf = (weekday) => addDays(tomorrow, (weekday - weekdayOf(tomorrow) + 7) % 7);
  const short = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  const choices = [
    { name: '明日', date: tomorrow },
    { name: '土曜', date: nextOf(6) },
    { name: '日曜', date: nextOf(0) },
  ];
  return choices
    .filter((choice, i) => choices.findIndex((c) => c.date === choice.date) === i)
    .map((choice) => ({ label: `${choice.name} ${short(choice.date)}`, date: choice.date }));
}
