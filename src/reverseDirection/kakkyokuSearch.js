import { buildBoard } from '../kimon/buildBoard.js';
import { lookupChito } from '../kimon/loadChito.js';
import { getJukanShoui, getKakkyokuShoui } from '../kimon/loadShouiDict.js';
import { scoreBoard } from '../kimon/scoreEngine.js';
import {
  DAY_BOARD_TYPE,
  PALACE_DIRECTIONS,
  TIME_BOARD_TYPE,
  TIME_SLOTS,
  getScoreTone,
} from './reverseDirection.js';
import { formatRankingDate } from './strongestRanking.js';
import { KAKKYOKU_GUIDE } from './kakkyokuGuide.js';

export const SPECIAL_KAKKYOKU_GROUPS = [
  {
    group: '旬首2大吉格',
    items: ['青龍返首', '飛鳥跌穴'],
    source: 'jukkan',
  },
  {
    group: '九遁',
    items: ['天遁', '地遁', '人遁', '雲遁', '風遁', '龍遁', '虎遁', '神遁', '鬼遁'],
    source: 'kakkyoku',
  },
  {
    group: '人の和合',
    items: ['玉女守門'],
    source: 'kakkyoku',
  },
];

export const SPECIAL_KAKKYOKU_NAMES = SPECIAL_KAKKYOKU_GROUPS.flatMap((group) => group.items);

// 格局ごとの案内（一言・札・説明・こんな日に）は kakkyokuGuide.js。
export { KAKKYOKU_GUIDE };

/**
 * 「何をしたい？」から格局を選ぶ。押すと、その用途の格局だけを選んで検索する。
 * 格局の当て方は講座の内容（象意辞書）が主。神社・祈願（神遁）だけは古典にある用途を、そのまま出す。
 */
export const KAKKYOKU_USES = [
  { key: 'post', icon: 'purpose-broadcast', label: '発信・宣伝', names: ['風遁', '青龍返首'] },
  { key: 'love', icon: 'purpose-love', label: '恋愛・結婚', names: ['玉女守門', '飛鳥跌穴', '人遁'] },
  { key: 'work', icon: 'purpose-work', label: '仕事・お金・商売', names: ['青龍返首', '飛鳥跌穴', '天遁', '神遁'] },
  { key: 'exam', icon: 'purpose-study', label: '面接・試験・学び', names: ['玉女守門', '天遁'] },
  { key: 'people', icon: 'purpose-people', label: '人脈・協力', names: ['人遁', '天遁'] },
  { key: 'talk', icon: 'purpose-negotiate', label: '交渉・駆け引き', names: ['雲遁', '虎遁', '鬼遁'] },
  { key: 'result', icon: 'purpose-result', label: '成果を形にする', names: ['地遁'] },
  { key: 'sea', icon: 'purpose-sea', label: '海・海外・流通', names: ['龍遁'] },
  { key: 'shrine', icon: 'purpose-shrine', label: '神社・祈願', names: ['神遁'] },
];

const PALACE_ORDER = PALACE_DIRECTIONS.map((item) => item.palace);

function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function scoreText(score) {
  return `${score > 0 ? '+' : ''}${score}`;
}

function getPractical(name) {
  // 検索の結果には、伝統的な代表用途の一言を出す（用途から選んだときと同じ言葉にそろえる）。
  if (KAKKYOKU_GUIDE[name]) return KAKKYOKU_GUIDE[name].line;
  const entry = getKakkyokuShoui(name) || getJukanShoui(name);
  return entry?.practical || entry?.summary || entry?.description || '';
}

export function getKakkyokuLookupText(row, palace) {
  return {
    kakkyoku: row?.[`kakkyoku_${palace}`] || '',
    jukkanKokuou: row?.[`jukkan_kokuou_${palace}`] || '',
  };
}

/** 「◯丁奇昇殿;×白虎猖狂」のような列の文字列を、名前の配列にする（先頭の吉凶の印は外す） */
export function parseLookupNames(text) {
  return String(text || '')
    .split(';')
    .map((token) => token.trim().replace(/^[◯〇○◎×△▲]/u, ''))
    .filter(Boolean);
}

/**
 * その宮で成立している、選んだ格局の名前。
 * 名前は完全一致で比べる。部分一致にすると、九遁の「人遁」を探したときに、
 * 別物である十干剋応の「人遁吉格」（天盤丁×地盤乙）まで拾ってしまう。
 */
export function findSpecialKakkyokuMatches(row, palace, selectedNames) {
  if (!row || !palace || !Array.isArray(selectedNames) || selectedNames.length === 0) return [];
  const { kakkyoku, jukkanKokuou } = getKakkyokuLookupText(row, palace);
  const present = new Set([...parseLookupNames(kakkyoku), ...parseLookupNames(jukkanKokuou)]);
  return selectedNames.filter((name) => present.has(name));
}

export function sortKakkyokuSearchRows(rows, sortMode) {
  return [...rows].sort((a, b) => {
    if (sortMode === 'score') {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
    }

    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;

    const hourDiff = a.hour - b.hour;
    if (hourDiff !== 0) return hourDiff;

    return PALACE_ORDER.indexOf(a.palace) - PALACE_ORDER.indexOf(b.palace);
  });
}

