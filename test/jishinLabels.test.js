import { describe, it, expect } from 'vitest';
import { JISHIN_LABELS, getJishinSlotHour } from '../src/utils/jishinLabels.js';

describe('JISHIN_LABELS', () => {
  it('HOURS の全12値に対してラベルがある', () => {
    const HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
    for (const h of HOURS) {
      expect(JISHIN_LABELS[h]).toMatch(/\([子丑寅卯辰巳午未申酉戌亥]\)$/);
    }
  });

  it('代表値が時辰範囲表記になっている', () => {
    expect(JISHIN_LABELS[0]).toBe('23-01時 (子)');
    expect(JISHIN_LABELS[18]).toBe('17-19時 (酉)');
    expect(JISHIN_LABELS[22]).toBe('21-23時 (亥)');
  });
});

describe('getJishinSlotHour', () => {
  // 時辰判定は JST 基準（getBoardDate / getTodayJst と同じ）。実行環境TZに依存しないよう、
  // 各テストは「h時m分 JST」を表す絶対時刻（+09:00）を生成して検証する。
  const at = (h, m = 0) =>
    new Date(`2026-05-26T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`);

  it('17:30 → 18 (酉刻 17-19時)', () => {
    expect(getJishinSlotHour(at(17, 30))).toBe(18);
  });

  it('18:00 → 18 (酉刻)', () => {
    expect(getJishinSlotHour(at(18, 0))).toBe(18);
  });

  it('22:30 → 22 (亥刻 21-23時)', () => {
    expect(getJishinSlotHour(at(22, 30))).toBe(22);
  });

  it('23:00 → 0 (子刻 23-01時)', () => {
    expect(getJishinSlotHour(at(23, 0))).toBe(0);
  });

  it('23:59 → 0 (子刻)', () => {
    expect(getJishinSlotHour(at(23, 59))).toBe(0);
  });

  it('00:00 → 0 (子刻)', () => {
    expect(getJishinSlotHour(at(0, 0))).toBe(0);
  });

  it('00:59 → 0 (子刻)', () => {
    expect(getJishinSlotHour(at(0, 59))).toBe(0);
  });

  it('01:00 → 2 (丑刻 01-03時)', () => {
    expect(getJishinSlotHour(at(1, 0))).toBe(2);
  });

  it('12:00 → 12 (午刻 11-13時)', () => {
    expect(getJishinSlotHour(at(12, 0))).toBe(12);
  });
});
