import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import billingHandler from '../api/billing.js';
import { answer, isValidSignature, MENU } from '../lib/billingApi/line.js';
import {
  buildDayText, buildNowText, buildWhenText, correctionMinutes, dateLabel, loadLineToday,
  restDayChoices, setLineTodayData, slotLabel,
} from '../lib/lineToday.js';
import { setKvClient } from '../lib/kv.js';
import {
  buildDayReverseBoard, buildReverseBoard, getLongitudeCorrectionMinutes, getMiniBoardToneClass,
  PALACE_DIRECTIONS, TIME_SLOTS,
} from '../src/reverseDirection/reverseDirection.js';

const ROOT = new URL('..', import.meta.url);
const DATA_PATH = fileURLToPath(new URL('data/line/generated/today.json', ROOT));
const SECRET = 'line-test-secret';
const TOKEN = 'line-test-token';
const APP = 'https://example.com';

function createRes() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(n, v) { this.headers[n] = v; },
    status(c) { this.statusCode = c; return this; },
    json(v) { this.body = v; return this; },
    end() { return this; },
  };
}

function makeFakeKv() {
  const store = new Map();
  return {
    store,
    async set(key, value) { store.set(key, value); return 'OK'; },
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async del(key) { store.delete(key); return 1; },
  };
}

const sign = (raw, secret = SECRET) => createHmac('sha256', secret).update(raw).digest('base64');

function post(payload, { signature } = {}) {
  const raw = JSON.stringify(payload);
  const res = createRes();
  const req = {
    method: 'POST',
    query: { action: 'line' },
    headers: { 'x-line-signature': signature ?? sign(raw), host: 'kimon-tonko.vercel.app' },
    body: raw,
  };
  return billingHandler(req, res).then(() => res);
}

const source = { userId: 'U1' };
const textEvent = (text) => ({ type: 'message', replyToken: 'rt-1', source, message: { type: 'text', text } });
const postbackEvent = (data, params) => ({ type: 'postback', replyToken: 'rt-1', source, postback: { data, params } });
const locationEvent = (longitude) => ({ type: 'message', replyToken: 'rt-1', source, message: { type: 'location', latitude: 35, longitude } });

const good = (rankings) => rankings
  .filter((item) => item.score > 0 && getMiniBoardToneClass(item.score, item.palaceScore) !== 'kyo');

const best = (over = {}) => ({ dir: '北', score: 70, badge: '大吉', gate: '休門', theme: 'ご縁', vetoes: [], others: ['北東'], ...over });
const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];

// 時盤の表を1日ぶん作る（指定した時間帯だけ中身を入れ、ほかは「吉方位なし」）
function timeTable(date, slotHour, entry) {
  const row = Array(12).fill(0);
  row[slotHour / 2] = 1;
  return { dirs: DIRS, entries: [{ dir: null }, entry], time: { [date]: row }, day: {}, dayDirs: {} };
}

beforeAll(() => {
  // 表の形が古い（作り直していない）ときも作り直す
  let stale = !existsSync(DATA_PATH);
  if (!stale) stale = !loadLineToday().dayDirs;
  if (stale) {
    execFileSync('node', ['scripts/build_line_today.mjs'], { cwd: fileURLToPath(ROOT), stdio: 'ignore' });
    setLineTodayData(null);
  }
}, 120000);

