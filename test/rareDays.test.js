import { describe, it, expect } from 'vitest';
import {
  RARE_TIERS, RARE_RANGE, computeRareEvents, findRareEvents, upcomingRareEvents, countdownLabel, rareOutlook,
  remainingThisYear, remainingLabel, eventStartDate, daysBetween, addDays,
} from '../src/reverseDirection/rareDays.js';
import { buildRareNotices } from '../src/notifications/dynamicNotices.js';
import { rareHeadline, rareWhenLabel, rareDateLabel } from '../src/components/RareDay.jsx';
import { buildReverseBoard, buildDayReverseBoard } from '../src/reverseDirection/reverseDirection.js';
import { SPECIAL_KAKKYOKU_NAMES } from '../src/reverseDirection/kakkyokuSearch.js';

// 稀日（満盤・極盤・双格）。決め方と回数: docs/rare_days_v1.md

describe('稀日の種類', () => {
  it('3つ。珍しいほど order が大きい。名前は効果を約束しない', () => {
    expect(Object.keys(RARE_TIERS)).toEqual(['manban', 'kyokuban', 'soukaku']);
    expect(Object.values(RARE_TIERS).map((tier) => [tier.name, tier.reading, tier.rarity])).toEqual([
      ['満盤', 'まんばん', '年に約18回'],
      ['極盤', 'きょくばん', '年に約7回'],
      ['双格', 'そうかく', '年に4回だけ'],
    ]);
    const orders = Object.values(RARE_TIERS).map((tier) => tier.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const tier of Object.values(RARE_TIERS)) {
      expect(`${tier.name}${tier.meaning}${tier.desc}${tier.rarity}`).not.toMatch(/運が|開運|最強|叶う|必ず/u);
    }
  });
});

describe('稀日を見つける（2026-10-07 から）', () => {
  const events = findRareEvents({ startDate: '2026-10-07', days: 84 });

  it('早い順に並ぶ。はじめは 10/28 21-23時の満盤（南東・風遁・120点）', () => {
    expect(events[0]).toMatchObject({ tier: 'manban', date: '2026-10-28', hour: 22, timeLabel: '21-23時', names: ['風遁'] });
    expect(events[0].best).toMatchObject({ label: '南東', score: 120 });
    const keys = events.map((event) => `${event.date}|${String(event.hour ?? 99).padStart(2, '0')}`);
    expect(keys).toEqual([...keys].sort());
  });

  it('満盤は、その時間帯の時盤で、特別格局が乗った方位がほんとうに120点', () => {
    for (const event of events.filter((item) => item.tier === 'manban')) {
      const { rankings } = buildReverseBoard({ date: event.date, hour: event.hour });
      const spot = rankings.find((item) => item.palace === event.best.palace);
      expect(spot.score).toBe(120);
      for (const name of event.names) expect(SPECIAL_KAKKYOKU_NAMES).toContain(name);
    }
  });

  it('極盤は、その日の日盤で、特別格局が乗った方位が100点以上（11/30 北・天遁、12/2 南東・玉女守門）', () => {
    const kyokuban = events.filter((item) => item.tier === 'kyokuban');
    expect(kyokuban.map((item) => [item.date, item.best.label, item.names.join('・')])).toEqual([
      ['2026-11-30', '北', '天遁'],
      ['2026-12-02', '南東', '玉女守門'],
    ]);
    for (const event of kyokuban) {
      expect(event.hour).toBe(null);
      const { rankings } = buildDayReverseBoard({ date: event.date });
      expect(rankings.find((item) => item.palace === event.best.palace).score).toBeGreaterThanOrEqual(100);
    }
  });

  it('双格は、日盤に特別格局が2つ並ぶ日。1年に4回（2027年は 1/17・4/16・4/17・5/13）', () => {
    const year = findRareEvents({ startDate: '2026-10-07', days: 365 }).filter((item) => item.tier === 'soukaku');
    expect(year.map((item) => [item.date, item.names.join('＋')])).toEqual([
      ['2027-01-17', '天遁＋神遁'],
      ['2027-04-16', '雲遁＋鬼遁'],
      ['2027-04-17', '青龍返首＋鬼遁'],
      ['2027-05-13', '雲遁＋虎遁'],
    ]);
    // 別々の方位に乗る日は、方位を両方出す
    expect(year[2].spots.map((spot) => spot.label)).toEqual(['北東', '南東']);
  });
});

