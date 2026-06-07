import { getTodayJst } from './jishinLabels.js';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toJstShiftedDate(now) {
  return new Date(now.getTime() + JST_OFFSET_MS);
}

export function getBoardDate(now = new Date()) {
  const jst = toJstShiftedDate(now);
  if (jst.getUTCHours() !== 23) return getTodayJst(now);

  const rolled = new Date(jst.getTime());
  rolled.setUTCDate(rolled.getUTCDate() + 1);
  return rolled.toISOString().slice(0, 10);
}
