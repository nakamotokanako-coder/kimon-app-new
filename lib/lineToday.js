// lib/lineToday.js
// LINE で返す吉方位の文を作る。
// 中身は scripts/build_line_today.mjs が先に作った表を引くだけ。ここでは点数や吉凶を決めない。
//   今の吉方位       … 今の時間帯の時盤で、一番点数の高い吉方位
//   選んだ日の吉方位 … その日の日盤で、一番点数の高い吉方位
//   方位から探す     … これから30日の日盤で、その方位の点数が高い日
//   目的から探す     … この1週間の日盤と、週末の時盤で、その目的に一番向く日・時間と方位
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
/**
 * LINE のトークからリンクを、LINE の中のブラウザではなく、ふだんのブラウザ（Safari など）で開かせる印。
 * LINE の中のブラウザはログイン情報が別なので、そこで開くと、もう一度ログインが要り、
 * 同じ端末が2台ぶんに数えられてしまう（端末は3台まで。lib/auth.js）。
 */
export const OPEN_EXTERNAL = 'openExternalBrowser=1';

const linkLine = (appUrl, go) => (appUrl ? `\n${appUrl}/?go=${go}&${OPEN_EXTERNAL}` : '');

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

/** 今の時間帯の { 日付, 時間帯, 一番の吉方位の中身（表に無ければ undefined） } */
export function nowPick(now = new Date(), correction = 0) {
  const date = getBoardDate(now);
  const slotHour = getJishinSlotHour(new Date(now.getTime() + correction * 60 * 1000));
  const { entries, time } = loadLineToday();
  return { date, slotHour, entry: entries[time[date]?.[slotHour / 2]] };
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
  const { date, slotHour, entry } = nowPick(now, correction);
  const when = `${dateLabel(date)}${slotLabel(slotHour)}`;
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

// ---- 目的から探す ----
// 順位と星はアプリの「目的で選ぶ」と同じ（表を作るときに themeSearch.js の関数で出してある）。
// 文面は、結果の報告で終わらせず「行ってみよう」と思えるように書く:
//   日盤（1日かけて動く）と時盤（近場）を最初から分ける／門の一言で、何に向くかを伝える／
//   地図への誘いは方位の名前を入れて具体的に／プロ版の案内は、先に「へぇ」を1つ置いてから。

/** この1週間（今日から7日） */
export const THEME_DAYS = 7;
/** 目的の見出しに付ける絵文字（LINE の文面だけで使う） */
export const THEME_EMOJI = { goen: '💞', shigoto: '💼', kinun: '💰', kenko: '🌿', benkyo: '📚' };

/** 時間帯の値（0,2,…,22）→ '15:00〜17:00' */
export function slotClock(slotHour) {
  return `${(slotHour + 23) % 24}:00〜${(slotHour + 1) % 24}:00`;
}

const starsText = (entry) => `${'★'.repeat(entry.stars)} ${entry.grade}`;
// ◎が先、同じ記号なら総合点の高い順、それも同じなら早いほう（themeSearch.js の byBest と同じ）
const rankWeight = (rank) => (rank === '◎' ? 2 : rank === '○' ? 1 : 0);
const byBest = (a, b) => (
  rankWeight(b.entry.rank) - rankWeight(a.entry.rank) || b.entry.score - a.entry.score || a.order - b.order
);

/** この1週間の日盤で、目的に向く日（良い順）。1つの日からは、一番向く方位を1つだけ */
export function themeDayPicks(themeIndex, today) {
  const { entries, themeDay } = loadLineToday();
  const found = [];
  for (let i = 0; i < THEME_DAYS; i += 1) {
    const date = addDays(today, i);
    const entry = entries[themeDay?.[date]?.[themeIndex]];
    if (entry) found.push({ date, entry, order: i });
  }
  return found.sort(byBest);
}

/** この1週間のうちの土日の時盤で、目的に向く時間帯（良い順）。今日の、もう過ぎた時間帯は入れない */
export function themeTimePicks(themeIndex, today, nowSlotHour) {
  const { entries, themes, themeHours, themeTime } = loadLineToday();
  const found = [];
  for (let i = 0; i < THEME_DAYS; i += 1) {
    const date = addDays(today, i);
    const row = themeTime?.[date];
    if (!row) continue; // 土日だけ持っている
    themeHours.forEach((hour, slotIndex) => {
      if (i === 0 && (nowSlotHour === 0 || hour < nowSlotHour)) return;
      const entry = entries[row[slotIndex * themes.length + themeIndex]];
      if (entry) found.push({ date, hour, entry, order: i * 100 + slotIndex });
    });
  }
  return found.sort(byBest);
}

/**
 * 目的から探した結果の文。知らない目的は null。
 * @param {string} themeKey - 'goen' | 'shigoto' | 'kinun' | 'kenko' | 'benkyo'
 */
export function buildThemeText(themeKey, now = new Date(), appUrl = null) {
  const { themes } = loadLineToday();
  const themeIndex = (themes || []).findIndex((theme) => theme.key === themeKey);
  if (themeIndex < 0) return null;
  const label = themes[themeIndex].label;
  const today = getBoardDate(now);
  const days = themeDayPicks(themeIndex, today);
  const times = themeTimePicks(themeIndex, today, getJishinSlotHour(now));
  const link = appUrl ? `${appUrl}/?go=theme&theme=${themeKey}&${OPEN_EXTERNAL}` : '';

  const lines = [`${THEME_EMOJI[themeKey] || ''} この1週間、${label}で動くなら`.trim(), ''];
  if (!days.length && !times.length) {
    lines.push(`この1週間は、${label}に向く方位が見つかりませんでした。`, 'ほかの目的か、来週また見てみてください。');
    if (link) lines.push('', link);
    return lines.join('\n');
  }

  if (days.length) {
    const [best, ...rest] = days;
    lines.push(
      '1日かけてしっかり方位を取るなら、',
      `${dateLabel(best.date)}の「${best.entry.dir}」がおすすめ。`,
      '',
      `${starsText(best.entry)}${best.entry.gate ? `（${best.entry.gate}）` : ''}`,
    );
    if (best.entry.short) lines.push(best.entry.short);
    if (rest.length) {
      lines.push('', 'ほかの候補');
      for (const pick of rest.slice(0, 2)) lines.push(`・${dateLabel(pick.date)}${pick.entry.dir}　${starsText(pick.entry)}`);
    }
  } else {
    lines.push(`この1週間の日盤には、${label}に向く方位がありません。`);
  }

  if (times.length) {
    const best = times[0];
    lines.push(
      '',
      '🚶 近場なら、週末のこの時間',
      '',
      '散歩や買い物へ出るなら、',
      `${dateLabel(best.date)}${slotClock(best.hour)}の「${best.entry.dir}」`,
      '',
      `${starsText(best.entry)}${best.entry.gate ? `（${best.entry.gate}）` : ''}`,
    );
    // 日盤と門が違うときだけ、一言を添える（同じ文を2回出さない）
    if (best.entry.short && best.entry.short !== days[0]?.entry.short) lines.push(best.entry.short);
  }

  lines.push('', '遠くへ1日かけて動くなら「日盤」、', '散歩・買い物など近場なら「時盤」が目安です。');

  const dirs = [...new Set([days[0]?.entry.dir, times[0]?.entry.dir].filter(Boolean))];
  if (link) lines.push('', `${dirs.join('・')}に何があるか、アプリの地図で探してみる →`, link);

  lines.push(
    '',
    '実は、同じ「吉方位」でも、門・星・神・格局の組み合わせによって"得意なこと"が違います。',
    '',
    `なぜ今回は${label}向きなのか？`,
    '→ プロ版で、盤の読み解きを詳しく見られます。',
  );
  return lines.join('\n');
}