describe('いま知らせる稀日（3日前から当日まで）', () => {
  it('3日前より前は出さない。3日前から出て、過ぎたら消える', () => {
    expect(upcomingRareEvents({ today: '2026-10-24', liveSlotHour: 10 })).toEqual([]);
    expect(upcomingRareEvents({ today: '2026-10-25', liveSlotHour: 10 }).map((item) => item.id)).toEqual(['manban-2026-10-28-22']);
    // 当日: 21-23時がまだ来ていなければ出す。23-1時に入ったら（一覧の先頭の時間帯）もう出さない日付になっている
    expect(upcomingRareEvents({ today: '2026-10-28', liveSlotHour: 22 }).map((item) => item.id)).toContain('manban-2026-10-28-22');
    expect(upcomingRareEvents({ today: '2026-10-29', liveSlotHour: 18 }).map((item) => item.id)).not.toContain('manban-2026-10-29-16');
    expect(upcomingRareEvents({ today: '2026-10-29', liveSlotHour: 16 }).map((item) => item.id)).toContain('manban-2026-10-29-16');
  });

  it('いくつかあるときは、珍しいものが先', () => {
    // 11/28 の満盤と、11/30 の極盤が、11/27 から見て3日のうちにある
    const list = upcomingRareEvents({ today: '2026-11-27', liveSlotHour: 6 });
    expect(list[0].tier).toBe('kyokuban');
    expect(list.slice(1).every((item) => item.tier === 'manban')).toBe(true);
  });

  it('日数の言い方', () => {
    const event = findRareEvents({ startDate: '2026-10-07', days: 84 })[0];
    expect(countdownLabel(event, '2026-10-25')).toBe('あと3日');
    expect(countdownLabel(event, '2026-10-27')).toBe('明日');
    expect(countdownLabel(event, '2026-10-28')).toBe('今日');
    expect(daysBetween('2026-10-25', '2026-10-28')).toBe(3);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('どのくらい珍しいか', () => {
  it('同じ種類が次に出るまでの日数と、12週間のうち出る週', () => {
    const event = findRareEvents({ startDate: '2026-10-25', days: 4 })[0];
    const outlook = rareOutlook(event, '2026-10-25');
    expect(outlook.nextInDays).toBe(1); // 10/28 の次は 10/29
    expect(outlook.weeks).toHaveLength(12);
    expect(outlook.weeks[0]).toBe(true);
    expect(outlook.weeks.filter(Boolean).length).toBeLessThan(12);
  });
});

describe('画面とお知らせの言葉', () => {
  const events = findRareEvents({ startDate: '2026-10-07', days: 365 });
  const manban = events.find((item) => item.tier === 'manban');
  const kyokuban = events.find((item) => item.tier === 'kyokuban');
  const soukaku = events.find((item) => item.tier === 'soukaku');

  it('日時と一言', () => {
    expect(rareDateLabel('2026-10-28')).toBe('10/28（水）');
    expect(rareWhenLabel(manban)).toBe('10/28（水） 21:00–23:00');
    expect(rareWhenLabel(kyokuban)).toBe('11/30（月）');
    expect(rareHeadline(manban)).toBe('風遁の方位が、満点の120点になります。');
    expect(rareHeadline(kyokuban)).toBe('天遁の方位が、日盤で100点になります。');
    expect(rareHeadline(soukaku)).toBe('天遁と神遁が、同じ日に並びます。');
  });

  it('ベルのお知らせ: 何日後か・日時・方位・回数が入る。効果は約束しない', () => {
    const [notice] = buildRareNotices({ today: '2026-10-25', events: [manban] });
    expect(notice).toMatchObject({ id: 'rare-manban-2026-10-28-22', sender: '稀日', title: 'あと3日で「満盤」です', date: '2026/10/25' });
    expect(notice.body).toContain('10/28（水） 21:00–23:00 南東');
    expect(notice.body).toContain('この盤が出るのは年に約18回。2026年は、この回を入れてあと6回です。');
    expect(buildRareNotices({ today: '2026-10-27', events: [manban] })[0].title).toBe('明日は「満盤」です');
    expect(buildRareNotices({ today: '2026-10-28', events: [manban] })[0].title).toBe('今日は「満盤」です');
    expect(`${notice.title}${notice.body}`).not.toMatch(/運が|開運|叶う|必ず/u);
    expect(buildRareNotices({ today: '2026-10-25', events: [] })).toEqual([]);
  });
});

describe('先に数えておいた表（rareDays.generated.js）', () => {
  it('表は、実際の盤を数えた結果と同じ（点数や格局の判定を変えたら npm run build:rare で作り直す）', () => {
    for (const startDate of ['2026-10-07', '2027-04-01', '2031-07-20']) {
      const live = computeRareEvents({ startDate, days: 60 });
      const table = findRareEvents({ startDate, days: 60 });
      expect(table.map((item) => item.id)).toEqual(live.map((item) => item.id));
      expect(table).toEqual(live);
    }
  }, 120000);

  it('表の期間は、アプリの日盤と同じ。1年あたりの回数は、画面の表示と合う', () => {
    expect(RARE_RANGE).toEqual({ min: '2026-01-01', max: '2044-01-31' });
    const all = findRareEvents({ startDate: RARE_RANGE.min, days: daysBetween(RARE_RANGE.min, RARE_RANGE.max) + 1 });
    const years = (daysBetween(RARE_RANGE.min, RARE_RANGE.max) + 1) / 365.25;
    for (const tier of Object.values(RARE_TIERS)) {
      const perYear = all.filter((item) => item.tier === tier.key).length / years;
      expect(Math.round(perYear), tier.name).toBe(tier.perYear);
      expect(tier.rarity).toContain(String(tier.perYear));
    }
    // 表の外の日付には出さない
    expect(findRareEvents({ startDate: '2050-01-01', days: 30 })).toEqual([]);
  });
});

describe('深夜・早朝の満盤も入れる', () => {
  const all = findRareEvents({ startDate: '2026-10-07', days: 400 });

  it('23-1時の満盤は、盤の日付の前の日の夜に始まる（7/27 の盤 → 7/26（月）23:00–翌1:00）', () => {
    const night = all.find((item) => item.hour === 0);
    expect(night.id).toBe('manban-2027-07-27-0');
    expect(eventStartDate(night)).toBe('2027-07-26');
    expect(rareWhenLabel(night)).toBe('7/26（月） 23:00–翌1:00');
    // 知らせるのも、始まる日で数える
    expect(countdownLabel(night, '2027-07-26')).toBe('今日');
    expect(countdownLabel(night, '2027-07-25')).toBe('明日');
    expect(upcomingRareEvents({ today: '2027-07-23', liveSlotHour: 10 }).map((item) => item.id)).toContain('manban-2027-07-27-0');
    expect(upcomingRareEvents({ today: '2027-07-22', liveSlotHour: 10 }).map((item) => item.id)).not.toContain('manban-2027-07-27-0');
    // 夜11時を過ぎると盤の日付が次の日になり、その時間帯のあいだは出る。1時を過ぎたら消える
    expect(upcomingRareEvents({ today: '2027-07-27', liveSlotHour: 0 }).map((item) => item.id)).toContain('manban-2027-07-27-0');
    expect(upcomingRareEvents({ today: '2027-07-27', liveSlotHour: 2 }).map((item) => item.id)).not.toContain('manban-2027-07-27-0');
  });

  it('深夜・早朝（朝5時より前・夜11時より後）の満盤が、表に入っている', () => {
    const lateOrEarly = all.filter((item) => item.tier === 'manban' && [0, 2, 4].includes(item.hour));
    expect(lateOrEarly.length).toBeGreaterThan(0);
  });
});

describe('今年はあと何回', () => {
  const events = findRareEvents({ startDate: '2026-10-07', days: 90 });

  it('同じ種類が、その年のうちにあと何回出るか（この回を入れて数える）', () => {
    const manban = events.filter((item) => item.tier === 'manban');
    expect(manban.map((item) => remainingThisYear(item))).toEqual([6, 5, 4, 3, 2, 1]);
    expect(remainingLabel(manban[0])).toBe('2026年は、この回を入れてあと6回');
    expect(remainingLabel(manban[5])).toBe('2026年は、これが最後');
    const kyokuban = events.filter((item) => item.tier === 'kyokuban');
    expect(kyokuban.map((item) => remainingLabel(item))).toEqual(['2026年は、この回を入れてあと2回', '2026年は、これが最後']);
  });

  it('年が変わると、数え直す', () => {
    const first2027 = findRareEvents({ startDate: '2027-01-01', days: 365 }).find((item) => item.tier === 'soukaku');
    expect(first2027.date).toBe('2027-01-17');
    expect(remainingLabel(first2027)).toBe('2027年は、この回を入れてあと4回');
  });
});
