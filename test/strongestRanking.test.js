import { describe, expect, it } from 'vitest';
import {
  KAKU_RANK,
  MON_RANK,
  buildMonthlyBest,
  buildPeriodRange,
  formatDateForOrigin,
  formatPeriodLabel,
  scanStrongestRanking,
  sortRanking,
  sortTimelineSlotsByScore,
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

function slot(hour, bestPatch) {
  return {
    hour,
    label: `${hour}`,
    best: candidate(bestPatch),
    rankings: [candidate(bestPatch)],
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

  it('sorts timeline slots by best score first', () => {
    const rows = sortTimelineSlotsByScore([
      slot(8, { palace: 'low', score: 20 }),
      slot(2, { palace: 'high', score: 50 }),
    ]);
    expect(rows.map((row) => row.hour)).toEqual([2, 8]);
  });

  it('breaks tied timeline scores by bad elements, hachimon, kichi kakkyoku, then hour', () => {
    const mon = Object.keys(MON_RANK);
    const kaku = Object.keys(KAKU_RANK);

    expect(sortTimelineSlotsByScore([
      slot(2, { palace: 'bad', palaceScore: { breakdown: { hachimon: -40 }, detected_kakkyoku: [] } }),
      slot(8, { palace: 'safe', palaceScore: { breakdown: {}, detected_kakkyoku: [] } }),
    ])[0].hour).toBe(8);

    expect(sortTimelineSlotsByScore([
      slot(2, { palace: 'weak-mon', hachimon: mon[3] }),
      slot(8, { palace: 'strong-mon', hachimon: mon[0] }),
    ])[0].hour).toBe(8);

    expect(sortTimelineSlotsByScore([
      slot(2, {
        palace: 'weak-kaku',
        hachimon: mon[0],
        palaceScore: { breakdown: {}, detected_kakkyoku: [{ name: kaku[5], kichi_kyo: 'kichi' }] },
      }),
      slot(8, {
        palace: 'strong-kaku',
        hachimon: mon[0],
        palaceScore: { breakdown: {}, detected_kakkyoku: [{ name: kaku[0], kichi_kyo: 'kichi' }] },
      }),
    ])[0].hour).toBe(8);

    expect(sortTimelineSlotsByScore([
      slot(8, { palace: 'late', hachimon: mon[0] }),
      slot(2, { palace: 'early', hachimon: mon[0] }),
    ])[0].hour).toBe(2);
  });
});

describe('strongest ranking scan', () => {
  it('builds future-only period ranges from the start date', () => {
    expect(buildPeriodRange('2026-05-26', 7)).toEqual({
      startDate: '2026-05-26',
      endDate: '2026-06-01',
      days: 7,
    });
    expect(formatPeriodLabel(buildPeriodRange('2026-05-26', 31))).toBe('本日 5/26 〜 6/25');
  });

  it('formats year only when the date differs from the origin year', () => {
    expect(formatDateForOrigin('2026-06-11', '2026-05-26').displayText).toBe('6/11');
    expect(formatDateForOrigin('2027-01-17', '2026-05-26').displayText).toBe('2027年 1/17');
    expect(formatDateForOrigin('2027-01-17', '2026-05-26').monthDisplay).toBe('2027年 1月');
  });

  it('returns one best direction per day', () => {
    const result = scanStrongestRanking({ startDate: '2026-06-01', days: 7, goodOnly: false });
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(7);
    expect(new Set(result.rows.map((row) => row.date)).size).toBe(7);
    expect(result.rows.every((row) => row.date >= '2026-06-01')).toBe(true);
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
