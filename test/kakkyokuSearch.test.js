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

describe('何をしたい？から格局を選ぶ（講座の内容が主、古典は補足）', () => {
  it('検索できる12の格局すべてに、一言と用途の札がある。効果は約束しない。雨乞いは入れない', async () => {
    const { KAKKYOKU_GUIDE, SPECIAL_KAKKYOKU_NAMES } = await import('../src/reverseDirection/kakkyokuSearch.js');
    expect(Object.keys(KAKKYOKU_GUIDE).sort()).toEqual([...SPECIAL_KAKKYOKU_NAMES].sort());
    for (const guide of Object.values(KAKKYOKU_GUIDE)) {
      expect(guide.line).toBeTruthy();
      expect(guide.day).toBeTruthy();
      expect(guide.desc.length).toBeGreaterThan(30);
      expect(guide.tags.length).toBeGreaterThan(0);
      expect(Array.isArray(guide.classic)).toBe(true);
      expect(guide.examples.length).toBeGreaterThanOrEqual(15);
      expect(new Set(guide.examples).size).toBe(guide.examples.length);
      const text = [guide.line, guide.day, guide.desc, ...guide.tags, ...guide.classic, ...guide.examples, ...(guide.avoid || [])].join(' ');
      expect(text).not.toMatch(/叶う|運が上がる|運が動く|運を運ぶ|必ず|雨乞い|天候|投資する/u);
    }
  });

  it('用途の札は、講座の内容（象意辞書）に書いてある使い道と合う', async () => {
    const { getKakkyokuShoui, getJukanShoui } = await import('../src/kimon/loadShouiDict.js');
    const text = (name) => {
      const entry = getKakkyokuShoui(name) || getJukanShoui(name);
      return `${entry.original} ${entry.practical}`;
    };
    expect(text('風遁')).toMatch(/宣伝/u);
    expect(text('雲遁')).toMatch(/権謀術数|交渉/u);
    expect(text('龍遁')).toMatch(/海/u);
    expect(text('虎遁')).toMatch(/力づく|交渉/u);
    expect(text('神遁')).toMatch(/財|ひらめき/u);
    expect(text('鬼遁')).toMatch(/虚を突/u);
    expect(text('地遁')).toMatch(/報われる/u);
    expect(text('玉女守門')).toMatch(/和合/u);
  });

  it('用途ごとの格局は、どれも検索できる格局。12の格局は、どれかの用途に入っている', async () => {
    const { KAKKYOKU_USES, SPECIAL_KAKKYOKU_NAMES } = await import('../src/reverseDirection/kakkyokuSearch.js');
    expect(new Set(KAKKYOKU_USES.map((use) => use.key)).size).toBe(KAKKYOKU_USES.length);
    for (const use of KAKKYOKU_USES) {
      expect(use.label).toBeTruthy();
      expect(use.names.length).toBeGreaterThan(0);
      for (const name of use.names) expect(SPECIAL_KAKKYOKU_NAMES).toContain(name);
    }
    const covered = new Set(KAKKYOKU_USES.flatMap((use) => use.names));
    expect([...covered].sort()).toEqual([...SPECIAL_KAKKYOKU_NAMES].sort());
  });

  it('発信・宣伝は風遁と青龍返首。交渉・駆け引きは雲遁・虎遁・鬼遁。神社・祈願は神遁（「古典」の印は付けない）', async () => {
    const { KAKKYOKU_USES } = await import('../src/reverseDirection/kakkyokuSearch.js');
    const use = (key) => KAKKYOKU_USES.find((item) => item.key === key);
    expect(use('post').names).toEqual(['風遁', '青龍返首']);
    expect(use('talk').names).toEqual(['雲遁', '虎遁', '鬼遁']);
    expect(use('shrine').names).toEqual(['神遁']);
    expect(KAKKYOKU_USES.some((item) => item.classic)).toBe(false);
    const { KAKKYOKU_GUIDE } = await import('../src/reverseDirection/kakkyokuSearch.js');
    expect(KAKKYOKU_GUIDE['神遁'].tags).toContain('神社・祈願');
    expect(KAKKYOKU_GUIDE['神遁'].classic).toEqual([]);
    expect(KAKKYOKU_GUIDE['神遁'].desc).toContain('神社');
    expect(KAKKYOKU_GUIDE['神遁'].examples[0]).toBe('神社へ参拝する');
  });

  it('検索の結果には、用途の一言を出す', () => {
    const { rows } = scanSpecialKakkyoku({ startDate: '2026-10-06', days: 30, selectedNames: ['風遁'] });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].practicals).toEqual([{ name: '風遁', text: '届けたいなら、風に乗せる。' }]);
  });
});

