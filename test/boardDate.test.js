import { describe, expect, it } from 'vitest';
import { buildBoard } from '../src/kimon/buildBoard.js';
import { getBoardDate } from '../src/utils/boardDate.js';
import { getJishinSlotHour } from '../src/utils/jishinLabels.js';

describe('getBoardDate', () => {
  it('22:59 JST remains the same date', () => {
    expect(getBoardDate(new Date('2026-06-05T22:59:00+09:00'))).toBe('2026-06-05');
  });

  it('23:00 JST rolls over to the next board date', () => {
    expect(getBoardDate(new Date('2026-06-05T23:00:00+09:00'))).toBe('2026-06-06');
  });

  it('23:59 JST rolls over to the next board date', () => {
    expect(getBoardDate(new Date('2026-06-05T23:59:00+09:00'))).toBe('2026-06-06');
  });

  it('00:00 JST uses the current date after midnight', () => {
    expect(getBoardDate(new Date('2026-06-05T00:00:00+09:00'))).toBe('2026-06-05');
  });

  it('01:00 JST uses the current date', () => {
    expect(getBoardDate(new Date('2026-06-05T01:00:00+09:00'))).toBe('2026-06-05');
  });
});

describe('23:00 board date rollover integration', () => {
  it('23:30 JST builds the hour board from the next day eto_day with 子刻', () => {
    const now = new Date('2025-12-05T23:30:00+09:00');
    const date = getBoardDate(now);
    const hour = getJishinSlotHour(now);
    const board = buildBoard({ date, hour, boardType: '時' });

    expect(date).toBe('2025-12-06');
    expect(hour).toBe(0);
    expect(board.meta.date).toBe('2025-12-06');
    expect(board.meta.hour).toBe(0);
    expect(board.meta.eto_day).toBe('己酉');
    expect(board.meta.eto_time).toBe('甲子');
  });

  it('23:30 JST before risshun reads the next koyomi row', () => {
    const now = new Date('2026-02-03T23:30:00+09:00');
    const date = getBoardDate(now);
    const hour = getJishinSlotHour(now);
    const board = buildBoard({ date, hour, boardType: '時' });

    expect(date).toBe('2026-02-04');
    expect(hour).toBe(0);
    expect(board.meta.sekki24).toBe('立春');
    expect(board.meta.eto_day).toBe('己酉');
  });
});
