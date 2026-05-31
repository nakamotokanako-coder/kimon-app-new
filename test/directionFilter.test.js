import { describe, expect, it } from 'vitest';
import { scanStrongestRanking } from '../src/reverseDirection/strongestRanking.js';

const START = '2026-06-01';

describe('scanStrongestRanking 方位フィルタ', () => {
  it('directionPalace 未指定（全方位）：各日 1 件（その日の最高方位）が並ぶ', () => {
    const result = scanStrongestRanking({
      startDate: START,
      days: 7,
      goodOnly: false,
    });
    expect(result.rows.length).toBe(7);
    // 各 row が異なる方位を持ちうる（その日の最高）
    const palaces = new Set(result.rows.map((r) => r.palace));
    expect(palaces.size).toBeGreaterThanOrEqual(1);
  });

  it('directionPalace=kan：rows の palace が全て kan になる', () => {
    const result = scanStrongestRanking({
      startDate: START,
      days: 14,
      goodOnly: false,
      directionPalace: 'kan',
    });
    expect(result.rows.length).toBe(14);
    for (const row of result.rows) {
      expect(row.palace).toBe('kan');
      expect(row.label).toBe('北');
    }
  });

  it('directionPalace=son（南東）：rows が全て son', () => {
    const result = scanStrongestRanking({
      startDate: START,
      days: 7,
      goodOnly: false,
      directionPalace: 'son',
    });
    expect(result.rows.length).toBe(7);
    for (const row of result.rows) {
      expect(row.palace).toBe('son');
      expect(row.label).toBe('南東');
    }
  });

  it('全方位と個別方位で件数が変わる（goodOnly=true 時のフィルタ効果）', () => {
    const allOpts = { startDate: START, days: 31, goodOnly: true };
    const allResult = scanStrongestRanking(allOpts);
    const kanResult = scanStrongestRanking({ ...allOpts, directionPalace: 'kan' });
    // どちらも非空のはず（実データに依存だが、月内に必ず吉日が出る前提）
    expect(allResult.rows.length).toBeGreaterThan(0);
    // 個別方位は全方位以下になる（最高方位ではないため filter で落ちる可能性）
    expect(kanResult.rows.length).toBeLessThanOrEqual(allResult.rows.length);
  });

  it('既存挙動互換：directionPalace を渡さない呼び出しでも壊れない', () => {
    // 既存呼び出し（パラメータ未指定）と新呼び出し（null 明示）が同じ結果になる
    const legacy = scanStrongestRanking({ startDate: START, days: 7, goodOnly: true });
    const explicitNull = scanStrongestRanking({
      startDate: START,
      days: 7,
      goodOnly: true,
      directionPalace: null,
    });
    expect(legacy.rows.length).toBe(explicitNull.rows.length);
    legacy.rows.forEach((row, i) => {
      expect(row.date).toBe(explicitNull.rows[i].date);
      expect(row.palace).toBe(explicitNull.rows[i].palace);
      expect(row.score).toBe(explicitNull.rows[i].score);
    });
  });
});
