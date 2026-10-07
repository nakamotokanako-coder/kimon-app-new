// lib/lineWent.js
// LINE の「行ってきた」の記録。吉方位へ出かけたことを、本人がボタンで残す（自己申告）。
// 記録がたまると続けやすくなるので、押したときと「記録を見る」で、回数と最近の記録を返す。
//
// 保存先（KV）: line:went:{LINEのユーザーID} → [{ date, dir }, …]（新しい順・最大200件・最後の記録から1年で消える）
// 保存するのは日付と方位だけ。場所は保存しない。「記録を消す」でいつでも消せる。
import { kv } from './kv.js';
import { addDays, dateLabel } from './lineToday.js';

const KEEP_SEC = 365 * 24 * 60 * 60;
export const WENT_MAX = 200;
const RECENT = 5;

const wentKey = (userId) => `line:went:${userId}`;

export async function loadWent(userId) {
  if (!userId) return [];
  const list = await kv().get(wentKey(userId));
  return Array.isArray(list) ? list : [];
}

/**
 * 記録する。同じ日・同じ方位は1回だけ。
 * @returns {Promise<{ list: object[], added: boolean }>}
 */
export async function recordWent(userId, date, dir) {
  const list = await loadWent(userId);
  if (list.some((item) => item.date === date && item.dir === dir)) return { list, added: false };
  const next = [{ date, dir }, ...list]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, WENT_MAX);
  await kv().set(wentKey(userId), next, { ex: KEEP_SEC });
  return { list: next, added: true };
}

export async function clearWent(userId) {
  if (userId) await kv().del(wentKey(userId));
}

/** 「この7日間で3回、これまでの合計は12回です。」 */
export function countLine(list, today) {
  const from = addDays(today, -6);
  const week = list.filter((item) => item.date >= from && item.date <= today).length;
  return `この7日間で${week}回、これまでの合計は${list.length}回です。`;
}

/** 押した直後の返信 */
export function recordedText({ list, added }, date, dir, today) {
  const head = added
    ? `👣 記録しました\n${dateLabel(date)}「${dir}」へ`
    : `${dateLabel(date)}の「${dir}」は、もう記録してあります。`;
  return `${head}\n\n${countLine(list, today)}`;
}

/** 「記録を見る」の返信 */
export function wentListText(list, today) {
  if (!list.length) {
    return 'まだ記録がありません。\n「今の吉方位」で出た方位へ出かけたら、「行ってきた」を押してください。';
  }
  return [
    '👣 吉方位へ行った記録',
    '',
    countLine(list, today),
    '',
    '最近の記録',
    ...list.slice(0, RECENT).map((item) => `・${dateLabel(item.date)}${item.dir}`),
  ].join('\n');
}
