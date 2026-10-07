import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { answer, MENU } from '../lib/billingApi/line.js';
import { setLineTodayData } from '../lib/lineToday.js';
import { countLine, loadWent, recordWent, recordedText, wentListText, WENT_MAX } from '../lib/lineWent.js';
import { setKvClient } from '../lib/kv.js';

const APP = 'https://example.com';
const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
const NOW = new Date('2026-10-07T10:00:00+09:00'); // 9-11時（時間帯の値 10）

function makeFakeKv() {
  const store = new Map();
  return {
    store,
    async set(key, value) { store.set(key, value); return 'OK'; },
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async del(key) { store.delete(key); return 1; },
  };
}

const textEvent = (text) => ({ type: 'message', replyToken: 'rt', source: { userId: 'U1' }, message: { type: 'text', text } });
const postbackEvent = (data) => ({ type: 'postback', replyToken: 'rt', source: { userId: 'U1' }, postback: { data } });
const actions = (message) => message.quickReply.items.map((item) => item.action);

// 2026-10-07 の 9-11時の吉方位を「西」にした表
function useTable(entry = { dir: '西', score: 90, badge: '大吉', gate: '生門', theme: '金運', vetoes: [], others: [] }) {
  const row = Array(12).fill(0);
  row[5] = 1;
  setLineTodayData({ dirs: DIRS, entries: [{ dir: null }, entry], time: { '2026-10-07': row }, day: {}, dayDirs: {}, themes: [], themeHours: [], themeDay: {}, themeTime: {} });
}

let kvFake;
beforeEach(() => {
  kvFake = makeFakeKv();
  setKvClient(kvFake);
});
afterEach(() => {
  setKvClient(null);
  setLineTodayData(null);
});

describe('「行ってきた」の記録', () => {
  it('記録は新しい順。同じ日・同じ方位は1回だけ', async () => {
    expect((await recordWent('U1', '2026-10-05', '北')).added).toBe(true);
    expect((await recordWent('U1', '2026-10-07', '西')).added).toBe(true);
    const again = await recordWent('U1', '2026-10-07', '西');
    expect(again.added).toBe(false);
    expect(await loadWent('U1')).toEqual([{ date: '2026-10-07', dir: '西' }, { date: '2026-10-05', dir: '北' }]);
  });

  it(`${WENT_MAX}件までで、古いものから消える`, async () => {
    kvFake.store.set('line:went:U1', Array.from({ length: WENT_MAX }, (_, i) => ({ date: '2026-01-01', dir: `d${i}` })));
    const { list } = await recordWent('U1', '2026-10-07', '西');
    expect(list).toHaveLength(WENT_MAX);
    expect(list[0]).toEqual({ date: '2026-10-07', dir: '西' });
  });

  it('この7日間の回数と、合計を数える（7日より前は合計だけ）', () => {
    const list = [{ date: '2026-10-07', dir: '西' }, { date: '2026-10-01', dir: '北' }, { date: '2026-09-30', dir: '南' }];
    expect(countLine(list, '2026-10-07')).toBe('この7日間で2回、これまでの合計は3回です。');
  });

  it('押した直後の文と、記録の一覧の文', () => {
    const list = [{ date: '2026-10-07', dir: '西' }];
    expect(recordedText({ list, added: true }, '2026-10-07', '西', '2026-10-07'))
      .toBe('👣 記録しました\n10月7日（水）「西」へ\n\nこの7日間で1回、これまでの合計は1回です。');
    expect(recordedText({ list, added: false }, '2026-10-07', '西', '2026-10-07')).toContain('もう記録してあります。');
    expect(wentListText(list, '2026-10-07')).toContain('最近の記録\n・10月7日（水）西');
    expect(wentListText([], '2026-10-07')).toContain('まだ記録がありません。');
  });
});

describe('LINE の「行ってきた」', () => {
  it('今の吉方位の返信に「行ってきた」が付き、押すと記録される', async () => {
    useTable();
    const now = await answer(textEvent(MENU.now), NOW, APP);
    const [went, theme, day] = actions(now);
    expect(went).toMatchObject({ type: 'postback', label: '行ってきた', data: 'went:2026-10-07:6' });
    expect([theme.text, day.text]).toEqual([MENU.theme, MENU.day]);

    const done = await answer(postbackEvent(went.data), NOW, APP);
    expect(done.text).toContain('👣 記録しました\n10月7日（水）「西」へ');
    expect(actions(done)[0].text).toBe(MENU.log);
    expect(kvFake.store.get('line:went:U1')).toEqual([{ date: '2026-10-07', dir: '西' }]);
  });

  it('吉方位がない時間帯には「行ってきた」を出さない', async () => {
    useTable();
    const now = await answer(textEvent(MENU.now), new Date('2026-10-07T13:30:00+09:00'), APP);
    expect(actions(now).map((a) => a.label)).toEqual([MENU.theme, MENU.day]);
  });

  it('翌日までは押せる。それより古いボタンと、先の日付は記録しない', async () => {
    useTable();
    const nextDay = new Date('2026-10-08T09:00:00+09:00');
    expect((await answer(postbackEvent('went:2026-10-07:6'), nextDay, APP)).text).toContain('記録しました');

    const later = new Date('2026-10-09T09:00:00+09:00');
    expect((await answer(postbackEvent('went:2026-10-07:0'), later, APP)).text).toContain('もう使えません');
    expect((await answer(postbackEvent('went:2026-10-20:0'), later, APP)).text).toContain('もう使えません');
    expect((await answer(postbackEvent('went:2026-10-09:99'), later, APP)).text).toContain('もう使えません');
    expect(kvFake.store.get('line:went:U1')).toHaveLength(1);
  });

  it('「記録を見る」で一覧を返し、「記録を消す」で消える', async () => {
    useTable();
    expect((await answer(textEvent(MENU.log), NOW, APP)).text).toContain('まだ記録がありません。');

    await answer(postbackEvent('went:2026-10-07:6'), NOW, APP);
    const list = await answer(textEvent(MENU.log), NOW, APP);
    expect(list.text).toContain('この7日間で1回、これまでの合計は1回です。');
    expect(actions(list)[0].data).toBe('went:clear');

    expect((await answer(postbackEvent('went:clear'), NOW, APP)).text).toBe('記録を消しました。');
    expect(kvFake.store.has('line:went:U1')).toBe(false);
  });
});
