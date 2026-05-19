import { lookupKoyomi, lookupBan } from './lookup.js';
import { loadKimonTables } from './loadData_old.js';
import { normalizeStar, expandKyusei } from './normalize.js';

const PALACES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function pickKyokusuAndEto(koyomi, boardType) {
  switch (boardType) {
    case '日':
      return { kyokusu: koyomi.day_kyokusu2, eto: koyomi.eto_day, kyuseiShort: koyomi.kyusei_day };
    case '月':
      return { kyokusu: koyomi.month_kyokusu, eto: koyomi.eto_month, kyuseiShort: koyomi.kyusei_month };
    default:
      throw new Error(`boardType not in scope: ${boardType}`);
  }
}

export function buildBoard({ date, boardType }) {
  const koyomi = lookupKoyomi(date);
  const { kyokusu, eto, kyuseiShort } = pickKyokusuAndEto(koyomi, boardType);
  const ban = lookupBan(kyokusu, eto);
  const tables = loadKimonTables();
  const shiseiByPalace = tables.shisei_9pattern[expandKyusei(kyuseiShort)];

  const palaces = {};
  for (const p of PALACES) {
    const isCenter = p === 5;
    palaces[p] = isCenter
      ? {
          tenban_kan: null,
          hasshin: null,
          tenban_star: null,
          chiban_kan: ban.p5_chiban_kan,
          hachimon: null,
          shisei: shiseiByPalace[String(p)],
        }
      : {
          tenban_kan: ban[`p${p}_tenban_kan`],
          hasshin: ban[`p${p}_hasshin`],
          tenban_star: normalizeStar(ban[`p${p}_kyusei`]),
          chiban_kan: ban[`p${p}_chiban_kan`],
          hachimon: ban[`p${p}_hachimon`],
          shisei: shiseiByPalace[String(p)],
        };
  }

  return {
    meta: {
      date,
      boardType,
      kyokusu,
      eto,
      chokufu: normalizeStar(ban.chokufu),
      chokushi: ban.chokushi,
      junshu: ban.junshu,
    },
    palaces,
  };
}
