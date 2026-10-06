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
 * 格局ごとの用途（格局の名前を知らない人のための手がかり）。
 *   line    … 一言（「〜に」）
 *   tags    … 用途の札。講座の内容（象意辞書 data/shoui_dict.json の original / practical）から拾う。こちらが主
 *   classic … 古典・現行の解説にある用途のうち、講座と食い違わず、今の暮らしで使えるものだけを補足で足す
 *             （雨乞い・伏兵など、今は使わない用途は入れない）
 * 効果は約束しない（「願いが叶う」とは書かない）。根拠: docs/kakkyoku_uses_v1.md
 */
export const KAKKYOKU_GUIDE = {
  青龍返首: { line: '人前に出る・大きなことを始めるときに', tags: ['発表', '勝負', '開始'], classic: ['求財', '着任'] },
  飛鳥跌穴: { line: '申し込み・告白・応募を、その場で決めるときに', tags: ['財', '昇進', '婚姻', '即決'], classic: [] },
  天遁: { line: '人脈を広げる・商売・学びに', tags: ['人脈', '営業', '財', '学び'], classic: ['商売', '遠出'] },
  地遁: { line: '積み重ねてきたことを、形にするときに', tags: ['成果', '評価', '長い取り組み'], classic: ['基盤づくり'] },
  人遁: { line: '人との協力・紹介で進めるときに', tags: ['和合', '人望', '紹介', 'チーム'], classic: ['仲直り', '婚姻'] },
  風遁: { line: '発信・告知・宣伝に', tags: ['発信', '広報', '宣伝'], classic: [] },
  雲遁: { line: '駆け引き・戦略を練るときに', tags: ['交渉', '戦略', '駆け引き'], classic: [] },
  龍遁: { line: '海や水辺へ出る・海外や流通の仕事に', tags: ['海・水辺', '釣り', '海外', '流通'], classic: [] },
  虎遁: { line: '強気で押し切る・決断を通すときに', tags: ['強気の交渉', '決断', '回収'], classic: ['守りを固める'] },
  // 神社・祈願は古典にある用途だが、そのまま用途として出す（「古典」の印は付けない。運営者の判断 2026-10-06）
  神遁: { line: '神社参拝・祈願に。実力以上を狙うときにも', tags: ['神社・祈願', '財', 'ひらめき', '企画'], classic: [] },
  鬼遁: { line: '相手の隙を突く・調べて備えるときに', tags: ['隙を突く', '差別化'], classic: ['調査', '情報収集'] },
  玉女守門: { line: '面接・縁談・商談など、人と向き合う場面に', tags: ['恋愛', '縁談', '面接', '試験'], classic: ['お祝いの席'] },
};

/**
 * 「何をしたい？」から格局を選ぶ。押すと、その用途の格局だけを選んで検索する。
 * 格局の当て方は講座の内容（象意辞書）が主。神社・祈願（神遁）だけは古典にある用途を、そのまま出す。
 */
export const KAKKYOKU_USES = [
  { key: 'post', label: '発信・宣伝', names: ['風遁', '青龍返首'] },
  { key: 'love', label: '恋愛・結婚', names: ['玉女守門', '飛鳥跌穴', '人遁'] },
  { key: 'work', label: '仕事・お金・商売', names: ['青龍返首', '飛鳥跌穴', '天遁', '神遁'] },
  { key: 'exam', label: '面接・試験・学び', names: ['玉女守門', '天遁'] },
  { key: 'people', label: '人脈・協力', names: ['人遁', '天遁'] },
  { key: 'talk', label: '交渉・駆け引き', names: ['雲遁', '虎遁', '鬼遁'] },
  { key: 'result', label: '成果を形にする', names: ['地遁'] },
  { key: 'sea', label: '海・海外・流通', names: ['龍遁'] },
  { key: 'shrine', label: '神社・祈願', names: ['神遁'] },
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
