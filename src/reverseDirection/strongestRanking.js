import { buildBoard } from '../kimon/buildBoard.js';
import { scoreBoard } from '../kimon/scoreEngine.js';
import { DAY_BOARD_TYPE, PALACE_DIRECTIONS, getScoreTone } from './reverseDirection.js';

export const MON_RANK = {
  '休門': 0,
  '生門': 1,
  '開門': 2,
  '景門': 3,
};

export const KAKU_RANK = {
  '青龍返首': 0,
  '飛鳥跌穴': 1,
  '天遁': 2,
  '地遁': 3,
  '人遁': 4,
  '雲遁': 5,
  '風遁': 6,
  '龍遁': 7,
  '虎遁': 8,
  '神遁': 9,
  '鬼遁': 10,
  '乙奇得使': 11,
  '丙奇得使': 12,
  '丁奇得使': 13,
  '乙奇昇殿': 14,
  '丙奇昇殿': 15,
  '丁奇昇殿': 16,
  '玉女守門': 17,
};

const BAD_BREAKDOWN_KEYS = [
  'tenban_kan',
  'hachimon',
  'hasshin',
  'monpaku',
  'kuubou',
  'ban_level_minus',
];

const PALACE_ORDER = PALACE_DIRECTIONS.map((item) => item.palace);

export function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function buildPeriodRange(startDate, days) {
  return {
    startDate,
    endDate: addDays(startDate, days - 1),
    days,
  };
}

export function formatRankingDate(date) {
  const [year, monthValue, dayValue] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, monthValue - 1, dayValue));
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const month = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate();
  return {
    text: `${month}/${day}`,
    weekday: weekdays[parsed.getUTCDay()],
    monthKey: `${parsed.getUTCFullYear()}-${String(month).padStart(2, '0')}`,
    monthLabel: `${month}月`,
  };
}

export function formatDateForOrigin(date, originDate) {
  const meta = formatRankingDate(date);
  const year = date.slice(0, 4);
  const originYear = originDate.slice(0, 4);
  return {
    ...meta,
    displayText: year === originYear ? meta.text : `${Number(year)}年 ${meta.text}`,
    monthDisplay: year === originYear ? meta.monthLabel : `${Number(year)}年 ${meta.monthLabel}`,
  };
}

export function formatPeriodLabel({ startDate, endDate }) {
  const start = formatRankingDate(startDate);
  const end = formatDateForOrigin(endDate, startDate);
  return `本日 ${start.text} 〜 ${end.displayText}`;
}

export function hasBadElement(candidate) {
  const breakdown = candidate.palaceScore?.breakdown || {};
  return BAD_BREAKDOWN_KEYS.some((key) => (breakdown[key] || 0) < 0);
}

export function bestKakkyoku(candidate) {
  const kichi = (candidate.palaceScore?.detected_kakkyoku || [])
    .filter((item) => item.kichi_kyo === 'kichi');
  return kichi.sort((a, b) => (
    (KAKU_RANK[a.name] ?? 999) - (KAKU_RANK[b.name] ?? 999)
    || a.name.localeCompare(b.name, 'ja')
  ))[0] || null;
}

export function hachimonRank(candidate) {
  return MON_RANK[candidate.hachimon || candidate.palaceData?.hachimon] ?? 99;
}

export function compareRankingCore(a, b) {
  const scoreDiff = b.score - a.score;
  if (scoreDiff !== 0) return scoreDiff;

  const badDiff = Number(hasBadElement(a)) - Number(hasBadElement(b));
  if (badDiff !== 0) return badDiff;

  const monDiff = hachimonRank(a) - hachimonRank(b);
  if (monDiff !== 0) return monDiff;

  const aKaku = bestKakkyoku(a);
  const bKaku = bestKakkyoku(b);
  const kakuPresenceDiff = Number(!aKaku) - Number(!bKaku);
  if (kakuPresenceDiff !== 0) return kakuPresenceDiff;
  const kakuDiff = (KAKU_RANK[aKaku?.name] ?? 999) - (KAKU_RANK[bKaku?.name] ?? 999);
  if (kakuDiff !== 0) return kakuDiff;

  return 0;
}

export function sortRanking(candidates) {
  return [...candidates].sort((a, b) => {
    const coreDiff = compareRankingCore(a, b);
    if (coreDiff !== 0) return coreDiff;

    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;

    return PALACE_ORDER.indexOf(a.palace) - PALACE_ORDER.indexOf(b.palace);
  });
}

export function sortTimelineSlotsByScore(slots) {
  return [...slots].sort((a, b) => {
    if (!a.best && !b.best) return a.hour - b.hour;
    if (!a.best) return 1;
    if (!b.best) return -1;

    const coreDiff = compareRankingCore(a.best, b.best);
    if (coreDiff !== 0) return coreDiff;

    return a.hour - b.hour;
  });
}

export function buildDayCandidates(date) {
  const board = buildBoard({ date, boardType: DAY_BOARD_TYPE });
  const score = scoreBoard(board);
  return PALACE_DIRECTIONS.map((direction) => {
    const palaceData = board.palaces[direction.palace];
    const palaceScore = score.palaces[direction.palace];
    const dateMeta = formatRankingDate(date);
    const kaku = bestKakkyoku({ palaceScore });
    const candidate = {
      ...direction,
      date,
      ...dateMeta,
      score: palaceScore?.score || 0,
      tone: getScoreTone(palaceScore?.score || 0),
      hachimon: palaceData?.hachimon || '',
      hasshin: palaceData?.hasshin || '',
      palaceData,
      palaceScore,
      kakuName: kaku?.name || '',
    };
    candidate.hasBad = hasBadElement(candidate);
    return candidate;
  });
}

export function scanStrongestRanking({ startDate, days, goodOnly = true }) {
  const rows = [];
  const errors = [];
  const range = buildPeriodRange(startDate, days);
  for (let i = 0; i < range.days; i += 1) {
    const date = addDays(startDate, i);
    try {
      const best = sortRanking(buildDayCandidates(date))[0];
      if (best && (!goodOnly || best.score > 0)) rows.push(best);
    } catch (error) {
      errors.push({ date, message: error.message });
    }
  }
  return {
    range,
    rows: sortRanking(rows),
    errors,
  };
}

export function buildMonthlyBest(rows) {
  const groups = new Map();
  for (const row of rows) {
    const current = groups.get(row.monthKey);
    if (!current || sortRanking([row, current])[0] === row) {
      groups.set(row.monthKey, row);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => row);
}
