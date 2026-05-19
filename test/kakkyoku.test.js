// test/kakkyoku.test.js
import { describe, it, expect } from 'vitest';
import {
  detectPalaceKakkyoku,
  detectBoardKakkyoku,
  scoreKakkyoku,
  scoreBanLevel,
  kakkyokuData,
  PALACE_NAMES,
} from '../src/kimon/kakkyoku.js';

// ============================================================
// テストヘルパー
// ============================================================

/** 標準的な盤メタ（カスタマイズして使う） */
function makeBoardMeta(overrides = {}) {
  return {
    junshu: '戊',
    chokushi: '休門',
    eto_year: '乙巳',
    eto_month: '丁亥',
    eto_day: '戊申',
    eto_time: '壬子',
    boardType: '時',
    ...overrides,
  };
}

/** 1宮データのヘルパー */
function palace({ tenban = '', chiban = '', kyusei = '', hasshin = '', hachimon = '' }) {
  return { tenban, chiban, kyusei, hasshin, hachimon };
}

// ============================================================
// データ完全性
// ============================================================

describe('kakkyokuData: データ完全性', () => {
  it('吉格・凶格・盤レベルがすべて存在', () => {
    expect(kakkyokuData.kichi).toBeDefined();
    expect(kakkyokuData.kyo).toBeDefined();
    expect(kakkyokuData.ban_level).toBeDefined();
  });

  it('全格局に必須フィールドあり', () => {
    for (const [key, data] of Object.entries(kakkyokuData.kichi)) {
      expect(data.reading, `${key}.reading`).toBeTruthy();
      expect(data.meaning, `${key}.meaning`).toBeTruthy();
      expect(data.score, `${key}.score`).toBeDefined();
    }
    for (const [key, data] of Object.entries(kakkyokuData.kyo)) {
      expect(data.reading, `${key}.reading`).toBeTruthy();
      expect(data.meaning, `${key}.meaning`).toBeTruthy();
      expect(data.score, `${key}.score`).toBeDefined();
    }
  });
});

// ============================================================
// 注: 青龍返首・飛鳥跌穴のテストは jukkanKokuou.test.js で行う
// （十干剋応のエントリ「戊丙〇青龍返首」「丙戊〇飛鳥跌穴」として判定）
// ============================================================

// ============================================================
// 九遁
// ============================================================

