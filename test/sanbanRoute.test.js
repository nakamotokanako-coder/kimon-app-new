import { describe, expect, it } from 'vitest';
import { TIME_SLOTS } from '../src/reverseDirection/reverseDirection.js';
import {
  findBestRouteForDay,
  isUsableDirection,
  scanSanbanRoutes,
  scanSanbanRoutesAsync,
  sortSanbanRoutes,
} from '../src/reverseDirection/sanbanRoute.js';

function candidate(patch = {}) {
  return {
    palace: 'kan',
    label: '北',
    score: 90,
    hachimon: '休門',
    palaceData: { hachimon: '休門' },
    palaceScore: { breakdown: {} },
    ...patch,
  };
}

function slotsWith(rankingsByHour) {
  return TIME_SLOTS.map((slot) => ({
    ...slot,
    rankings: rankingsByHour[slot.hour] || [],
  }));
}

describe('三盤ルート usable 判定', () => {
  it.each(['傷門', '杜門', '驚門', '死門'])('%s は usable=false', (hachimon) => {
    expect(isUsableDirection(candidate({ hachimon }), 80)).toBe(false);
  });

  it.each(['tenban_kan', 'hachimon', 'hasshin', 'monpaku', 'kuubou', 'ban_level_minus'])(
    '凶ペナルティ %s があれば usable=false',
    (key) => {
      expect(isUsableDirection(candidate({
        palaceScore: { breakdown: { [key]: -10 } },
      }), 80)).toBe(false);
    },
  );

  it('閾値未満は usable=false', () => {
    expect(isUsableDirection(candidate({ score: 79 }), 80)).toBe(false);
  });

  it('凶なしで閾値以上なら usable=true', () => {
    expect(isUsableDirection(candidate({ score: 80 }), 80)).toBe(true);
  });
});

describe('三盤ルート 連続3時辰判定', () => {
  it('子・丑・寅に usable があれば成立する', () => {
    const route = findBestRouteForDay('2026-06-01', slotsWith({
      0: [candidate({ score: 80 })],
      2: [candidate({ score: 90 })],
      4: [candidate({ score: 100 })],
    }));
    expect(route.slots.map((slot) => slot.hour)).toEqual([0, 2, 4]);
    expect(route.totalScore).toBe(270);
  });

  it('間の時辰に usable がなければ成立しない', () => {
    expect(findBestRouteForDay('2026-06-01', slotsWith({
      0: [candidate()],
      4: [candidate()],
    }))).toBeNull();
  });

  it('亥時から翌日の子時へは接続しない', () => {
    expect(findBestRouteForDay('2026-06-01', slotsWith({
      22: [candidate()],
      0: [candidate()],
      2: [candidate()],
    }))).toBeNull();
  });

  it('複数の成立ルートから最高合計スコアを採用する', () => {
    const route = findBestRouteForDay('2026-06-01', slotsWith({
      0: [candidate({ score: 80 })],
      2: [candidate({ score: 80 })],
      4: [candidate({ score: 80 })],
      6: [candidate({ score: 100 })],
    }));
    expect(route.slots.map((slot) => slot.hour)).toEqual([2, 4, 6]);
    expect(route.totalScore).toBe(260);
  });
});

describe('三盤ルート ★ とソート', () => {
  it('100点以上を含むルートに★情報を付ける', () => {
    const route = findBestRouteForDay('2026-06-01', slotsWith({
      0: [candidate({ score: 99 })],
      2: [candidate({ score: 100 })],
      4: [candidate({ score: 120 })],
    }));
    expect(route.hasStar).toBe(true);
    expect(route.starCount).toBe(2);
  });

  it('全時辰99点以下なら★なし', () => {
    const route = findBestRouteForDay('2026-06-01', slotsWith({
      0: [candidate({ score: 99 })],
      2: [candidate({ score: 90 })],
      4: [candidate({ score: 80 })],
    }));
    expect(route.hasStar).toBe(false);
  });

  it('合計点、★数、日付の順でソートする', () => {
    const rows = sortSanbanRoutes([
      { date: '2026-06-03', totalScore: 270, starCount: 0 },
      { date: '2026-06-02', totalScore: 280, starCount: 0 },
      { date: '2026-06-01', totalScore: 270, starCount: 1 },
      { date: '2026-05-31', totalScore: 270, starCount: 0 },
    ]);
    expect(rows.map((row) => row.date)).toEqual([
      '2026-06-02',
      '2026-06-01',
      '2026-05-31',
      '2026-06-03',
    ]);
  });
});

describe('三盤ルート 期間スキャン', () => {
  it('成立日が無い場合は0件を返す', () => {
    const result = scanSanbanRoutes({
      startDate: '2026-06-01',
      days: 7,
      buildDay: () => null,
    });
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('実データを1ヶ月分スキャンできる', () => {
    const result = scanSanbanRoutes({
      startDate: '2026-06-01',
      days: 31,
      threshold: 80,
      correctionMinutes: 19,
    });
    expect(result.errors).toHaveLength(0);
  });

  it('分割スキャンで日ごとの進捗を通知する', async () => {
    const progress = [];
    const result = await scanSanbanRoutesAsync({
      startDate: '2026-06-01',
      days: 3,
      buildDay: () => null,
      onProgress: (current, total) => progress.push([current, total]),
    });
    expect(result.rows).toHaveLength(0);
    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
  });
});
