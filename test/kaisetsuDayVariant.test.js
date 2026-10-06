import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import kaisetsuHandler from '../api/kaisetsu.js';
import { DAY_OVERRIDES_KEY, getBoard } from '../lib/kaisetsuData.js';
import { DAY_KEY_SUFFIX, TIME_ONLY_SHOUI, makeKaisetsuKey, parseKaisetsuKey } from '../src/kaisetsu/boardKey.js';
import { classifyPalace, parseShoui } from '../src/kaisetsu/classifyPalace.js';
import { computeAxisRanks } from '../src/reverseDirection/FusionCard.jsx';
import { buildBoard } from '../src/kimon/buildBoard.js';
import { lookupChito } from '../src/kimon/loadChito.js';
import { scoreBoard } from '../src/kimon/scoreEngine.js';
import { DATE_BOUND_KAKKYOKU, DATE_BOUND_TEXTS, dateBoundParagraph, listDateBoundKakkyoku } from '../src/kimon/palaceExplain.js';
import { FORBIDDEN_EXPRESSIONS } from '../src/kaisetsu/composeProse.js';
import { loadRows } from '../scripts/build_kaisetsu_text.mjs';

const DATA_PATH = 'data/kaisetsu/generated/kaisetsu_text_v2.json';
const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
// 文章の中でその格局を語っているか。「火入天羅」「地網高張」のような別の名前の一部は数えない。
const mentionsTimeOnly = (text) => /(^|[^一-鿿])(時格|天羅|地網)により/u.test(text);
let data;
let rows;

beforeAll(() => {
  if (!existsSync(DATA_PATH)) execFileSync('node', ['scripts/build_kaisetsu_text.mjs'], { stdio: 'ignore' });
  data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  rows = loadRows();
}, 120000);

function createRes() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

describe('解説の鍵（時盤・日盤）', () => {
  it('日盤のときだけ印が付く', () => {
    expect(makeKaisetsuKey({ kyokusu: '陰1局', eto: '丁卯', boardType: '時' })).toBe('陰1局丁卯');
    expect(makeKaisetsuKey({ kyokusu: '陰1局', eto: '丁卯', boardType: '日' })).toBe(`陰1局丁卯${DAY_KEY_SUFFIX}`);
    expect(makeKaisetsuKey({})).toBe('');
    expect(parseKaisetsuKey('陰1局丁卯')).toEqual({ key: '陰1局丁卯', boardType: '時' });
    expect(parseKaisetsuKey(`陰1局丁卯${DAY_KEY_SUFFIX}`)).toEqual({ key: '陰1局丁卯', boardType: '日' });
  });
});