describe('吉方位の表（scripts/build_line_today.mjs）', () => {
  const DATES = ['2026-10-06', '2027-03-15', '2031-08-01', '2043-12-31'];

  it('時盤の内容が、アプリの時盤と同じ', () => {
    const { entries, time } = loadLineToday();
    for (const date of DATES) {
      TIME_SLOTS.forEach((slot, i) => {
        const list = good(buildReverseBoard({ date, hour: slot.hour }).rankings);
        const entry = entries[time[date][i]];
        if (!list.length) {
          expect(entry).toEqual({ dir: null });
          return;
        }
        expect(entry.dir).toBe(list[0].label);
        expect(entry.score).toBe(list[0].score);
        expect(entry.gate).toBe(list[0].palaceData.hachimon);
        expect(entry.others).toEqual(list.slice(1, 3).map((item) => item.label));
      });
    }
  });

  it('日盤の内容が、アプリの日盤と同じ（一番の吉方位と、方位ごとの点数）', () => {
    const { dirs, entries, day, dayDirs } = loadLineToday();
    expect(dirs).toEqual(PALACE_DIRECTIONS.map((direction) => direction.label));
    for (const date of DATES) {
      const list = good(buildDayReverseBoard({ date }).rankings);
      const entry = entries[day[date]];
      if (list.length) {
        expect(entry.dir).toBe(list[0].label);
        expect(entry.score).toBe(list[0].score);
      } else {
        expect(entry).toEqual({ dir: null });
      }
      dirs.forEach((dir, i) => {
        const hit = list.find((item) => item.label === dir);
        expect(entries[dayDirs[date][i]]?.score).toBe(hit?.score);
      });
    }
  });

  it('凶の印が付く方位は、吉方位として入っていない', () => {
    const { entries } = loadLineToday();
    expect(entries.some((entry) => entry.badge === '凶')).toBe(false);
    expect(entries.every((entry) => entry.dir === null || entry.score > 0)).toBe(true);
  });

  it('時間帯の書き方と、経度から出す分数がアプリと同じ', () => {
    for (const slot of TIME_SLOTS) expect(slotLabel(slot.hour)).toBe(slot.label);
    for (const lng of [130.4, 135, 139.69, 141.35]) expect(correctionMinutes(lng)).toBe(getLongitudeCorrectionMinutes(lng));
  });
});

describe('今の吉方位の文（時盤）', () => {
  afterEach(() => setLineTodayData(null));

  it('日付に曜日を付ける', () => {
    expect(dateLabel('2026-10-06')).toBe('10月6日（火）');
  });

  it('吉方位・時間帯・点数・門のテーマ・ほかの吉方位・地図へのリンクを入れる', () => {
    setLineTodayData(timeTable('2026-10-06', 10, best()));
    const text = buildNowText(new Date('2026-10-06T10:00:00+09:00'), APP);
    expect(text).toContain('今から使える吉方位は「北」です。');
    expect(text).toContain('10月6日（火）9-11時まで');
    expect(text).toContain('+70点・大吉');
    expect(text).toContain('休門｜ご縁のテーマ');
    expect(text).toContain('ほかに北東も吉です。');
    expect(text).not.toContain('注意条件');
    expect(text.endsWith(`\n${APP}/?go=time&openExternalBrowser=1`)).toBe(true);
  });

  it('時間帯は日本の時計の時刻で決める（11時からは次の時間帯）', () => {
    setLineTodayData(timeTable('2026-10-06', 10, best()));
    expect(buildNowText(new Date('2026-10-06T10:59:00+09:00'))).toContain('吉方位は「北」です。');
    expect(buildNowText(new Date('2026-10-06T11:00:00+09:00'))).toContain('10月6日（火）11-13時の時盤には、吉の方位がありません。');
  });

  it('基準点のぶんだけ時間帯をずらす（東京は19分進める）', () => {
    setLineTodayData(timeTable('2026-10-06', 12, best({ dir: '東' })));
    const at = new Date('2026-10-06T10:45:00+09:00');
    expect(buildNowText(at, null, 0)).toContain('9-11時の時盤には、吉の方位がありません。');
    expect(buildNowText(at, null, 19)).toContain('吉方位は「東」です。');
  });

  it('注意条件があれば書く', () => {
    setLineTodayData(timeTable('2026-10-06', 10, best({ vetoes: ['空亡'], others: [] })));
    const text = buildNowText(new Date('2026-10-06T10:00:00+09:00'));
    expect(text).toContain('注意条件あり（空亡）');
    expect(text).not.toContain('ほかに');
  });

  it('23時からは翌日の盤の最初の時間帯（アプリと同じ切り替わり）', () => {
    setLineTodayData(timeTable('2026-10-07', 0, best({ dir: '南' })));
    const text = buildNowText(new Date('2026-10-06T23:30:00+09:00'));
    expect(text).toContain('吉方位は「南」です。');
    expect(text).toContain('10月7日（水）23-1時まで');
  });

  it('表にない日は、用意できていないと伝える', () => {
    setLineTodayData({ dirs: DIRS, entries: [], time: {}, day: {}, dayDirs: {} });
    expect(buildNowText(new Date('2050-01-01T10:00:00+09:00'))).toContain('まだ用意できていません');
  });
});

