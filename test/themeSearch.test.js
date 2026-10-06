import { describe, it, expect } from 'vitest';
import {
  buildReverseBoard, buildDayReverseBoard, buildTimeline, getMiniBoardToneClass,
} from '../src/reverseDirection/reverseDirection.js';
import { computeAxisRanks } from '../src/reverseDirection/FusionCard.jsx';
import { makeKaisetsuKey } from '../src/kaisetsu/boardKey.js';
import {
  THEMES, themeLabel, rankingsForTheme, timelineForTheme, nextSlotForTheme,
  bestTimesForTheme, bestDaysForTheme, DAYTIME_HOURS,
} from '../src/reverseDirection/themeSearch.js';

// 目的（ご縁・仕事・金運・健康・勉強）から方位を探す。

const weight = (rank) => (rank === '◎' ? 2 : 1);

describe('目的から方位を探す', () => {
  it('選べる目的は5つ。名前を引ける', () => {
    expect(THEMES.map((item) => item.label)).toEqual(['ご縁', '仕事', '金運', '健康', '勉強']);
    expect(themeLabel('shigoto')).toBe('仕事');
    expect(themeLabel('')).toBe('');
  });

  it('目的を選んでいなければ空', () => {
    const { board, rankings } = buildReverseBoard({ date: '2026-10-06', hour: 18 });
    expect(rankingsForTheme(makeKaisetsuKey(board.meta), rankings, '')).toEqual([]);
  });

  it('2026-10-06 17-19時・仕事: 南東（+100・仕事◎）が一番、北東（+30・仕事○）が続く。凶の方位は出ない', () => {
    const { board, rankings } = buildReverseBoard({ date: '2026-10-06', hour: 18 });
    const found = rankingsForTheme(makeKaisetsuKey(board.meta), rankings, 'shigoto');
    expect(found.map((item) => [item.label, item.score, item.themeRank])).toEqual([
      ['南東', 100, '◎'],
      ['東', 60, '○'],
      ['北東', 30, '○'],
    ]);
  });

  it.each(['時', '日'])('1年ぶん（%s盤）: 出てくる方位は必ず総合が吉で、その目的が◎か○。◎が先、同じなら点数の高い順', (kind) => {
    const start = Date.UTC(2026, 0, 1);
    for (let d = 0; d < 365; d += 7) {
      const date = new Date(start + d * 86400000).toISOString().slice(0, 10);
      for (const hour of (kind === '時' ? [0, 6, 12, 18] : [null])) {
        const { board, rankings } = kind === '時' ? buildReverseBoard({ date, hour }) : buildDayReverseBoard({ date });
        const key = makeKaisetsuKey(board.meta);
        for (const theme of THEMES.map((item) => item.key)) {
          const found = rankingsForTheme(key, rankings, theme);
          const expected = rankings.filter((item) => ['◎', '○'].includes(computeAxisRanks(key, item.palace, item.palaceScore)[theme]));
          expect(found.map((item) => item.palace).sort()).toEqual(expected.map((item) => item.palace).sort());
          found.forEach((item, index) => {
            expect(['daikichi', 'shokichi']).toContain(getMiniBoardToneClass(item.score, item.palaceScore));
            if (index === 0) return;
            const prev = found[index - 1];
            expect(weight(prev.themeRank)).toBeGreaterThanOrEqual(weight(item.themeRank));
            if (prev.themeRank === item.themeRank) expect(prev.score).toBeGreaterThanOrEqual(item.score);
          });
        }
      }
    }
  });

  it('時間帯の一覧: 目的を選ぶと、各時間帯の一番がその目的の一番になる。選ばなければそのまま', () => {
    const timeline = buildTimeline({ date: '2026-10-06', goodOnly: true });
    expect(timelineForTheme(timeline, '')).toBe(timeline);
    const themed = timelineForTheme(timeline, 'benkyo');
    expect(themed).toHaveLength(12);
    themed.forEach((slot, index) => {
      expect(slot.hour).toBe(timeline[index].hour);
      const found = rankingsForTheme(slot.boardKey, slot.rankings, 'benkyo');
      expect(slot.best?.palace || null).toBe(found[0]?.palace || null);
      if (slot.best) expect(['◎', '○']).toContain(slot.best.themeRank);
    });
  });

  it('向く方位が無い時間帯からは、次に向く方位がある時間帯を案内できる', () => {
    const slots = [
      { hour: 0, best: { label: '北' } },
      { hour: 2, best: null },
      { hour: 4, best: null },
      { hour: 6, best: { label: '南' } },
      { hour: 8, best: null },
    ];
    expect(nextSlotForTheme(slots, 2).hour).toBe(6);
    expect(nextSlotForTheme(slots, 4).hour).toBe(6);
    expect(nextSlotForTheme(slots, 8)).toBe(null); // その日の残りに無ければ案内しない
  });
});