describe('日盤では、時の干で決まる格局（時格・天羅・地網）を数えない', () => {
  it('判定: 日盤ではその3つが象意から外れ、時盤では今までどおり残る', () => {
    let affected = 0;
    for (const row of rows) {
      for (const palace of PALACES) {
        const names = parseShoui(row, palace).map((item) => item.name);
        if (!names.some((n) => TIME_ONLY_SHOUI.includes(n))) continue;
        affected += 1;
        const time = classifyPalace(row, palace);
        const day = classifyPalace(row, palace, { boardType: '日' });
        expect(day.shoui.some((n) => TIME_ONLY_SHOUI.includes(n))).toBe(false);
        // 外した3つ以外は、時盤で挙がっていたものがそのまま残る（空いた枠に次の象意が入ることはある）。
        for (const n of time.shoui.filter((x) => !TIME_ONLY_SHOUI.includes(x))) expect(day.shoui).toContain(n);
      }
    }
    expect(affected).toBeGreaterThan(100);
  });

  it('生成物: 日盤用の解説は、その3つが入る宮と、日盤で◎○×が変わる宮だけにあり、文章にその名前が出ない', () => {
    const overrides = data[DAY_OVERRIDES_KEY];
    let count = 0;
    for (const row of rows) {
      for (const palace of PALACES) {
        const has = parseShoui(row, palace).some((item) => TIME_ONLY_SHOUI.includes(item.name));
        const cell = overrides[row.key]?.[palace];
        // 日盤では日の干で決まる格局（日格・伏干・雲干）も総合点に入るので、◎○×が時盤と変わる宮も作り直す。
        const time = classifyPalace(row, palace).axisRanks;
        const day = classifyPalace(row, palace, { boardType: '日' }).axisRanks;
        const ranksDiffer = Object.keys(time).some((axis) => time[axis] !== day[axis]);
        expect(Boolean(cell)).toBe(has || ranksDiffer);
        if (!cell) continue;
        expect(cell.axisRanks).toEqual(day);
        count += 1;
        for (const axis of ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo']) {
          expect(mentionsTimeOnly(cell[axis].full)).toBe(false);
          expect(cell[axis].full.startsWith(`**${cell[axis].short}**`)).toBe(true);
        }
      }
    }
    expect(count).toBe(Object.values(overrides).reduce((n, board) => n + Object.keys(board).length, 0));
  });

  it('配信: 日盤の鍵は日盤用の解説、時盤の鍵は今までどおり。変わらない宮は同じ内容', () => {
    const key = Object.keys(data[DAY_OVERRIDES_KEY])[0];
    const palace = Object.keys(data[DAY_OVERRIDES_KEY][key])[0];
    const other = PALACES.find((p) => !data[DAY_OVERRIDES_KEY][key][p]);
    const time = getBoard(data, key);
    const day = getBoard(data, `${key}${DAY_KEY_SUFFIX}`);
    expect(time[palace]).toEqual(data[key][palace]);
    expect(day[palace]).toEqual(data[DAY_OVERRIDES_KEY][key][palace]);
    expect(day[other]).toEqual(time[other]);
    expect(getBoard(data, DAY_OVERRIDES_KEY)).toBe(null);
    expect(getBoard(data, `ない局${DAY_KEY_SUFFIX}`)).toBe(null);

    const res = createRes();
    kaisetsuHandler({ method: 'GET', query: { key: `${key}${DAY_KEY_SUFFIX}` } }, res);
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.body.palaces)).toHaveLength(8);
    expect(res.body.palaces[palace].goen.short).toBe(data[DAY_OVERRIDES_KEY][key][palace].goen.short);
    const bad = createRes();
    kaisetsuHandler({ method: 'GET', query: { key: DAY_OVERRIDES_KEY } }, bad);
    expect(bad.statusCode).toBe(404);
  });

  it('画面の◎○×も鍵に従う（日盤の鍵なら日盤の判定）', () => {
    const row = rows.find((r) => PALACES.some((p) => parseShoui(r, p).some((i) => TIME_ONLY_SHOUI.includes(i.name))));
    const palace = PALACES.find((p) => parseShoui(row, p).some((i) => TIME_ONLY_SHOUI.includes(i.name)));
    expect(computeAxisRanks(row.key, palace)).toEqual(classifyPalace(row, palace).axisRanks);
    expect(computeAxisRanks(`${row.key}${DAY_KEY_SUFFIX}`, palace)).toEqual(classifyPalace(row, palace, { boardType: '日' }).axisRanks);
  });

  it('点数の計算と揃う: 日盤の盤で検出されない時格・天羅・地網は、日盤の解説にも出ない（1年分）', () => {
    const leaks = [];
    for (let i = 0; i < 365; i += 1) {
      const date = new Date(Date.UTC(2026, 9, 4 + i)).toISOString().slice(0, 10);
      const board = buildBoard({ date, boardType: '日' });
      const score = scoreBoard(board);
      const key = `${board.meta.kyokusu}${board.meta.eto}`;
      const dayBoard = getBoard(data, makeKaisetsuKey(board.meta));
      const row = lookupChito(key);
      for (const palace of PALACES) {
        const detected = (score.palaces[palace].detected_kakkyoku || []).map((k) => k.name);
        expect(detected.some((n) => TIME_ONLY_SHOUI.includes(n))).toBe(false);
        const judged = classifyPalace(row, palace, { boardType: '日' }).shoui;
        if (judged.some((n) => TIME_ONLY_SHOUI.includes(n))) leaks.push(`${date} ${palace} judged`);
        for (const axis of ['goen', 'kinun']) {
          if (mentionsTimeOnly(dayBoard[palace][axis].full)) leaks.push(`${date} ${palace} ${axis}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  }, 60000);
});

describe('その日時だけに付く凶格の注記', () => {
  it('歳格・月格・日格・伏干・雲干だけを拾い、無ければ何も出さない', () => {
    const score = { detected_kakkyoku: [{ name: '日格' }, { name: '伏干' }, { name: '時格' }, { name: '天遁' }] };
    expect(listDateBoundKakkyoku(score)).toEqual(['日格', '伏干']);
    const text = dateBoundParagraph(score);
    expect(text.startsWith('**この日時だけの注意：日格・伏干**\n\n')).toBe(true);
    expect(text).toContain(DATE_BOUND_TEXTS['日格']);
    expect(text).toContain(DATE_BOUND_TEXTS['伏干']);
    expect(text).not.toContain('歳格');
    expect(dateBoundParagraph({ detected_kakkyoku: [{ name: '時格' }] })).toBe('');
    expect(dateBoundParagraph(null)).toBe('');
  });

  it('5つとも説明があり、解説文と同じ書き方（です・ます調・名前で始まる・使わない言い回しなし）', () => {
    expect(Object.keys(DATE_BOUND_TEXTS)).toEqual(DATE_BOUND_KAKKYOKU);
    for (const [name, text] of Object.entries(DATE_BOUND_TEXTS)) {
      expect(text.startsWith(name)).toBe(true);
      expect(text).toMatch(/により、.+(です|ます)。$/u);
      expect([...FORBIDDEN_EXPRESSIONS, '必ず', '絶対'].some((w) => text.includes(w))).toBe(false);
    }
  });

  it('実際の盤で検出されたときに段落が出る（庚が日の干に乗る日時を1年分から探す）', () => {
    let found = null;
    for (let i = 0; i < 365 && !found; i += 1) {
      const date = new Date(Date.UTC(2026, 9, 4 + i)).toISOString().slice(0, 10);
      const board = buildBoard({ date, boardType: '日' });
      const score = scoreBoard(board);
      for (const palace of PALACES) {
        if (listDateBoundKakkyoku(score.palaces[palace]).includes('日格')) { found = score.palaces[palace]; break; }
      }
    }
    expect(found).not.toBe(null);
    expect(dateBoundParagraph(found)).toContain('日格（庚が日の干に乗る凶格）により');
  }, 30000);

  it('解説の文章（前もって作ったもの）には、この5つは出てこない。だから注記で補う', () => {
    for (const key of ['陰1局丁卯', '陰1局甲子', '陽1局庚辰']) {
      for (const palace of PALACES) {
        for (const name of DATE_BOUND_KAKKYOKU) expect(data[key][palace].goen.full.includes(name)).toBe(false);
      }
    }
  });
});
