import { describe, expect, it } from 'vitest';
import {
  SPECIAL_KAKKYOKU_NAMES,
  findSpecialKakkyokuMatches,
  getKakkyokuLookupText,
  parseLookupNames,
  scanSpecialKakkyoku,
  sortKakkyokuSearchRows,
} from '../src/reverseDirection/kakkyokuSearch.js';
import { buildBoard } from '../src/kimon/buildBoard.js';
import { lookupChito } from '../src/kimon/loadChito.js';
import { scoreBoard } from '../src/kimon/scoreEngine.js';
import { PALACE_DIRECTIONS, TIME_SLOTS } from '../src/reverseDirection/reverseDirection.js';

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
  it('名前は完全一致で拾う: 「人遁」を探して、別物の十干剋応「人遁吉格」を拾わない', () => {
    const row = { kakkyoku_da: '◯丁奇昇殿;◯玉女守門', jukkan_kokuou_da: '〇人遁吉格', kakkyoku_kan: '◯人遁', jukkan_kokuou_kan: '×白虎猖狂' };
    expect(findSpecialKakkyokuMatches(row, 'da', ['人遁', '玉女守門'])).toEqual(['玉女守門']);
    expect(findSpecialKakkyokuMatches(row, 'kan', ['人遁'])).toEqual(['人遁']);
    expect(parseLookupNames('◯丁奇昇殿;×白虎猖狂; △時格 ;')).toEqual(['丁奇昇殿', '白虎猖狂', '時格']);
  });

  it('検索で出た格局は、盤の側でも必ず検出されている（時盤60日・日盤1年）', () => {
    const missing = [];
    const check = (board, label) => {
      const score = scoreBoard(board);
      const row = lookupChito(`${board.meta.kyokusu}${board.meta.eto}`);
      for (const dir of PALACE_DIRECTIONS) {
        const ps = score.palaces[dir.palace];
        const detected = [...(ps.detected_kakkyoku || []), ...(ps.detected_jukkan || [])].map((x) => x.name);
        for (const name of findSpecialKakkyokuMatches(row, dir.palace, SPECIAL_KAKKYOKU_NAMES)) {
          if (!detected.includes(name)) missing.push(`${label} ${dir.palace} ${name}`);
        }
      }
    };
    for (let i = 0; i < 365; i += 1) {
      const date = new Date(Date.UTC(2026, 9, 4 + i)).toISOString().slice(0, 10);
      check(buildBoard({ date, boardType: '日' }), `日盤 ${date}`);
      if (i < 60) for (const slot of TIME_SLOTS) check(buildBoard({ date, hour: slot.hour, boardType: '時' }), `時盤 ${date} ${slot.hour}`);
    }
    expect(missing).toEqual([]);
  }, 60000);
});

describe('何をしたい？から格局を選ぶ（伝統的な代表用途）', () => {
  it('検索できる12の格局すべてに、一言と用途の札がある', async () => {
    const { KAKKYOKU_GUIDE, SPECIAL_KAKKYOKU_NAMES } = await import('../src/reverseDirection/kakkyokuSearch.js');
    expect(Object.keys(KAKKYOKU_GUIDE).sort()).toEqual([...SPECIAL_KAKKYOKU_NAMES].sort());
    for (const guide of Object.values(KAKKYOKU_GUIDE)) {
      expect(guide.line).toBeTruthy();
      expect(guide.tags.length).toBeGreaterThan(0);
      // 効果は約束しない
      expect(guide.line).not.toMatch(/叶う|上がる|必ず/u);
    }
  });

  it('用途ごとの格局は、どれも検索できる格局。雲遁・龍遁（雨乞い・水）だけは用途に入れない', async () => {
    const { KAKKYOKU_USES, SPECIAL_KAKKYOKU_NAMES } = await import('../src/reverseDirection/kakkyokuSearch.js');
    expect(new Set(KAKKYOKU_USES.map((use) => use.key)).size).toBe(KAKKYOKU_USES.length);
    for (const use of KAKKYOKU_USES) {
      expect(use.label).toBeTruthy();
      expect(use.names.length).toBeGreaterThan(0);
      for (const name of use.names) expect(SPECIAL_KAKKYOKU_NAMES).toContain(name);
    }
    const covered = new Set(KAKKYOKU_USES.flatMap((use) => use.names));
    expect(SPECIAL_KAKKYOKU_NAMES.filter((name) => !covered.has(name)).sort()).toEqual(['雲遁', '龍遁'].sort());
  });

  it('神社・祈願は神遁、発信・宣伝は風遁、調査は鬼遁', async () => {
    const { KAKKYOKU_USES } = await import('../src/reverseDirection/kakkyokuSearch.js');
    const names = (key) => KAKKYOKU_USES.find((use) => use.key === key).names;
    expect(names('shrine')).toEqual(['神遁']);
    expect(names('post')).toEqual(['風遁']);
    expect(names('research')).toEqual(['鬼遁']);
    expect(names('love')).toContain('玉女守門');
  });

  it('検索の結果には、用途の一言を出す', () => {
    const { rows } = scanSpecialKakkyoku({ startDate: '2026-10-06', days: 30, selectedNames: ['神遁'] });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].practicals).toEqual([{ name: '神遁', text: '神社参拝・祈願・願掛けに' }]);
  });
});
