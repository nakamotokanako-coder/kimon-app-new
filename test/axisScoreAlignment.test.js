import { describe, it, expect } from 'vitest';
import {
  buildReverseBoard, buildDayReverseBoard, TIME_SLOTS, getMiniBoardToneClass,
} from '../src/reverseDirection/reverseDirection.js';
import { computeAxisRanks, dateCapNote } from '../src/reverseDirection/FusionCard.jsx';
import { classifyPalace } from '../src/kaisetsu/classifyPalace.js';
import { makeKaisetsuKey } from '../src/kaisetsu/boardKey.js';
import { lookupChito } from '../src/kimon/loadChito.js';
import { DATE_BOUND_KAKKYOKU } from '../src/kimon/palaceExplain.js';

// 総合点（講座の点数表）とテーマ別の◎○×（解説エンジン）が食い違わないことを、1年ぶんの盤で確かめる。
// 決定と根拠: docs/axis_score_alignment_v2.md

const AXES = ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'];
const isGood = (rank) => rank === '◎' || rank === '○';

function eachBoard(kind, visit) {
  const start = Date.UTC(2026, 0, 1);
  for (let d = 0; d < 365; d += 1) {
    const date = new Date(start + d * 86400000).toISOString().slice(0, 10);
    for (const hour of (kind === '時' ? TIME_SLOTS.map((slot) => slot.hour) : [null])) {
      visit(kind === '時' ? buildReverseBoard({ date, hour }) : buildDayReverseBoard({ date }));
    }
  }
}

describe.each(['時', '日'])('総合点とテーマ別の◎○×の整合（2026年・%s盤）', (kind) => {
  it('画面に出す◎○×は、総合の吉凶バッジを超えない', () => {
    const bad = [];
    eachBoard(kind, ({ board, rankings }) => {
      const key = makeKaisetsuKey(board.meta);
      for (const r of rankings) {
        const tone = getMiniBoardToneClass(r.score, r.palaceScore);
        const ranks = computeAxisRanks(key, r.palace, r.palaceScore);
        const values = AXES.map((axis) => ranks[axis]);
        const ok = tone === 'daikichi'
          || (tone === 'shokichi' && !values.includes('◎'))
          || (tone === 'churitsu' && !values.some(isGood))
          || (tone === 'kyo' && values.every((v) => v === '▲' || v === '×'));
        if (!ok && bad.length < 5) bad.push({ date: board.meta.date, hour: board.meta.hour, palace: r.palace, score: r.score, tone, values });
      }
    });
    expect(bad).toEqual([]);
  }, 120000);

  it('解説側が持つ総合点は、日付で決まる分を除けば、画面の総合点と同じ', () => {
    const bad = [];
    eachBoard(kind, ({ board, rankings }) => {
      if (board.score.ban_level.detected.includes('五不遇時')) return;
      const row = lookupChito(`${board.meta.kyokusu}${board.meta.eto}`);
      for (const r of rankings) {
        const dated = (r.palaceScore.detected_kakkyoku || []).some((k) => DATE_BOUND_KAKKYOKU.includes(k.name));
        if (dated || r.palaceScore.is_junri) continue;
        const j = classifyPalace(row, r.palace, { boardType: kind });
        if (j.totalScore !== r.score && bad.length < 5) bad.push({ date: board.meta.date, hour: board.meta.hour, palace: r.palace, score: r.score, base: j.totalScore });
      }
    });
    expect(bad).toEqual([]);
  }, 120000);

  it('日付で決まる凶のために、解説の文より◎○×を下げる方位は、ごく一部（2%未満）', () => {
    let total = 0;
    let lowered = 0;
    eachBoard(kind, ({ board, rankings }) => {
      const key = makeKaisetsuKey(board.meta);
      for (const r of rankings) {
        total += 1;
        if (dateCapNote(key, r.palace, r.palaceScore)) lowered += 1;
      }
    });
    expect(lowered / total).toBeLessThan(0.02);
  }, 120000);
});