describe('選んだ日の吉方位の文（日盤）', () => {
  afterEach(() => setLineTodayData(null));

  it('その日の吉方位と、日盤の地図へのリンクを入れる', () => {
    setLineTodayData({ dirs: DIRS, entries: [best({ dir: '南' })], time: {}, day: { '2026-10-10': 0 }, dayDirs: {} });
    const text = buildDayText('2026-10-10', APP);
    expect(text).toContain('10月10日（土）の吉方位は「南」です。');
    expect(text).toContain('+70点・大吉');
    expect(text.endsWith(`\n${APP}/?go=day&openExternalBrowser=1`)).toBe(true);
  });

  it('吉方位がない日・表にない日', () => {
    setLineTodayData({ dirs: DIRS, entries: [{ dir: null }], time: {}, day: { '2026-10-10': 0 }, dayDirs: {} });
    expect(buildDayText('2026-10-10')).toContain('日盤には、吉の方位がありません。');
    expect(buildDayText('2050-01-01')).toContain('まだ用意できていません');
  });

  it('次の休みの候補は、明日と、いちばん近い土曜・日曜', () => {
    // 2026-10-06 は火曜
    expect(restDayChoices(new Date('2026-10-06T10:00:00+09:00'))).toEqual([
      { label: '明日 10/7', date: '2026-10-07' },
      { label: '土曜 10/10', date: '2026-10-10' },
      { label: '日曜 10/11', date: '2026-10-11' },
    ]);
    // 金曜は、明日＝土曜なので1つにまとめる
    expect(restDayChoices(new Date('2026-10-09T10:00:00+09:00')).map((c) => c.label)).toEqual(['明日 10/10', '日曜 10/11']);
  });
});

describe('方位から探す文（日盤・これから30日）', () => {
  afterEach(() => setLineTodayData(null));
  const NOW = new Date('2026-10-06T10:00:00+09:00');
  const row = (northIndex) => [northIndex, -1, -1, -1, -1, -1, -1, -1];

  it('点数の高い順に3日。同じ点数は早い日が先。30日より先は入れない', () => {
    setLineTodayData({
      dirs: DIRS,
      entries: [{ score: 30, badge: '吉' }, { score: 90, badge: '大吉' }],
      time: {},
      day: {},
      dayDirs: {
        '2026-10-06': row(0), '2026-10-08': row(1), '2026-10-12': row(0), '2026-10-20': row(1),
        '2026-11-04': row(1),  // 30日目
        '2026-11-05': row(1),  // 31日目（入れない）
      },
    });
    const text = buildWhenText('北', NOW, APP);
    const lines = text.split('\n');
    expect(lines[0]).toBe('「北」が吉の日（これから30日・点数の高い順）');
    expect(lines.slice(1, 4)).toEqual(['10月8日（木） +90点・大吉', '10月20日（火） +90点・大吉', '11月4日（水） +90点・大吉']);
    expect(text.endsWith(`\n${APP}/?go=ranking&openExternalBrowser=1`)).toBe(true);
  });

  it('吉の日がなければ、ないと伝える。知らない方位は null', () => {
    setLineTodayData({ dirs: DIRS, entries: [], time: {}, day: {}, dayDirs: {} });
    expect(buildWhenText('南', NOW)).toContain('「南」が吉の日はありません。');
    expect(buildWhenText('上', NOW)).toBeNull();
  });
});