describe('目的から探す: いつ・どの方位が一番向くか（順位）', () => {
  const week = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'];
  const weightOf = (entry) => (entry.item.themeRank === '◎' ? 2 : 1);

  it('今日: 今の時間帯より前は出さない。◎が先、同じなら点数の高い順。上位3つまで', () => {
    const found = bestTimesForTheme({ theme: 'shigoto', dates: ['2026-10-06'], fromHour: 18 });
    expect(found.length).toBeLessThanOrEqual(3);
    expect(found.length).toBeGreaterThan(0);
    for (const entry of found) {
      expect(entry.date).toBe('2026-10-06');
      expect([18, 20, 22]).toContain(entry.hour);
      expect(['◎', '○']).toContain(entry.item.themeRank);
      expect(entry.item.score).toBeGreaterThan(0);
    }
    // 17-19時の一番は 南東 +100（仕事◎）
    expect(found[0]).toMatchObject({ hour: 18, label: '17-19時' });
    expect(found[0].item).toMatchObject({ label: '南東', score: 100, themeRank: '◎' });
    found.slice(1).forEach((entry, index) => {
      const prev = found[index];
      expect(weightOf(prev)).toBeGreaterThanOrEqual(weightOf(entry));
      if (weightOf(prev) === weightOf(entry)) expect(prev.item.score).toBeGreaterThanOrEqual(entry.item.score);
    });
  });

  it('1週間（時盤）: 深夜・早朝の時間帯は入れない。1つの時間帯からは方位を1つだけ', () => {
    const found = bestTimesForTheme({ theme: 'goen', dates: week, fromHour: 18, limit: 50 });
    expect(found.length).toBeGreaterThan(3);
    const seen = new Set();
    for (const entry of found) {
      expect(week).toContain(entry.date);
      expect(DAYTIME_HOURS).toContain(entry.hour);
      const id = `${entry.date}-${entry.hour}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
    expect(DAYTIME_HOURS).toEqual([6, 8, 10, 12, 14, 16, 18, 20, 22]);
  });

  it('深夜でも、今の時間帯だけは出す', () => {
    const found = bestTimesForTheme({ theme: 'goen', dates: ['2026-10-06'], fromHour: 2, limit: 50 });
    const night = found.filter((entry) => !DAYTIME_HOURS.includes(entry.hour));
    expect(night.every((entry) => entry.hour === 2)).toBe(true);
  });

  it('1週間（日盤）: 1つの日からは方位を1つだけ。その日の日盤で、その目的が◎か○の一番', () => {
    const found = bestDaysForTheme({ theme: 'kinun', dates: week, limit: 7 });
    expect(new Set(found.map((entry) => entry.date)).size).toBe(found.length);
    for (const entry of found) {
      const { board, rankings } = buildDayReverseBoard({ date: entry.date });
      const best = rankingsForTheme(makeKaisetsuKey(board.meta), rankings, 'kinun')[0];
      expect(entry.item.palace).toBe(best.palace);
    }
    expect(bestDaysForTheme({ theme: 'kinun', dates: week }).length).toBeLessThanOrEqual(3);
  });

  it('目的を選んでいなければ空。暦の範囲の外の日は飛ばす', () => {
    expect(bestTimesForTheme({ theme: '', dates: week })).toEqual([]);
    expect(bestDaysForTheme({ theme: '', dates: week })).toEqual([]);
    expect(bestDaysForTheme({ theme: 'goen', dates: ['1900-01-01'] })).toEqual([]);
  });
});
