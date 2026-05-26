import { buildBoard } from '../kimon/buildBoard.js';
import { scoreBoard } from '../kimon/scoreEngine.js';
import purposeFilters from '../data/purposeFilters.json';

export const TIME_BOARD_TYPE = '\u6642';
export const DAY_BOARD_TYPE = '\u65e5';

export const PALACE_DIRECTIONS = [
  { palace: 'kan', label: '\u5317', short: 'N', angle: 0 },
  { palace: 'gon', label: '\u5317\u6771', short: 'NE', angle: 45 },
  { palace: 'shin', label: '\u6771', short: 'E', angle: 90 },
  { palace: 'son', label: '\u5357\u6771', short: 'SE', angle: 135 },
  { palace: 'ri', label: '\u5357', short: 'S', angle: 180 },
  { palace: 'kun', label: '\u5357\u897f', short: 'SW', angle: 225 },
  { palace: 'da', label: '\u897f', short: 'W', angle: 270 },
  { palace: 'ken', label: '\u5317\u897f', short: 'NW', angle: 315 },
];

export const TIME_SLOTS = [
  { hour: 0, label: '23-1\u6642' },
  { hour: 2, label: '1-3\u6642' },
  { hour: 4, label: '3-5\u6642' },
  { hour: 6, label: '5-7\u6642' },
  { hour: 8, label: '7-9\u6642' },
  { hour: 10, label: '9-11\u6642' },
  { hour: 12, label: '11-13\u6642' },
  { hour: 14, label: '13-15\u6642' },
  { hour: 16, label: '15-17\u6642' },
  { hour: 18, label: '17-19\u6642' },
  { hour: 20, label: '19-21\u6642' },
  { hour: 22, label: '21-23\u6642' },
];

const PALACE_ORDER = PALACE_DIRECTIONS.map((item) => item.palace);
const PURPOSE_NAMES = Object.keys(purposeFilters);

export function getPurposeNames() {
  return PURPOSE_NAMES;
}

export function getLongitudeCorrectionMinutes(longitude) {
  if (!Number.isFinite(longitude)) return 0;
  return Math.round((longitude - 135) * 4);
}

export function applyNaturalTime(date, correctionMinutes) {
  return new Date(date.getTime() + correctionMinutes * 60 * 1000);
}

export function getTimeSlotHour(date) {
  const hour = date.getHours();
  if (hour === 23) return 0;
  return Math.floor((hour + 1) / 2) * 2;
}

export function getTimeSlotLabel(slotHour) {
  return TIME_SLOTS.find((slot) => slot.hour === slotHour)?.label || `${slotHour}:00`;
}

function countMatches(values, targets) {
  if (!Array.isArray(targets) || targets.length === 0) return 0;
  return values.filter((value) => targets.includes(value)).length;
}

export function getPurposeBonus(palaceData, palaceScore, purposeName) {
  const filter = purposeFilters[purposeName];
  if (!filter || !palaceData || !palaceScore) return { bonus: 0, matches: [] };

  const matches = [];
  if (filter['\u9580']?.includes(palaceData.hachimon)) matches.push(palaceData.hachimon);
  if (filter['\u795e']?.includes(palaceData.hasshin)) matches.push(palaceData.hasshin);

  const jukkanNames = (palaceScore.detected_jukkan || []).map((item) => item.name);
  const kakkyokuNames = (palaceScore.detected_kakkyoku || []).map((item) => item.name);
  matches.push(...jukkanNames.filter((name) => filter['\u5341\u5e72\u524b\u5fdc']?.includes(name)));
  matches.push(...kakkyokuNames.filter((name) => filter['\u683c\u5c40']?.includes(name)));

  return {
    bonus: matches.length * (filter.bonus || 10),
    matches: [...new Set(matches)],
  };
}

export function getScoreTone(score) {
  if (score >= 40) return 'great';
  if (score >= 20) return 'good';
  if (score > 0) return 'weak';
  if (score === 0) return 'neutral';
  if (score <= -20) return 'bad-strong';
  return 'bad';
}

export function getMainReasons(palaceData, palaceScore, matches = []) {
  const reasons = [
    palaceData?.hachimon,
    palaceData?.hasshin,
    ...matches,
    ...(palaceScore?.detected_jukkan || []).map((item) => item.name),
    ...(palaceScore?.detected_kakkyoku || []).map((item) => item.name),
  ].filter(Boolean);
  return [...new Set(reasons)].slice(0, 4);
}

function buildRankings(board, purposeName) {
  const score = scoreBoard(board);
  const rankings = PALACE_DIRECTIONS.map((direction) => {
    const palaceData = board.palaces[direction.palace];
    const palaceScore = score.palaces[direction.palace];
    const purpose = getPurposeBonus(palaceData, palaceScore, purposeName);
    const finalScore = (palaceScore?.score || 0) + purpose.bonus;
    return {
      ...direction,
      score: finalScore,
      baseScore: palaceScore?.score || 0,
      purposeBonus: purpose.bonus,
      purposeMatches: purpose.matches,
      tone: getScoreTone(finalScore),
      reasons: getMainReasons(palaceData, palaceScore, purpose.matches),
      palaceData,
      palaceScore,
    };
  }).sort((a, b) => b.score - a.score || PALACE_ORDER.indexOf(a.palace) - PALACE_ORDER.indexOf(b.palace));

  return { board: { ...board, score }, rankings };
}

export function buildReverseBoard({ date, hour, purposeName = '仕事' }) {
  const board = buildBoard({ date, hour, boardType: TIME_BOARD_TYPE });
  return buildRankings(board, purposeName);
}

export function buildDayReverseBoard({ date, purposeName = '仕事' }) {
  const board = buildBoard({ date, boardType: DAY_BOARD_TYPE });
  return buildRankings(board, purposeName);
}

export function filterGoodRankings(rankings, goodOnly) {
  if (!goodOnly) return rankings;
  return rankings.filter((item) => item.score > 0);
}

export function buildTimeline({ date, purposeName, goodOnly }) {
  return TIME_SLOTS.map((slot) => {
    const result = buildReverseBoard({ date, hour: slot.hour, purposeName });
    const visible = filterGoodRankings(result.rankings, goodOnly);
    return {
      ...slot,
      best: visible[0] || null,
      rawBest: result.rankings[0] || null,
    };
  });
}
