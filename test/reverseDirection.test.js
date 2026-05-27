import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  buildDayReverseBoard,
  filterGoodRankings,
  getLongitudeCorrectionMinutes,
  getMiniBoardToneClass,
  getScoreTone,
  getTimeSlotHour,
  TIME_SLOTS,
} from '../src/reverseDirection/reverseDirection.js';

describe('reverse direction utilities', () => {
  it('calculates natural time correction from longitude', () => {
    expect(getLongitudeCorrectionMinutes(139.69)).toBe(19);
    expect(getLongitudeCorrectionMinutes(135)).toBe(0);
    expect(getLongitudeCorrectionMinutes(130.4)).toBe(-18);
  });

  it('uses 子刻 as the 23:00-1:00 slot', () => {
    expect(getTimeSlotHour(new Date('2026-05-26T23:30:00+09:00'))).toBe(0);
    expect(getTimeSlotHour(new Date('2026-05-26T00:30:00+09:00'))).toBe(0);
    expect(getTimeSlotHour(new Date('2026-05-26T01:00:00+09:00'))).toBe(2);
    expect(getTimeSlotHour(new Date('2026-05-26T12:30:00+09:00'))).toBe(12);
  });

  it('filters non-positive rankings when good only is enabled', () => {
    const rankings = [{ score: 30 }, { score: 0 }, { score: -10 }];
    expect(filterGoodRankings(rankings, true)).toEqual([{ score: 30 }]);
    expect(filterGoodRankings(rankings, false)).toEqual(rankings);
  });

  it('maps score tones by score band', () => {
    expect(getScoreTone(40)).toBe('great');
    expect(getScoreTone(20)).toBe('good');
    expect(getScoreTone(10)).toBe('weak');
    expect(getScoreTone(0)).toBe('neutral');
    expect(getScoreTone(-10)).toBe('bad');
    expect(getScoreTone(-20)).toBe('bad-strong');
  });

  it('maps mini board color classes by score band', () => {
    expect(getMiniBoardToneClass(40)).toBe('daikichi');
    expect(getMiniBoardToneClass(39)).toBe('shokichi');
    expect(getMiniBoardToneClass(0)).toBe('churitsu');
    expect(getMiniBoardToneClass(-1)).toBe('kyo');
  });

  it('keeps full rankings on each timeline slot even when good-only is enabled', () => {
    const timeline = buildTimeline({ date: '2026-06-01', purposeName: '仕事', goodOnly: true });
    expect(timeline).toHaveLength(12);
    expect(timeline[0].rankings).toHaveLength(8);
    expect(timeline[0].rawBest).toBe(timeline[0].rankings[0]);
  });

  it('keeps timeline order in TIME_SLOTS order by default', () => {
    const timeline = buildTimeline({ date: '2026-06-01', purposeName: '仕事', goodOnly: false });
    expect(timeline.map((slot) => slot.hour)).toEqual(TIME_SLOTS.map((slot) => slot.hour));
  });

  it('builds day-board rankings from a selected date without an hour', () => {
    const result = buildDayReverseBoard({ date: '2026-06-01', purposeName: '仕事' });
    expect(result.board.meta.boardType).toBe('日');
    expect(result.rankings).toHaveLength(8);
    expect(result.rankings[0]).toEqual(expect.objectContaining({
      palace: expect.any(String),
      label: expect.any(String),
      score: expect.any(Number),
      tone: expect.any(String),
    }));
  });
});