describe('LINE の Webhook（/api/billing?action=line）', () => {
  let fetchMock;
  let kvFake;
  const NOW = new Date('2026-10-06T10:00:00+09:00');
  const sentMessage = () => JSON.parse(fetchMock.mock.calls[0][1].body).messages[0];
  const actions = (message) => message.quickReply.items.map((item) => item.action);

  beforeEach(() => {
    process.env.LINE_CHANNEL_SECRET = SECRET;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = TOKEN;
    fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    kvFake = makeFakeKv();
    setKvClient(kvFake);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setKvClient(null);
    delete process.env.LINE_CHANNEL_SECRET;
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
  });

  it('署名を確かめる', () => {
    expect(isValidSignature(Buffer.from('abc'), sign('abc'), SECRET)).toBe(true);
    expect(isValidSignature(Buffer.from('abc'), sign('abc', 'other'), SECRET)).toBe(false);
    expect(isValidSignature(Buffer.from('abc'), undefined, SECRET)).toBe(false);
  });

  it('「今の吉方位」を押したら、今の時間帯の吉方位を返信する', async () => {
    const res = await post({ events: [textEvent(MENU.now)] });
    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.line.me/v2/bot/message/reply');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body).replyToken).toBe('rt-1');
    expect(sentMessage().text).toMatch(/吉方位は「|吉の方位がありません/);
    expect(sentMessage().text).toContain('https://kimon-tonko.vercel.app/?go=time');
  });

  it('「次の休みの吉方位」を押したら、日付を選ぶボタンを出す', async () => {
    const message = await answer(textEvent(MENU.day), NOW, APP);
    expect(message.text).toBe('いつの吉方位を見ますか？');
    const list = actions(message);
    expect(list.slice(0, 3).map((a) => a.data)).toEqual(['day:2026-10-07', 'day:2026-10-10', 'day:2026-10-11']);
    expect(list[3]).toMatchObject({ type: 'datetimepicker', data: 'day', mode: 'date', min: '2026-10-06', max: loadLineToday().max });
  });

  it('日付を選んだら、その日の吉方位（日盤）を返信する', async () => {
    const quick = await answer(postbackEvent('day:2026-10-10'), NOW, APP);
    const picked = await answer(postbackEvent('day', { date: '2026-10-10' }), NOW, APP);
    expect(quick.text).toMatch(/10月10日（土）の(吉方位は「|日盤には)/);
    expect(picked.text).toBe(quick.text);
    expect(await answer(postbackEvent('day:きょう'), NOW, APP)).toBeNull();
  });

  it('「この方位はいつ行く？」を押したら8方位のボタンを出し、選んだ方位の吉日を返信する', async () => {
    const message = await answer(textEvent(MENU.when), NOW, APP);
    expect(actions(message).map((a) => a.data)).toEqual(DIRS.map((dir) => `when:${dir}`));
    const result = await answer(postbackEvent('when:北'), NOW, APP);
    expect(result.text).toMatch(/「北」が吉の日/);
  });

  it('位置情報を送ると、何分ずらすかだけを保存し、次からの時間帯に使う', async () => {
    const prompt = await answer(textEvent(MENU.base), NOW, APP);
    expect(actions(prompt)[0]).toEqual({ type: 'location', label: '位置情報を送る' });

    const saved = await answer(locationEvent(139.7671), NOW, APP);
    expect(saved.text).toContain('日本の時計より19分進めて見ます。');
    expect([...kvFake.store.entries()]).toEqual([['line:corr:U1', 19]]);

    setLineTodayData(timeTable('2026-10-06', 12, best({ dir: '東' })));
    const at = new Date('2026-10-06T10:45:00+09:00');
    expect((await answer(textEvent(MENU.now), at, APP)).text).toContain('吉方位は「東」です。');
    await answer(postbackEvent('base:clear'), at, APP);
    expect(kvFake.store.size).toBe(0);
    expect((await answer(textEvent(MENU.now), at, APP)).text).toContain('吉の方位がありません');
    setLineTodayData(null);
  });

  it('日本の外の場所は受け付けない', async () => {
    const message = await answer(locationEvent(-73.98), NOW, APP);
    expect(message.text).toBe('日本の中の場所を送ってください。');
    expect(kvFake.store.size).toBe(0);
  });

  it('関係のないメッセージには返信しない', async () => {
    const res = await post({ events: [textEvent('解約はいつまでにすればいいですか'), { type: 'follow', replyToken: 'rt-2' }] });
    expect(res.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('接続確認（events が空）には 200 を返す', async () => {
    const res = await post({ events: [] });
    expect(res.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('署名が合わなければ 401 で、返信しない', async () => {
    const res = await post({ events: [textEvent(MENU.now)] }, { signature: sign('x') });
    expect(res.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('返信に失敗しても 200 を返す', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const res = await post({ events: [textEvent(MENU.now)] });
    expect(res.statusCode).toBe(200);
  });

  it('鍵が設定されていなければ 503', async () => {
    delete process.env.LINE_CHANNEL_SECRET;
    const res = await post({ events: [] });
    expect(res.statusCode).toBe(503);
  });
});
