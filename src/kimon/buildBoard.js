import { lookupKoyomi } from './loadKoyomi.js';
import { lookupChito } from './loadChito.js';
import { lookupDayKyokusu } from './loadDayKyokusu.js';
import { calcTimeKanshi } from './timeKanshi.js';
import { detectBoardKakkyoku } from './kakkyoku.js';
import { detectGofuguuji } from './banLevel.js';

const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
const ELEMENTS = ['tenban', 'chiban', 'kyusei', 'hasshin', 'hachimon'];

function resolveKey(boardType, koyomi, hour, date) {
  switch (boardType) {
    case '時': {
      const dayKan = koyomi.eto_day.charAt(0);
      const etoTime = calcTimeKanshi(dayKan, hour);
      return { kyokusu: koyomi.time_kyokusu, eto: etoTime };
    }
    case '日':
      // 日盤の局数は最終版 day_kyokusu.csv を使用（旧 koyomi.kyokusu は時盤等のため温存）。
      // 範囲外日付は lookupDayKyokusu が明示エラーを投げる。
      return { kyokusu: lookupDayKyokusu(date), eto: koyomi.eto_day };
    default:
      throw new Error('boardType は "日" または "時" のみ');
  }
}

export function buildBoard({ date, hour, boardType }) {
  if (boardType === '時' && (hour === undefined || hour === null)) {
    throw new Error("boardType='時' requires hour");
  }
  const koyomi = lookupKoyomi(date);
  const { kyokusu, eto } = resolveKey(boardType, koyomi, hour, date);
  const key = kyokusu + eto;
  const row = lookupChito(key);

  const palaces = {};
  for (const p of PALACES) {
    const cell = {};
    for (const el of ELEMENTS) {
      cell[el] = row[`${el}_${p}`];
    }
    palaces[p] = cell;
  }

  const meta = {
    date,
    boardType,
    kyokusu,
    eto,
    eto_year: koyomi.eto_year,
    eto_month: koyomi.eto_month,
    eto_day: koyomi.eto_day,
    kyusei_year: koyomi.kyusei_year,
    kyusei_month: koyomi.kyusei_month,
    kyusei_day: koyomi.kyusei_day,
    sangen: koyomi.sangen,
    inton_youton: koyomi.inton_youton,
    sekki24: koyomi.sekki24,
    junshu: row.junshu,
    tenban_junshu_p: row.tenban_junshu_p,
    chiban_junshu_p: row.chiban_junshu_p,
    chokufu: row.chokufu,
    chokushi: row.chokushi,
    kuubou: row.kuubou,
  };
  if (boardType === '時') {
    meta.hour = hour;
    meta.eto_time = eto;
    meta.time_kyokusu = koyomi.time_kyokusu;
  }

  const board = { meta, palaces };

  // 盤レベル判定（Phase 1: 表示用。検出ロジックの精緻化は Phase 2）
  // 伏吟・反吟・門迫 は既存の detectBoardKakkyoku を流用（種別/該当宮の細分は Phase 2）。
  const detected = detectBoardKakkyoku(board).map((r) => r.name);
  const dayKan = koyomi.eto_day?.charAt(0) || '';
  const hourKan = boardType === '時' ? (eto?.charAt(0) || '') : '';
  board.banLevel = {
    fukugin: detected.includes('伏吟') ? '該当' : null,
    hangin: detected.includes('反吟') ? '該当' : null,
    monpaku: detected.includes('門迫') ? '該当' : null,
    kuubou: meta.kuubou || null,
    gofuguuji: detectGofuguuji(dayKan, hourKan, boardType),
  };

  return board;
}
