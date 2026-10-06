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
 * 格局ごとの、伝統的な代表用途（格局の名前を知らない人のための手がかり）。
 *   line … 一言（「〜に」）  tags … 用途の札
 * 資料や流派で成立条件・用途に差があるので、「代表的な用途」として出す。効果は約束しない（「願いが叶う」とは書かない）。
 * 根拠: docs/kakkyoku_uses_v1.md
 */
export const KAKKYOKU_GUIDE = {
  青龍返首: { line: '大きなことを始める・積極的に進めるときに', tags: ['開始', '求財', '仕事', '建築'] },
  飛鳥跌穴: { line: '話をまとめる・広く使える強い吉格', tags: ['開始', '求財', '婚姻', '仕事'] },
  天遁: { line: '試験・仕事・商売・遠出に', tags: ['試験', '仕事', '商売', '遠出'] },
  地遁: { line: '建築・修繕・基盤づくりに', tags: ['建築', '修繕', '基盤づくり'] },
  人遁: { line: '交渉・仲直り・人との協力に', tags: ['交渉', '婚姻', '人脈', '仲直り'] },
  風遁: { line: '移動・発信・宣伝に', tags: ['移動', '発信', '宣伝'] },
  雲遁: { line: '雨乞い・ひそかに進めることに', tags: ['天候', '秘密'] },
  龍遁: { line: '水に関すること・橋や井戸に', tags: ['水', '橋・井戸'] },
  虎遁: { line: '家を守る・建築・厄除けに', tags: ['安宅', '建築', '守る', '厄除け'] },
  神遁: { line: '神社参拝・祈願・願掛けに', tags: ['神社', '祈願', '願掛け', '祭祀'] },
  鬼遁: { line: '調査・情報収集に', tags: ['調査', '情報収集', '秘密'] },
  玉女守門: { line: 'デート・告白・仲直りに', tags: ['恋愛', '婚姻', '和合', '交渉'] },
};

/**
 * 「何をしたい？」から格局を選ぶ。押すと、その用途に使われてきた格局だけを選んで検索する。
 * 雲遁・龍遁（雨乞い・水）は日常の用途に当てにくいので、ここには入れない（格局の名前からは選べる）。
 */
export const KAKKYOKU_USES = [
  { key: 'shrine', label: '神社・祈願', names: ['神遁'] },
  { key: 'love', label: '恋愛・結婚', names: ['玉女守門', '人遁', '飛鳥跌穴'] },
  { key: 'work', label: '仕事・お金・商売', names: ['青龍返首', '飛鳥跌穴', '天遁'] },
  { key: 'exam', label: '学び・試験', names: ['天遁', '玉女守門'] },
  { key: 'home', label: '家・建築', names: ['地遁', '虎遁', '青龍返首', '飛鳥跌穴'] },
  { key: 'travel', label: '旅行・移動', names: ['天遁', '風遁', '青龍返首'] },
  { key: 'talk', label: '交渉・仲直り', names: ['人遁', '玉女守門'] },
  { key: 'post', label: '発信・宣伝', names: ['風遁'] },
  { key: 'research', label: '調査', names: ['鬼遁'] },
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
