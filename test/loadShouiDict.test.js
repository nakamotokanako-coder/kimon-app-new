// test/loadShouiDict.test.js
import { describe, it, expect } from 'vitest';
import {
  getJukanShoui,
  getJukanShouiByPair,
  getKakkyokuShoui,
  getShouiDict,
  noFromKanPair,
} from '../src/kimon/loadShouiDict.js';
import { lookupJukkanKokuou } from '../src/kimon/jukkanKokuou.js';

const KAN_ORDER = ['乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

describe('loadShouiDict: データ整合', () => {
  it('十干剋応エントリは 81 件', () => {
    const d = getShouiDict();
    expect(d.jukan_kokuou.length).toBe(81);
  });

  it('格局エントリは 50 件', () => {
    const d = getShouiDict();
    expect(d.kakkyoku.length).toBe(50);
  });

  it('各十干剋応エントリは name / original / modern / practical / display_text を持つ', () => {
    const d = getShouiDict();
    for (const e of d.jukan_kokuou) {
      expect(e.no).toBeTypeOf('number');
      expect(e.name).toBeTruthy();
      expect(typeof e.original).toBe('string');
      expect(typeof e.modern).toBe('string');
      expect(typeof e.practical).toBe('string');
      expect(typeof e.display_text).toBe('string');
      expect(e.display_text).not.toBe('');
      expect(e.display_text).not.toContain('\n');
    }
  });

  it('各格局エントリは name / original / modern / practical / display_text を持つ', () => {
    const d = getShouiDict();
    for (const e of d.kakkyoku) {
      expect(e.no).toBeTypeOf('number');
      expect(e.name).toBeTruthy();
      expect(typeof e.original).toBe('string');
      expect(typeof e.modern).toBe('string');
      expect(typeof e.practical).toBe('string');
      expect(typeof e.display_text).toBe('string');
      expect(e.display_text).not.toBe('');
      expect(e.display_text).not.toContain('\n');
    }
  });

  it('jukan_index_by_name の全 name が jukan_kokuou に解決可能', () => {
    const d = getShouiDict();
    const allNos = new Set(d.jukan_kokuou.map((e) => e.no));
    for (const [name, indices] of Object.entries(d.jukan_index_by_name)) {
      expect(Array.isArray(indices)).toBe(true);
      expect(indices.length).toBeGreaterThan(0);
      for (const no of indices) {
        expect(allNos.has(no)).toBe(true);
      }
    }
  });

  it('kakkyoku_index_by_name の全 name が kakkyoku に解決可能', () => {
    const d = getShouiDict();
    const allNos = new Set(d.kakkyoku.map((e) => e.no));
    for (const [name, no] of Object.entries(d.kakkyoku_index_by_name)) {
      expect(typeof no).toBe('number');
      expect(allNos.has(no)).toBe(true);
    }
  });
});

describe('getJukanShoui', () => {
  it('単一 no の名称はそのまま引ける', () => {
    const e = getJukanShoui('日奇伏吟');
    expect(e).not.toBeNull();
    expect(e.no).toBe(1);
    expect(e.name).toBe('日奇伏吟');
  });

  it('未知の名称は null', () => {
    expect(getJukanShoui('存在しない名称')).toBeNull();
  });

  it('空文字/null は null', () => {
    expect(getJukanShoui('')).toBeNull();
    expect(getJukanShoui(null)).toBeNull();
  });

  it('同名複数（凶蛇入獄=62/68）: no 必須', () => {
    expect(getJukanShoui('凶蛇入獄')).toBeNull(); // no 未指定 → null
    const e62 = getJukanShoui('凶蛇入獄', 62);
    const e68 = getJukanShoui('凶蛇入獄', 68);
    expect(e62?.no).toBe(62);
    expect(e68?.no).toBe(68);
    expect(e62?.original).not.toBe(e68?.original); // 別内容
  });

  it('同名複数（華蓋蓬星=9/73）: no 必須', () => {
    expect(getJukanShoui('華蓋蓬星')).toBeNull();
    expect(getJukanShoui('華蓋蓬星', 9)?.no).toBe(9);
    expect(getJukanShoui('華蓋蓬星', 73)?.no).toBe(73);
  });

  it('同名複数（華蓋孛師=18/74）: no 必須', () => {
    expect(getJukanShoui('華蓋孛師')).toBeNull();
    expect(getJukanShoui('華蓋孛師', 18)?.no).toBe(18);
    expect(getJukanShoui('華蓋孛師', 74)?.no).toBe(74);
  });

  it('該当しない no を指定すると null', () => {
    expect(getJukanShoui('凶蛇入獄', 1)).toBeNull(); // 1 は凶蛇入獄ではない
  });

  it('jukan_index_by_name で複数 no を持つのは3名称のみ', () => {
    const d = getShouiDict();
    const multi = Object.entries(d.jukan_index_by_name).filter(
      ([, indices]) => indices.length > 1,
    );
    const names = multi.map(([n]) => n).sort();
    expect(names).toEqual(['凶蛇入獄', '華蓋孛師', '華蓋蓬星']);
  });

  it('No.62 凶蛇入獄 は「三角関係」を含む（先生 2026-05-24 書き直し）', () => {
    const e = getJukanShoui('凶蛇入獄', 62);
    expect(e?.original).toContain('三角関係');
  });
});

describe('noFromKanPair / getJukanShouiByPair', () => {
  it('乙×乙 → no=1 (日奇伏吟)', () => {
    expect(noFromKanPair('乙', '乙')).toBe(1);
    expect(getJukanShouiByPair('乙', '乙')?.name).toBe('日奇伏吟');
  });

  it('癸×癸 → no=81', () => {
    expect(noFromKanPair('癸', '癸')).toBe(81);
  });

  it('甲・空文字・不明な文字は null', () => {
    expect(noFromKanPair('甲', '乙')).toBeNull();
    expect(noFromKanPair('乙', '甲')).toBeNull();
    expect(noFromKanPair('', '乙')).toBeNull();
    expect(noFromKanPair(null, '乙')).toBeNull();
    expect(getJukanShouiByPair('甲', '乙')).toBeNull();
  });

  it('同名3名称は天盤×地盤で正しく引き分けられる', () => {
    // 華蓋蓬星: 9=乙×癸, 73=癸×乙
    expect(getJukanShouiByPair('乙', '癸')?.no).toBe(9);
    expect(getJukanShouiByPair('乙', '癸')?.name).toBe('華蓋蓬星');
    expect(getJukanShouiByPair('癸', '乙')?.no).toBe(73);
    expect(getJukanShouiByPair('癸', '乙')?.name).toBe('華蓋蓬星');

    // 華蓋孛師: 18=丙×癸, 74=癸×丙
    expect(getJukanShouiByPair('丙', '癸')?.no).toBe(18);
    expect(getJukanShouiByPair('丙', '癸')?.name).toBe('華蓋孛師');
    expect(getJukanShouiByPair('癸', '丙')?.no).toBe(74);
    expect(getJukanShouiByPair('癸', '丙')?.name).toBe('華蓋孛師');

    // 凶蛇入獄: 62=辛×壬, 68=壬×己
    expect(getJukanShouiByPair('辛', '壬')?.no).toBe(62);
    expect(getJukanShouiByPair('辛', '壬')?.name).toBe('凶蛇入獄');
    expect(getJukanShouiByPair('壬', '己')?.no).toBe(68);
    expect(getJukanShouiByPair('壬', '己')?.name).toBe('凶蛇入獄');
  });

  it('shoui_dict.json の name 81 件すべてが jukkanKokuou.json と (tenban,chiban) で一致', () => {
    for (const t of KAN_ORDER) {
      for (const c of KAN_ORDER) {
        const lookup = lookupJukkanKokuou(t, c);
        const shoui = getJukanShouiByPair(t, c);
        expect(shoui).not.toBeNull();
        expect(lookup).not.toBeNull();
        expect(shoui.name).toBe(lookup.name);
      }
    }
  });
});

describe('getKakkyokuShoui', () => {
  it('青龍返首 は no=1 で引ける', () => {
    const e = getKakkyokuShoui('青龍返首');
    expect(e?.no).toBe(1);
    expect(e?.name).toBe('青龍返首');
  });

  it('乙奇入墓 / 丙奇入墓 / 丁奇入墓 が新規追加されている', () => {
    expect(getKakkyokuShoui('乙奇入墓')).not.toBeNull();
    expect(getKakkyokuShoui('丙奇入墓')).not.toBeNull();
    expect(getKakkyokuShoui('丁奇入墓')).not.toBeNull();
  });

  it('未知の名称は null', () => {
    expect(getKakkyokuShoui('存在しない格局')).toBeNull();
  });

  it('空文字/null は null', () => {
    expect(getKakkyokuShoui('')).toBeNull();
    expect(getKakkyokuShoui(null)).toBeNull();
  });
});
