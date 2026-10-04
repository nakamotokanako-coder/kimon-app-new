import { describe, expect, it } from 'vitest';
import {
  findSpecialKakkyokuMatches,
  getKakkyokuLookupText,
  scanSpecialKakkyoku,
  sortKakkyokuSearchRows,
} from '../src/reverseDirection/kakkyokuSearch.js';

describe('special kakkyoku lookup search', () => {
  it('reads both kakkyoku and jukkan_kokuou palace columns', () => {
    const row = {
      kakkyoku_kan: '◯雲遁;×青龍逃走',
      jukkan_kokuou_kan: '〇青龍返首;△星髄月転',
    };

    expect(getKakkyokuLookupText(row, 'kan')).toEqual({
      kakkyoku: '◯雲遁;×青龍逃走',
      jukkanKokuou: '〇青龍返首;△星髄月転',
    });
  });

  it('matches selected names by partial text across both lookup columns as OR', () => {
    const row = {
      kakkyoku_kun: '◯丁奇得使;◯玉女守門;×丁奇入墓',
      jukkan_kokuou_kun: '×青龍逃走',
    };

    expect(findSpecialKakkyokuMatches(row, 'kun', ['青龍返首', '玉女守門', '雲遁']))
      .toEqual(['玉女守門']);
  });

  it('sorts by date by default and by score when requested', () => {
    const rows = [
      { date: '2026-06-02', hour: 8, palace: 'kan', score: 80 },
      { date: '2026-06-01', hour: 10, palace: 'kan', score: 40 },
      { date: '2026-06-01', hour: 2, palace: 'kan', score: 60 },
    ];

    expect(sortKakkyokuSearchRows(rows, 'date').map((row) => `${row.date}-${row.hour}`))
      .toEqual(['2026-06-01-2', '2026-06-01-10', '2026-06-02-8']);
    expect(sortKakkyokuSearchRows(rows, 'score').map((row) => row.score))
      .toEqual([80, 60, 40]);
  });

  it('returns only existing scoreEngine usable palaces in real scans', () => {
    const result = scanSpecialKakkyoku({
      startDate: '2025-12-05',
      days: 7,
      selectedNames: ['青龍返首', '飛鳥跌穴', '玉女守門', '雲遁'],
      sortMode: 'date',
    });

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((row) => row.palaceScore.usable)).toBe(true);
    expect(result.rows.every((row) => row.matches.length > 0)).toBe(true);
  });
  it('日盤も調べられる: 1日に1件ずつ、日盤として返る（時盤の結果と混ざらない）', () => {
    const args = { startDate: '2026-10-04', days: 92, selectedNames: ['青龍返首', '飛鳥跌穴', '人遁', '玉女守門'], sortMode: 'date' };
    const day = scanSpecialKakkyoku({ ...args, boardType: '日' });

    expect(day.errors).toEqual([]);
    expect(day.rows.length).toBeGreaterThan(0);
    expect(day.rows.every((row) => row.boardType === '日' && row.timeLabel === '日盤' && row.hour === 0)).toBe(true);
    expect(day.rows.every((row) => row.palaceScore.usable && row.matches.length > 0)).toBe(true);
    // 同じ日・同じ方位は1行だけ（日盤は1日に盤が1つ）
    const keys = day.rows.map((row) => `${row.date}/${row.palace}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('盤を指定しなければ今までどおり時盤を調べる', () => {
    const args = { startDate: '2025-12-05', days: 7, selectedNames: ['青龍返首', '飛鳥跌穴'], sortMode: 'date' };
    const implicit = scanSpecialKakkyoku(args);
    const explicit = scanSpecialKakkyoku({ ...args, boardType: '時' });
    expect(implicit.rows.map((r) => `${r.date}-${r.hour}-${r.palace}`)).toEqual(explicit.rows.map((r) => `${r.date}-${r.hour}-${r.palace}`));
    expect(implicit.rows.every((row) => row.boardType === '時')).toBe(true);
  });
});