describe('九遁', () => {
  it('天遁: 丙+丁+生門', () => {
    const p = palace({ tenban: '丙', chiban: '丁', hachimon: '生門' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    expect(r.find(x => x.name === '天遁')).toBeDefined();
  });

  it('地遁: 乙+己+開門', () => {
    const p = palace({ tenban: '乙', chiban: '己', hachimon: '開門' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    expect(r.find(x => x.name === '地遁')).toBeDefined();
  });

  it('人遁: 丁+休門+太陰', () => {
    const p = palace({ tenban: '丁', hachimon: '休門', hasshin: '太陰' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    expect(r.find(x => x.name === '人遁')).toBeDefined();
  });

  it('雲遁A: 乙+辛+三吉門', () => {
    const p = palace({ tenban: '乙', chiban: '辛', hachimon: '休門' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    expect(r.find(x => x.name === '雲遁')).toBeDefined();
  });

  it('雲遁B: 乙+開門+宮坤', () => {
    const p = palace({ tenban: '乙', hachimon: '開門' });
    const r = detectPalaceKakkyoku(p, 'kun', makeBoardMeta());
    expect(r.find(x => x.name === '雲遁')).toBeDefined();
  });

  it('風遁: 乙+三吉門+宮巽', () => {
    const p = palace({ tenban: '乙', hachimon: '生門' });
    const r = detectPalaceKakkyoku(p, 'son', makeBoardMeta());
    expect(r.find(x => x.name === '風遁')).toBeDefined();
  });

  it('龍遁: 乙+休門+宮坎', () => {
    const p = palace({ tenban: '乙', hachimon: '休門' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    expect(r.find(x => x.name === '龍遁')).toBeDefined();
  });

  it('虎遁: 乙+辛+休門+宮艮', () => {
    const p = palace({ tenban: '乙', chiban: '辛', hachimon: '休門' });
    const r = detectPalaceKakkyoku(p, 'gon', makeBoardMeta());
    expect(r.find(x => x.name === '虎遁')).toBeDefined();
  });

  it('神遁: 丙+生門+九天', () => {
    const p = palace({ tenban: '丙', hachimon: '生門', hasshin: '九天' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    expect(r.find(x => x.name === '神遁')).toBeDefined();
  });

  it('鬼遁: 乙+杜門+九地', () => {
    const p = palace({ tenban: '乙', hachimon: '杜門', hasshin: '九地' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    expect(r.find(x => x.name === '鬼遁')).toBeDefined();
  });

  it('鬼遁: 乙+開門+九地（杜門/開門どちらでもOK）', () => {
    const p = palace({ tenban: '乙', hachimon: '開門', hasshin: '九地' });
    const r = detectPalaceKakkyoku(p, 'shin', makeBoardMeta());
    expect(r.find(x => x.name === '鬼遁')).toBeDefined();
  });
});

// ============================================================
// 三奇得使・昇殿・入墓
// ============================================================

describe('三奇得使', () => {
  it('乙奇得使: 乙+乾宮', () => {
    const p = palace({ tenban: '乙' });
    const r = detectPalaceKakkyoku(p, 'ken', makeBoardMeta());
    expect(r.find(x => x.name === '乙奇得使')).toBeDefined();
  });

  it('乙奇得使: 乙+離宮', () => {
    const p = palace({ tenban: '乙' });
    const r = detectPalaceKakkyoku(p, 'ri', makeBoardMeta());
    expect(r.find(x => x.name === '乙奇得使')).toBeDefined();
  });

  it('丙奇得使: 丙+坤宮', () => {
    const p = palace({ tenban: '丙' });
    const r = detectPalaceKakkyoku(p, 'kun', makeBoardMeta());
    expect(r.find(x => x.name === '丙奇得使')).toBeDefined();
  });

  it('丁奇得使: 丁+巽宮', () => {
    const p = palace({ tenban: '丁' });
    const r = detectPalaceKakkyoku(p, 'son', makeBoardMeta());
    expect(r.find(x => x.name === '丁奇得使')).toBeDefined();
  });
});

describe('三奇昇殿', () => {
  it('乙奇昇殿: 乙+震宮', () => {
    const p = palace({ tenban: '乙' });
    const r = detectPalaceKakkyoku(p, 'shin', makeBoardMeta());
    expect(r.find(x => x.name === '乙奇昇殿')).toBeDefined();
  });

  it('丁奇昇殿: 丁+兌宮', () => {
    const p = palace({ tenban: '丁' });
    const r = detectPalaceKakkyoku(p, 'da', makeBoardMeta());
    expect(r.find(x => x.name === '丁奇昇殿')).toBeDefined();
  });
});

describe('三奇入墓', () => {
  it('乙奇入墓: 乙+坤宮', () => {
    const p = palace({ tenban: '乙' });
    const r = detectPalaceKakkyoku(p, 'kun', makeBoardMeta());
    expect(r.find(x => x.name === '乙奇入墓')).toBeDefined();
  });

  it('丙奇入墓: 丙+乾宮', () => {
    const p = palace({ tenban: '丙' });
    const r = detectPalaceKakkyoku(p, 'ken', makeBoardMeta());
    expect(r.find(x => x.name === '丙奇入墓')).toBeDefined();
  });

  it('丁奇入墓: 丁+艮宮', () => {
    const p = palace({ tenban: '丁' });
    const r = detectPalaceKakkyoku(p, 'gon', makeBoardMeta());
    expect(r.find(x => x.name === '丁奇入墓')).toBeDefined();
  });
});

// ============================================================
// 玉女守門
// ============================================================

describe('玉女守門', () => {
  it('天=丁, 八門=直使で成立', () => {
    const meta = makeBoardMeta({ chokushi: '生門' });
    const p = palace({ tenban: '丁', hachimon: '生門' });
    const r = detectPalaceKakkyoku(p, 'kan', meta);
    expect(r.find(x => x.name === '玉女守門')).toBeDefined();
  });

  it('直使と一致しなければ不成立', () => {
    const meta = makeBoardMeta({ chokushi: '生門' });
    const p = palace({ tenban: '丁', hachimon: '休門' });
    const r = detectPalaceKakkyoku(p, 'kan', meta);
    expect(r.find(x => x.name === '玉女守門')).toBeUndefined();
  });
});

// ============================================================
// 庚の凶格
// ============================================================

describe('庚の三大凶格', () => {
  it('伏宮格: 天=庚, 地=甲(旬首)', () => {
    const meta = makeBoardMeta({ junshu: '壬' });
    const p = palace({ tenban: '庚', chiban: '壬' });
    const r = detectPalaceKakkyoku(p, 'kan', meta);
    expect(r.find(x => x.name === '伏宮格')).toBeDefined();
  });

  it('飛宮格: 天=甲(旬首), 地=庚', () => {
    const meta = makeBoardMeta({ junshu: '壬' });
    const p = palace({ tenban: '壬', chiban: '庚' });
    const r = detectPalaceKakkyoku(p, 'kan', meta);
    expect(r.find(x => x.name === '飛宮格')).toBeDefined();
  });

  // 戦格・大格・小格・焚入太白・太白入熒 は十干剋応で判定されるため
  // 格局判定テストからは除外（刑格は別概念として復活: 下記参照）
});

// ============================================================
// 刑格（先生指示 2026-05-18: 官符刑格とのダブルカウント）
// ============================================================

describe('刑格（天盤庚×地盤己）', () => {
  it('庚×己 で刑格を検出（-10）', () => {
    const p = palace({ tenban: '庚', chiban: '己' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    const k = r.find(x => x.name === '刑格');
    expect(k).toBeDefined();
    expect(k.kichi_kyo).toBe('kyo');
    expect(k.score).toBe(-10);
  });

  it('庚以外（己×己）では刑格は出ない', () => {
    const p = palace({ tenban: '己', chiban: '己' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    expect(r.find(x => x.name === '刑格')).toBeUndefined();
  });

  it('複合表記: 天盤「庚」×地盤「己丁」は己を含むので該当', () => {
    const p = palace({ tenban: '庚', chiban: '己丁' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    expect(r.find(x => x.name === '刑格')).toBeDefined();
  });

  it('複合表記: 天盤「丙己」×地盤「己」は庚を含まないので非該当', () => {
    const p = palace({ tenban: '丙己', chiban: '己' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    expect(r.find(x => x.name === '刑格')).toBeUndefined();
  });

  it('scoreKakkyoku: 庚×己 は刑格のみで -10（kan宮で他格局回避）', () => {
    const p = palace({ tenban: '庚', chiban: '己' });
    expect(scoreKakkyoku(p, 'kan', makeBoardMeta())).toBe(-10);
  });
});

describe('庚×干（盤レベル凶意）', () => {
  it('日格・伏干: 天=庚, 地=日干（両方検出）', () => {
    const meta = makeBoardMeta({ eto_day: '戊申' });
    const p = palace({ tenban: '庚', chiban: '戊' });
    const r = detectPalaceKakkyoku(p, 'kan', meta);
    expect(r.find(x => x.name === '日格')).toBeDefined();
    expect(r.find(x => x.name === '伏干')).toBeDefined();
  });

  it('雲干: 天=日干, 地=庚', () => {
    const meta = makeBoardMeta({ eto_day: '戊申' });
    const p = palace({ tenban: '戊', chiban: '庚' });
    const r = detectPalaceKakkyoku(p, 'kan', meta);
    expect(r.find(x => x.name === '雲干')).toBeDefined();
  });

  it('時格: 時盤の時だけ成立', () => {
    const meta = makeBoardMeta({ eto_time: '壬子', boardType: '時' });
    const p = palace({ tenban: '庚', chiban: '壬' });
    const r = detectPalaceKakkyoku(p, 'kan', meta);
    expect(r.find(x => x.name === '時格')).toBeDefined();
  });

  it('時格: 日盤では成立しない', () => {
    const meta = makeBoardMeta({ eto_time: '壬子', boardType: '日' });
    const p = palace({ tenban: '庚', chiban: '壬' });
    const r = detectPalaceKakkyoku(p, 'kan', meta);
    expect(r.find(x => x.name === '時格')).toBeUndefined();
  });
});

// ============================================================
// 三奇を害する凶格
// ============================================================

describe('三奇を害する凶格', () => {
  it('青龍逃走: 乙×辛', () => {
    const p = palace({ tenban: '乙', chiban: '辛' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    expect(r.find(x => x.name === '青龍逃走')).toBeDefined();
  });

  it('白虎猖狂: 辛×乙', () => {
    const p = palace({ tenban: '辛', chiban: '乙' });
    const r = detectPalaceKakkyoku(p, 'kan', makeBoardMeta());
    expect(r.find(x => x.name === '白虎猖狂')).toBeDefined();
  });

  it('天羅: 癸×時干', () => {
    const meta = makeBoardMeta({ eto_time: '壬子' });
    const p = palace({ tenban: '癸', chiban: '壬' });
    const r = detectPalaceKakkyoku(p, 'kan', meta);
    expect(r.find(x => x.name === '天羅')).toBeDefined();
  });

  it('地網: 壬×時干', () => {
    const meta = makeBoardMeta({ eto_time: '壬子' });
    const p = palace({ tenban: '壬', chiban: '壬' });
    const r = detectPalaceKakkyoku(p, 'kan', meta);
    expect(r.find(x => x.name === '地網')).toBeDefined();
  });
});

// ============================================================
// 六儀撃刑格
// ============================================================

describe('六儀撃刑格', () => {
  const cases = [
    ['戊', 'shin', '震'],
    ['己', 'kun', '坤'],
    ['庚', 'gon', '艮'],
    ['辛', 'ri', '離'],
    ['壬', 'son', '巽'],
    ['癸', 'son', '巽'],
  ];
  for (const [kan, palName, palJp] of cases) {
    it(`${kan}+${palJp}宮 → 六儀撃刑格`, () => {
      const p = palace({ tenban: kan });
      const r = detectPalaceKakkyoku(p, palName, makeBoardMeta());
      expect(r.find(x => x.name === '六儀撃刑格')).toBeDefined();
    });
  }
});

// ============================================================
// 複合表記対応
// ============================================================

describe('複合表記対応', () => {
  it('天盤"戊丁"の宮で、丁絡みの格局が検出される', () => {
    const meta = makeBoardMeta({ chokushi: '休門' });
    const p = palace({ tenban: '戊丁', hachimon: '休門' });
    const r = detectPalaceKakkyoku(p, 'kan', meta);
    expect(r.find(x => x.name === '玉女守門')).toBeDefined();
  });

  it('天盤"乙丙"の宮で、両方の三奇昇殿の可能性チェック', () => {
    const p = palace({ tenban: '乙丙' });
    // 震宮 → 乙奇昇殿
    const r1 = detectPalaceKakkyoku(p, 'shin', makeBoardMeta());
    expect(r1.find(x => x.name === '乙奇昇殿')).toBeDefined();
    // 離宮 → 丙奇昇殿
    const r2 = detectPalaceKakkyoku(p, 'ri', makeBoardMeta());
    expect(r2.find(x => x.name === '丙奇昇殿')).toBeDefined();
  });
});

// ============================================================
// スコア集計
// ============================================================

describe('scoreKakkyoku: スコア', () => {
  it('天遁は+10（丙+丁+生門、shin宮で他格局回避）', () => {
    // shin宮は丙の得使でも昇殿でもない → 天遁のみ +10
    const p = palace({ tenban: '丙', chiban: '丁', hachimon: '生門' });
    expect(scoreKakkyoku(p, 'shin', makeBoardMeta())).toBe(10);
  });

  it('伏宮格は-10（天=庚, 地=旬首、日盤で時格回避）', () => {
    // boardType='日' にして時格を回避
    const meta = makeBoardMeta({ junshu: '壬', boardType: '日' });
    const p = palace({ tenban: '庚', chiban: '壬' });
    expect(scoreKakkyoku(p, 'kan', meta)).toBe(-10);
  });

  it('複数該当時は合計（日格+伏干=-20）', () => {
    // junshu=壬 にして、戊が旬首にならないようにする（伏宮格を回避）
    const meta = makeBoardMeta({ eto_day: '戊申', junshu: '壬' });
    const p = palace({ tenban: '庚', chiban: '戊' });
    // 日格-10 + 伏干-10 = -20
    expect(scoreKakkyoku(p, 'kan', meta)).toBe(-20);
  });

  it('該当なしは0', () => {
    const p = palace({ tenban: '戊', chiban: '己' });
    expect(scoreKakkyoku(p, 'kan', makeBoardMeta())).toBe(0);
  });
});

// ============================================================
// 盤レベル格局
// ============================================================

describe('detectBoardKakkyoku: 盤レベル', () => {
  it('門迫: 八門が定位の五行を剋する', () => {
    // 例: 開門(金)が震宮(木)にある → 金剋木 → 門迫
    const board = {
      meta: makeBoardMeta(),
      palaces: {
        kan: palace({ tenban: '甲', chiban: '甲', kyusei: '天蓬', hachimon: '休門' }),
        gon: palace({ tenban: '甲', chiban: '甲', kyusei: '天任', hachimon: '生門' }),
        shin: palace({ tenban: '甲', chiban: '甲', kyusei: '天衝', hachimon: '開門' }), // 開門(金)×震(木) = 門迫
        son: palace({ tenban: '甲', chiban: '甲', kyusei: '天輔', hachimon: '杜門' }),
        ri: palace({ tenban: '甲', chiban: '甲', kyusei: '天英', hachimon: '景門' }),
        kun: palace({ tenban: '甲', chiban: '甲', kyusei: '天芮', hachimon: '死門' }),
        da: palace({ tenban: '甲', chiban: '甲', kyusei: '天柱', hachimon: '驚門' }),
        ken: palace({ tenban: '甲', chiban: '甲', kyusei: '天心', hachimon: '傷門' }),
      },
    };
    const r = detectBoardKakkyoku(board);
    expect(r.find(x => x.name === '門迫')).toBeDefined();
  });

  it('反吟: 八門が定位の対中宮にある', () => {
    // 休門の定位は坎、対中宮は離 → 離宮に休門があると反吟
    const board = {
      meta: makeBoardMeta(),
      palaces: {
        kan: palace({ tenban: '甲', chiban: '甲', kyusei: '天蓬', hachimon: '景門' }),
        gon: palace({ tenban: '甲', chiban: '甲', kyusei: '天任', hachimon: '死門' }),
        shin: palace({ tenban: '甲', chiban: '甲', kyusei: '天衝', hachimon: '驚門' }),
        son: palace({ tenban: '甲', chiban: '甲', kyusei: '天輔', hachimon: '開門' }),
        ri: palace({ tenban: '甲', chiban: '甲', kyusei: '天英', hachimon: '休門' }), // 休門が離宮 = 反吟
        kun: palace({ tenban: '甲', chiban: '甲', kyusei: '天芮', hachimon: '生門' }),
        da: palace({ tenban: '甲', chiban: '甲', kyusei: '天柱', hachimon: '傷門' }),
        ken: palace({ tenban: '甲', chiban: '甲', kyusei: '天心', hachimon: '杜門' }),
      },
    };
    const r = detectBoardKakkyoku(board);
    expect(r.find(x => x.name === '反吟')).toBeDefined();
  });

  it('五不遇時: 戊日×甲時で成立（時盤のみ）', () => {
    const board = {
      meta: makeBoardMeta({ eto_day: '戊申', eto_time: '甲子', boardType: '時' }),
      palaces: {
        kan: palace({ tenban: '甲', chiban: '甲' }),
      },
    };
    const r = detectBoardKakkyoku(board);
    expect(r.find(x => x.name === '五不遇時')).toBeDefined();
  });

  it('五不遇時: 日盤では成立しない', () => {
    const board = {
      meta: makeBoardMeta({ eto_day: '戊申', eto_time: '甲子', boardType: '日' }),
      palaces: {
        kan: palace({ tenban: '甲', chiban: '甲' }),
      },
    };
    const r = detectBoardKakkyoku(board);
    expect(r.find(x => x.name === '五不遇時')).toBeUndefined();
  });
});

describe('scoreBanLevel: 盤レベル減点', () => {
  it('反吟・門迫が両方あれば-20', () => {
    // 上の門迫テストと反吟テストを足した盤
    // tenban !== chiban にして伏吟を回避（戊×己 など）
    const board = {
      meta: makeBoardMeta(),
      palaces: {
        kan: palace({ tenban: '戊', chiban: '己', kyusei: '天蓬', hachimon: '景門' }),
        gon: palace({ tenban: '戊', chiban: '己', kyusei: '天任', hachimon: '死門' }),
        shin: palace({ tenban: '戊', chiban: '己', kyusei: '天衝', hachimon: '開門' }), // 門迫
        son: palace({ tenban: '戊', chiban: '己', kyusei: '天輔', hachimon: '驚門' }),
        ri: palace({ tenban: '戊', chiban: '己', kyusei: '天英', hachimon: '休門' }), // 反吟
        kun: palace({ tenban: '戊', chiban: '己', kyusei: '天芮', hachimon: '生門' }),
        da: palace({ tenban: '戊', chiban: '己', kyusei: '天柱', hachimon: '傷門' }),
        ken: palace({ tenban: '戊', chiban: '己', kyusei: '天心', hachimon: '杜門' }),
      },
    };
    const score = scoreBanLevel(board);
    expect(score.ban_minus).toBe(-20);
    expect(score.detected).toContain('反吟');
    expect(score.detected).toContain('門迫');
  });
});
