import { buildBoard } from './buildBoard.js';

export function buildHourBoard({ date, hour }) {
  const { meta, palaces } = buildBoard({ date, hour, boardType: '時' });
  return {
    meta: {
      date: meta.date,
      hour: meta.hour,
      eto_day: meta.eto_day,
      eto_time: meta.eto_time,
      time_kyokusu: meta.time_kyokusu,
      junshu: meta.junshu,
      tenban_junshu_p: meta.tenban_junshu_p,
      chiban_junshu_p: meta.chiban_junshu_p,
      chokufu: meta.chokufu,
      chokushi: meta.chokushi,
      kuubou: meta.kuubou,
    },
    palaces,
  };
}
