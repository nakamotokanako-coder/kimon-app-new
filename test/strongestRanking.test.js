import { describe, expect, it } from 'vitest';
import {
  buildMonthlyBest,
  scanStrongestRanking,
  sortRanking,
} from '../src/reverseDirection/strongestRanking.js';

function candidate(patch) {
  return {
    date: '2026-06-01',
    palace: 'kan',
    score: 40,
    hachimon: '生門',
    palaceScore: {
      breakdown: {},
      detected_kakkyoku: [],
    },
    ...patch,
  };
}

describe('strongest ranking sort', () => {
  it('keeps higher score first', () => {
    const rows = sortRanking([
      candidate({ palace: 'low', score: 30 }),
      candidate({ palace: 'high', score: 40 }),
    ]);
    expect(rows[0].palace).toBe('high');
  });

  it('puts no-bad-element candidates before bad candidates on tied score', () => {
    const rows = sortRanking([
      candidate({ palace: 'bad', palaceScore: { breakdown: { hachimon: -40 }, detected_kakkyoku: [] } }),
      candidate({ palace: 'safe', palaceScore: { breakdown: {}, detected_kakkyoku: [] } }),
    ]);
    expect(rows[0].palace).toBe('safe');
  });

  it('orders tied safe candidates by hachimon rank', () => {
    const rows = sortRanking([
      candidate({ palace: 'kei', hachimon: '景門' }),
      candidate({ palace: 'kyu', hachimon: '休門' }),
    ]);
    expect(rows[0].palace).toBe('kyu');
  });

  it('puts tied same-door candidates with kichi kakkyoku first', () => {
    const rows = sortRanking([
      candidate({ palace: 'none', hachimon: '休門' }),
      candidate({
        palace: 'kaku',
        hachimon: '休門',
        palaceScore: {
          breakdown: {},
          detected_kakkyoku: [{ name: '天遁', kichi_kyo: 'kichi', score: 10 }],
        },
      }),
    ]);
    expect(rows[0].palace).toBe('kaku');
  });

  it('uses earlier date as final tie breaker', () => {
    const rows = sortRanking([
      candidate({ palace: 'late', date: '2026-06-10' }),
      candidate({ palace: 'early', date: '2026-06-01' }),
    ]);
    expect(rows[0].palace).toBe('early');
  });
});

describe('strongest ranking scan', () => {
  it('returns one best direction per day', () => {
    const result = scanStrongestRanking({ startDate: '2026-06-01', days: 7, goodOnly: false });
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(7);
    expect(new Set(result.rows.map((row) => row.date)).size).toBe(7);
  });

  it('builds one monthly best per month in chronological month order', () => {
    const result = scanStrongestRanking({ startDate: '2026-06-01', days: 80, goodOnly: false });
    const monthly = buildMonthlyBest(result.rows);
    expect(monthly.length).toBeGreaterThanOrEqual(3);
    expect(monthly.map((row) => row.monthKey)).toEqual([...monthly.map((row) => row.monthKey)].sort());
  });

  it('captures out-of-range day-board errors without throwing', () => {
    const result = scanStrongestRanking({ startDate: '2044-02-01', days: 2, goodOnly: false });
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toMatch(/日盤は|date not found/);
  });
});
