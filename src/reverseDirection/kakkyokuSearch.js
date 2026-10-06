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

/**
 * やりたいことから格局を選ぶ（格局の名前を知らない人のための逆引き）。
 * どの用事にどの格局を当てるかは、象意辞書（data/shoui_dict.json）の説明（original / practical）に
 * 書いてある使い道をそのまま拾っている。新しい解釈は足さない。
 *   風遁「放送･広報･宣伝活動に用いて良好」/ 青龍返首「公の場での発表に向く」/ 飛鳥跌穴「告白・応募はその場で」
 *   玉女守門「面接、縁談、商談、試験」/ 天遁「営業、人脈拡大」/ 人遁「紹介営業、チームでの成果」
 *   地遁「積み重ねてきたものが報われる」/ 雲遁「戦略的な交渉」/ 虎遁「強気の交渉」/ 鬼遁「競合の隙を突く」
 *   神遁「ひらめき型の企画」/ 龍遁「海外取引、物流、ネット配信」
 */
export const KAKKYOKU_USES = [
  { key: 'sns', label: 'SNSの更新・告知・宣伝', names: ['風遁', '青龍返首'] },
  { key: 'present', label: '人前での発表・勝負に出る', names: ['青龍返首'] },
  { key: 'apply', label: '告白・申し込み・応募', names: ['飛鳥跌穴'] },
  { key: 'meet', label: '面接・商談・縁談・試験', names: ['玉女守門'] },
  { key: 'network', label: '人脈を広げる・営業・紹介', names: ['天遁', '人遁'] },
  { key: 'result', label: '積み重ねの成果を出す', names: ['地遁'] },
  { key: 'negotiate', label: '交渉・駆け引き', names: ['雲遁', '虎遁', '鬼遁'] },
  { key: 'idea', label: '企画・ひらめき', names: ['神遁'] },
  { key: 'flow', label: '海外・ネット配信・物流', names: ['龍遁'] },
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