/**
 * 検索の結果を盤ごと（時盤なら時間帯ごと、日盤なら日ごと）にまとめて、選んだ格局がその盤にいくつそろうかを数える。
 * 「そろう」は、同じ1つの盤に出ていること（方位は違ってよい）。同じ日でも、時間帯が違えば別の盤なので数えない。
 * 並びは、そろう数の多い盤が先。同じ数なら早い日時。
 * @returns {{ date, hour, timeLabel, text, weekday, matched: string[], missing: string[], complete: boolean, rows: object[] }[]}
 */
export function groupRowsByBoard(rows, selectedNames) {
  const selected = [...new Set(selectedNames || [])];
  const boards = new Map();
  for (const row of rows || []) {
    const key = `${row.date}|${row.hour}`;
    if (!boards.has(key)) {
      boards.set(key, { date: row.date, hour: row.hour, timeLabel: row.timeLabel, text: row.text, weekday: row.weekday, rows: [] });
    }
    boards.get(key).rows.push(row);
  }
  return [...boards.values()]
    .map((board) => {
      const present = new Set(board.rows.flatMap((row) => row.matches));
      const matched = selected.filter((name) => present.has(name));
      return {
        ...board,
        rows: [...board.rows].sort((a, b) => PALACE_ORDER.indexOf(a.palace) - PALACE_ORDER.indexOf(b.palace)),
        matched,
        missing: selected.filter((name) => !present.has(name)),
        complete: selected.length > 0 && matched.length === selected.length,
      };
    })
    .sort((a, b) => b.matched.length - a.matched.length || a.date.localeCompare(b.date) || a.hour - b.hour);
}

/**
 * 検索の結果を日ごとにまとめる（同じ日のうちなら、時間帯が違っても「そろう」と数える）。
 * 時盤で、同じ時間帯に全部そろう盤が無かったときの、次の手がかりに使う。
 */
export function groupRowsByDay(rows, selectedNames) {
  const selected = [...new Set(selectedNames || [])];
  const days = new Map();
  for (const row of rows || []) {
    if (!days.has(row.date)) days.set(row.date, { date: row.date, hour: null, timeLabel: '', text: row.text, weekday: row.weekday, rows: [] });
    days.get(row.date).rows.push(row);
  }
  return [...days.values()]
    .map((day) => {
      const present = new Set(day.rows.flatMap((row) => row.matches));
      const matched = selected.filter((name) => present.has(name));
      return {
        ...day,
        rows: [...day.rows].sort((a, b) => a.hour - b.hour || PALACE_ORDER.indexOf(a.palace) - PALACE_ORDER.indexOf(b.palace)),
        matched,
        missing: selected.filter((name) => !present.has(name)),
        complete: selected.length > 0 && matched.length === selected.length,
      };
    })
    .sort((a, b) => b.matched.length - a.matched.length || a.date.localeCompare(b.date));
}

/** 日盤は1日に盤が1つ（時刻なし） */
const DAY_SLOTS = [{ hour: 0, label: '日盤' }];

/**
 * 選んだ格局が成立する日時と方位を探す。
 * @param {string} [boardType] - '時'（既定。1日12の時盤を調べる）または '日'（1日1つの日盤を調べる）
 */
export function scanSpecialKakkyoku({ startDate, days = 30, selectedNames, sortMode = 'date', boardType = TIME_BOARD_TYPE }) {
  const selected = [...new Set((selectedNames || []).filter((name) => SPECIAL_KAKKYOKU_NAMES.includes(name)))];
  if (selected.length === 0) return { rows: [], errors: [] };

  const isDay = boardType === DAY_BOARD_TYPE;
  const slots = isDay ? DAY_SLOTS : TIME_SLOTS;
  const rows = [];
  const errors = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const date = addDays(startDate, dayIndex);
    for (const slot of slots) {
      try {
        const board = isDay
          ? buildBoard({ date, boardType: DAY_BOARD_TYPE })
          : buildBoard({ date, hour: slot.hour, boardType: TIME_BOARD_TYPE });
        const score = scoreBoard(board);
        const chitoRow = lookupChito(`${board.meta.kyokusu}${board.meta.eto}`);
        const dateMeta = formatRankingDate(date);

        for (const direction of PALACE_DIRECTIONS) {
          const matches = findSpecialKakkyokuMatches(chitoRow, direction.palace, selected);
          if (matches.length === 0) continue;

          const palaceScore = score.palaces[direction.palace];
          if (!palaceScore?.usable) continue;

          const palaceData = board.palaces[direction.palace];
          const lookupText = getKakkyokuLookupText(chitoRow, direction.palace);

          rows.push({
            ...direction,
            date,
            ...dateMeta,
            boardType: isDay ? DAY_BOARD_TYPE : TIME_BOARD_TYPE,
            hour: slot.hour,
            timeLabel: slot.label,
            score: palaceScore.score,
            scoreText: scoreText(palaceScore.score),
            tone: getScoreTone(palaceScore.score, palaceScore),
            matches,
            practicals: matches.map((name) => ({ name, text: getPractical(name) })).filter((item) => item.text),
            hachimon: palaceData?.hachimon || '',
            palaceData,
            palaceScore,
            lookupText,
          });
        }
      } catch (error) {
        errors.push({ date, hour: slot.hour, message: error.message });
      }
    }
  }

  return {
    rows: sortKakkyokuSearchRows(rows, sortMode),
    errors,
  };
}