describe('格局の絵', () => {
  it('12の格局すべてに絵があり、ファイルが置いてある', async () => {
    const { existsSync } = await import('node:fs');
    const { KAKKYOKU_GUIDE } = await import('../src/reverseDirection/kakkyokuGuide.js');
    const images = Object.values(KAKKYOKU_GUIDE).map((guide) => guide.image);
    expect(new Set(images).size).toBe(12);
    for (const image of images) expect(existsSync(`public/divination/${image}.webp`), image).toBe(true);
    expect(existsSync(`public/divination/${KAKKYOKU_GUIDE['神遁'].hero}.webp`)).toBe(true);
    for (const name of ['mountain-bg', 'botanical-branch', 'cloud-ornament']) expect(existsSync(`public/divination/${name}.webp`), name).toBe(true);
  });
});

describe('選んだ格局が全部そろう日を探す', () => {
  const row = (date, hour, palace, matches) => ({ date, text: date.replaceAll('-', '/'), weekday: '水', hour, palace, matches });

  it('日ごとにまとめて、そろう数の多い日を先に、同じ数なら早い日を先に出す', async () => {
    const { groupRowsByDay } = await import('../src/reverseDirection/kakkyokuSearch.js');
    const rows = [
      row('2026-10-07', 10, 'ken', ['人遁']),
      row('2026-10-07', 14, 'kun', ['玉女守門']),
      row('2026-10-08', 4, 'son', ['風遁']),
      row('2026-10-09', 16, 'kan', ['人遁', '風遁']),
      row('2026-10-09', 6, 'ri', ['玉女守門']),
    ];
    const days = groupRowsByDay(rows, ['人遁', '玉女守門', '風遁']);
    expect(days.map((day) => [day.date, day.matched.length, day.complete])).toEqual([
      ['2026-10-09', 3, true],
      ['2026-10-07', 2, false],
      ['2026-10-08', 1, false],
    ]);
    expect(days[0].rows.map((item) => item.hour)).toEqual([6, 16]); // 日の中は時間順
    expect(days[1].missing).toEqual(['風遁']);
    expect(days[2].missing).toEqual(['人遁', '玉女守門']);
  });

  it('時間帯や方位が違っても、同じ日に出ていれば「そろう」と数える。1つも選んでいなければ、そろわない', async () => {
    const { groupRowsByDay } = await import('../src/reverseDirection/kakkyokuSearch.js');
    const days = groupRowsByDay([row('2026-10-07', 0, 'kan', ['天遁']), row('2026-10-07', 22, 'ri', ['地遁'])], ['天遁', '地遁']);
    expect(days).toHaveLength(1);
    expect(days[0].complete).toBe(true);
    expect(groupRowsByDay([row('2026-10-07', 0, 'kan', ['天遁'])], [])[0].complete).toBe(false);
    expect(groupRowsByDay([], ['天遁'])).toEqual([]);
  });

  it('実際の盤: 全部そろう日には、選んだ格局がすべて出ている', async () => {
    const { groupRowsByDay } = await import('../src/reverseDirection/kakkyokuSearch.js');
    const names = ['青龍返首', '飛鳥跌穴', '人遁'];
    const { rows } = scanSpecialKakkyoku({ startDate: '2026-10-07', days: 30, selectedNames: names });
    const days = groupRowsByDay(rows, names);
    expect(days.reduce((sum, day) => sum + day.rows.length, 0)).toBe(rows.length);
    for (const day of days.filter((item) => item.complete)) {
      const present = new Set(day.rows.flatMap((item) => item.matches));
      for (const name of names) expect(present.has(name)).toBe(true);
    }
    for (let i = 1; i < days.length; i += 1) expect(days[i - 1].matched.length).toBeGreaterThanOrEqual(days[i].matched.length);
  });
});
