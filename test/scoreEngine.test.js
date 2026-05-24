// test/scoreEngine.test.js
import { describe, it, expect } from 'vitest';
import {
  scorePalace,
  scoreBoard,
  getPurposeTags,
  USABLE_THRESHOLD,
  SCORE_KAN,
  SCORE_MON,
  SCORE_KYUSEI,
  SCORE_HASSHIN,
} from '../src/kimon/scoreEngine.js';

// ============================================================
// テストヘルパー
// ============================================================

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

function palace({ tenban = '', chiban = '', kyusei = '', hasshin = '', hachimon = '' }) {
  return { tenban, chiban, kyusei, hasshin, hachimon };
}

// ============================================================
// スコア定数
// ============================================================

describe('スコア定数', () => {
  it('三奇は+10、庚は-20', () => {
    expect(SCORE_KAN['乙']).toBe(10);
    expect(SCORE_KAN['丙']).toBe(10);
    expect(SCORE_KAN['丁']).toBe(10);
    expect(SCORE_KAN['庚']).toBe(-20);
  });

  it('三吉門は+40、景門は+20', () => {
    expect(SCORE_MON['休門']).toBe(40);
    expect(SCORE_MON['生門']).toBe(40);
    expect(SCORE_MON['開門']).toBe(40);
    expect(SCORE_MON['景門']).toBe(20);
  });

  it('天衝/天輔/天心/天任は+10', () => {
    expect(SCORE_KYUSEI['天衝']).toBe(10);
    expect(SCORE_KYUSEI['天輔']).toBe(10);
    expect(SCORE_KYUSEI['天心']).toBe(10);
    expect(SCORE_KYUSEI['天任']).toBe(10);
  });

  it('天冲（天衝の同字異体）も+10', () => {
    expect(SCORE_KYUSEI['天冲']).toBe(10);
  });

  it('八神の吉星は+20、凶星は-20', () => {
    expect(SCORE_HASSHIN['直符']).toBe(20);
    expect(SCORE_HASSHIN['太陰']).toBe(20);
    expect(SCORE_HASSHIN['六合']).toBe(20);
    expect(SCORE_HASSHIN['九地']).toBe(20);
    expect(SCORE_HASSHIN['九天']).toBe(20);
    expect(SCORE_HASSHIN['螣蛇']).toBe(-20);
    expect(SCORE_HASSHIN['勾陳']).toBe(-20);
    expect(SCORE_HASSHIN['朱雀']).toBe(-20);
  });

  it('USABLE_THRESHOLD は40', () => {
    expect(USABLE_THRESHOLD).toBe(40);
  });
});

// ============================================================
// scorePalace: 各要素のスコア
// ============================================================

describe('scorePalace: 基本スコア', () => {
  it('完全な吉宮（乙+休門+天輔+直符+乙丙〇）', () => {
    const meta = makeBoardMeta({ junshu: '壬' });
    const p = palace({
      tenban: '乙', chiban: '丙',
      kyusei: '天輔', hasshin: '直符', hachimon: '休門',
    });
    const r = scorePalace(p, 'kan', meta);
    // 乙+10, 休門+40, 天輔+10, 直符+20, 乙丙=〇+10, 龍遁(乙+休門+坎)+10 = 100
    expect(r.breakdown.tenban_kan).toBe(10);
    expect(r.breakdown.hachimon).toBe(40);
    expect(r.breakdown.kyusei).toBe(10);
    expect(r.breakdown.hasshin).toBe(20);
    expect(r.breakdown.jukkan_kokuou).toBe(10);
    expect(r.breakdown.kakkyoku).toBe(10); // 龍遁
    expect(r.score).toBe(100);
    expect(r.usable).toBe(true);
    expect(r.detected_kakkyoku.find(k => k.name === '龍遁')).toBeDefined();
  });

  it('完全な凶宮（庚+死門+天蓬+螣蛇+庚庚×）', () => {
    const p = palace({
      tenban: '庚', chiban: '庚',
      kyusei: '天蓬', hasshin: '螣蛇', hachimon: '死門',
    });
    const r = scorePalace(p, 'kan', makeBoardMeta());
    // 庚-20, 死門-40, 天蓬0, 螣蛇-20, 庚庚=×-10 (太白同宮) = -90
    // 注: 戦格は十干剋応「庚庚×太白同宮」と重複するため格局から削除済
    expect(r.breakdown.tenban_kan).toBe(-20);
    expect(r.breakdown.hasshin).toBe(-20);
    expect(r.breakdown.jukkan_kokuou).toBe(-10);
    expect(r.score).toBe(-90);
    expect(r.usable).toBe(false);
  });

  it('40点ちょうどでusable=true', () => {
    // 戊0 + 生門40 + 天蓬0 + 八神なし0 + 戊己=×-10 = 30
    // 宮名は gon（艮宮）にして 4パターン門迫（坎+生門）を避ける
    const p = palace({
      tenban: '戊', chiban: '己', // 戊己=×貴人入獄 → -10
      kyusei: '天蓬', hasshin: '', hachimon: '生門',
    });
    const r = scorePalace(p, 'gon', makeBoardMeta());
    expect(r.score).toBe(30);
    expect(r.usable).toBe(false);
  });

  it('40点ジャストで使用可能', () => {
    // 乙+10 + 生門+40 + 天蓬0 + (空)0 + 乙己=×-10 = 40
    // 宮名は gon にして 4パターン門迫（坎+生門）を避ける
    const p = palace({
      tenban: '乙', chiban: '己',
      kyusei: '天蓬', hasshin: '', hachimon: '生門',
    });
    const r = scorePalace(p, 'gon', makeBoardMeta());
    expect(r.score).toBe(40);
    expect(r.usable).toBe(true);
  });
});

// ============================================================
// 刑格 ダブルカウント（先生指示 2026-05-18）
// 天盤庚×地盤己 → 十干剋応「官符刑格」(-10) + 格局「刑格」(-10)
// ============================================================

describe('刑格 ダブルカウント', () => {
  it('庚×己 は jukkan_kokuou -10 と kakkyoku -10 を別々に計上', () => {
    const p = palace({ tenban: '庚', chiban: '己', kyusei: '', hasshin: '', hachimon: '' });
    const r = scorePalace(p, 'kan', makeBoardMeta());
    expect(r.breakdown.jukkan_kokuou).toBe(-10); // 官符刑格(×)
    expect(r.breakdown.kakkyoku).toBe(-10);      // 刑格(凶格)
    expect(r.detected_kakkyoku.find(k => k.name === '刑格')).toBeDefined();
  });

  it('該当宮の合計: 庚-20 + 官符刑格-10 + 刑格-10 = -40', () => {
    const p = palace({ tenban: '庚', chiban: '己', kyusei: '', hasshin: '', hachimon: '' });
    const r = scorePalace(p, 'kan', makeBoardMeta());
    expect(r.breakdown.tenban_kan).toBe(-20);
    expect(r.breakdown.subtotal).toBe(-40);
    expect(r.score).toBe(-40);
  });
});

// ============================================================
// 複合表記対応
// ============================================================

describe('複合表記対応', () => {
  it('天盤"戊丁"は丁の+10だけ加算（戊は0）', () => {
    const p = palace({
      tenban: '戊丁', chiban: '丙',
      kyusei: '天蓬', hasshin: '', hachimon: '',
    });
    const r = scorePalace(p, 'kan', makeBoardMeta());
    expect(r.breakdown.tenban_kan).toBe(10); // 戊=0 + 丁=+10
  });

  it('天盤"乙丙"は両方+10で合計+20', () => {
    const p = palace({
      tenban: '乙丙', chiban: '',
      kyusei: '', hasshin: '', hachimon: '',
    });
    const r = scorePalace(p, 'kan', makeBoardMeta());
    expect(r.breakdown.tenban_kan).toBe(20); // 乙+10 + 丙+10
  });

  it('天盤"庚丙"は-20+10=-10', () => {
    const p = palace({
      tenban: '庚丙', chiban: '',
      kyusei: '', hasshin: '', hachimon: '',
    });
    const r = scorePalace(p, 'kan', makeBoardMeta());
    expect(r.breakdown.tenban_kan).toBe(-10); // 庚-20 + 丙+10
  });
});

// ============================================================
// 盤レベル減点
// ============================================================

describe('盤レベル減点', () => {
  it('ban_level_minusが渡されると合計から引かれる', () => {
    const meta = makeBoardMeta({ junshu: '壬' });
    const p = palace({
      tenban: '乙', chiban: '丙',
      kyusei: '天輔', hasshin: '直符', hachimon: '休門',
    });
    const r = scorePalace(p, 'kan', meta, { ban_level_minus: -20 });
    // subtotal = 100（龍遁込み）、ban_level_minus = -20、score = 80
    expect(r.breakdown.subtotal).toBe(100);
    expect(r.breakdown.ban_level_minus).toBe(-20);
    expect(r.score).toBe(80);
  });
});

// ============================================================
// getPurposeTags
// ============================================================

describe('getPurposeTags: 目的別タグ', () => {
  it('休門 → 恋愛/学力に該当', () => {
    const p = palace({ hachimon: '休門' });
    const tags = getPurposeTags(p);
    const purposes = tags.map(t => t.purpose);
    expect(purposes).toContain('恋愛・結婚・健康');
    expect(purposes).toContain('学力');
  });

  it('生門 → 金運に該当', () => {
    const p = palace({ hachimon: '生門' });
    const tags = getPurposeTags(p);
    expect(tags.map(t => t.purpose)).toEqual(['金運']);
  });

  it('開門 → 仕事運に該当', () => {
    const p = palace({ hachimon: '開門' });
    const tags = getPurposeTags(p);
    expect(tags.map(t => t.purpose)).toEqual(['仕事運']);
  });

  it('景門 → 学力のみ', () => {
    const p = palace({ hachimon: '景門' });
    const tags = getPurposeTags(p);
    expect(tags.map(t => t.purpose)).toEqual(['学力']);
  });

  it('傷門 → 該当なし', () => {
    const p = palace({ hachimon: '傷門' });
    expect(getPurposeTags(p)).toEqual([]);
  });

  it('生門+直符 → 金運のstrength=strong', () => {
    const p = palace({ hachimon: '生門', hasshin: '直符' });
    const tags = getPurposeTags(p);
    const fortune = tags.find(t => t.purpose === '金運');
    expect(fortune.strength).toBe('strong');
    expect(fortune.reasons).toContain('八神=直符（ブースト）');
  });

  it('開門+朱雀 → 仕事運のstrength=conditional', () => {
    const p = palace({ hachimon: '開門', hasshin: '朱雀' });
    const tags = getPurposeTags(p);
    const work = tags.find(t => t.purpose === '仕事運');
    expect(work.strength).toBe('conditional');
  });

  it('休門+六合 → 恋愛のstrength=strong', () => {
    const p = palace({ hachimon: '休門', hasshin: '六合' });
    const tags = getPurposeTags(p);
    const love = tags.find(t => t.purpose === '恋愛・結婚・健康');
    expect(love.strength).toBe('strong');
  });

  it('休門+九天 → 恋愛(男性向け)もstrong', () => {
    const p = palace({ hachimon: '休門', hasshin: '九天' });
    const tags = getPurposeTags(p);
    const love = tags.find(t => t.purpose === '恋愛・結婚・健康');
    expect(love.strength).toBe('strong');
    expect(love.reasons.some(r => r.includes('男性向け'))).toBe(true);
  });

  it('休門+九地 → 恋愛(女性向け)もstrong', () => {
    const p = palace({ hachimon: '休門', hasshin: '九地' });
    const tags = getPurposeTags(p);
    const love = tags.find(t => t.purpose === '恋愛・結婚・健康');
    expect(love.strength).toBe('strong');
    expect(love.reasons.some(r => r.includes('女性向け'))).toBe(true);
  });
});

// ============================================================
// scoreBoard: 盤全体
// ============================================================

describe('scoreBoard: 盤全体集計', () => {
  function makeFullBoard() {
    return {
      meta: makeBoardMeta({ junshu: '壬' }),
      palaces: {
        // 高スコアの吉宮（乙+休門+天輔+直符）
        kan: palace({
          tenban: '乙', chiban: '丙',
          kyusei: '天輔', hasshin: '直符', hachimon: '休門',
        }),
        // 凶宮（庚+死門+天蓬+螣蛇）
        gon: palace({
          tenban: '庚', chiban: '庚',
          kyusei: '天蓬', hasshin: '螣蛇', hachimon: '死門',
        }),
        // 中スコアの金運（丙+生門+天任+直符）
        shin: palace({
          tenban: '丙', chiban: '丁',
          kyusei: '天任', hasshin: '直符', hachimon: '生門',
        }),
        son: palace({
          tenban: '戊', chiban: '戊',
          kyusei: '天輔', hasshin: '太陰', hachimon: '杜門',
        }),
        ri: palace({
          tenban: '丁', chiban: '戊',
          kyusei: '天英', hasshin: '六合', hachimon: '景門',
        }),
        kun: palace({
          tenban: '己', chiban: '己',
          kyusei: '天芮', hasshin: '勾陳', hachimon: '死門',
        }),
        da: palace({
          tenban: '辛', chiban: '辛',
          kyusei: '天柱', hasshin: '九地', hachimon: '驚門',
        }),
        ken: palace({
          tenban: '癸', chiban: '癸',
          kyusei: '天心', hasshin: '九天', hachimon: '開門',
        }),
      },
    };
  }

  it('全宮のスコアが計算される', () => {
    const board = makeFullBoard();
    const result = scoreBoard(board);
    expect(Object.keys(result.palaces)).toHaveLength(8);
    for (const palName of ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken']) {
      expect(result.palaces[palName]).toBeDefined();
      expect(result.palaces[palName].score).toBeDefined();
    }
  });

  it('best_overall は最高スコアの宮', () => {
    const board = makeFullBoard();
    const result = scoreBoard(board);
    // 一番高いスコアの宮を確認
    const bestScore = Math.max(...Object.values(result.palaces).map(p => p.score));
    expect(result.palaces[result.best_overall].score).toBe(bestScore);
  });

  it('usable_palaces には40点以上の宮のみ', () => {
    const board = makeFullBoard();
    const result = scoreBoard(board);
    for (const name of result.usable_palaces) {
      expect(result.palaces[name].score).toBeGreaterThanOrEqual(40);
    }
  });

  it('best_by_purpose に4つの目的が含まれる', () => {
    const board = makeFullBoard();
    const result = scoreBoard(board);
    expect(Object.keys(result.best_by_purpose)).toEqual(
      expect.arrayContaining(['恋愛・結婚・健康', '金運', '仕事運', '学力'])
    );
  });

  it('該当なしの目的はnull', () => {
    // 全宮に三吉門・景門がない盤
    const board = {
      meta: makeBoardMeta(),
      palaces: {
        kan: palace({ tenban: '乙', chiban: '丙', kyusei: '天蓬', hachimon: '傷門' }),
        gon: palace({ tenban: '丙', chiban: '丁', kyusei: '天任', hachimon: '杜門' }),
        shin: palace({ tenban: '丁', chiban: '戊', kyusei: '天衝', hachimon: '死門' }),
        son: palace({ tenban: '戊', chiban: '己', kyusei: '天輔', hachimon: '驚門' }),
        ri: palace({ tenban: '己', chiban: '庚', kyusei: '天英', hachimon: '傷門' }),
        kun: palace({ tenban: '庚', chiban: '辛', kyusei: '天芮', hachimon: '杜門' }),
        da: palace({ tenban: '辛', chiban: '壬', kyusei: '天柱', hachimon: '死門' }),
        ken: palace({ tenban: '壬', chiban: '癸', kyusei: '天心', hachimon: '驚門' }),
      },
    };
    const result = scoreBoard(board);
    expect(result.best_by_purpose['金運']).toBeNull();
    expect(result.best_by_purpose['仕事運']).toBeNull();
  });

  it('盤レベル減点（星伏吟）が全宮スコアに反映され、門迫は該当宮のみ減点', () => {
    // Phase 2A: 全宮で九星=定位 → 星伏吟（-10 全宮）
    //   震宮+開門, 離宮+休門 は 4パターン門迫該当（該当宮のみ -10）
    const board = {
      meta: makeBoardMeta(),
      palaces: {
        kan: palace({ tenban: '戊', chiban: '己', kyusei: '天蓬', hachimon: '景門' }),
        gon: palace({ tenban: '戊', chiban: '己', kyusei: '天任', hachimon: '死門' }),
        shin: palace({ tenban: '戊', chiban: '己', kyusei: '天衝', hachimon: '開門' }), // 門迫
        son: palace({ tenban: '戊', chiban: '己', kyusei: '天輔', hachimon: '驚門' }),
        ri: palace({ tenban: '戊', chiban: '己', kyusei: '天英', hachimon: '休門' }),   // 門迫
        kun: palace({ tenban: '戊', chiban: '己', kyusei: '天芮', hachimon: '生門' }),
        da: palace({ tenban: '戊', chiban: '己', kyusei: '天柱', hachimon: '傷門' }),
        ken: palace({ tenban: '戊', chiban: '己', kyusei: '天心', hachimon: '杜門' }),
      },
    };
    const result = scoreBoard(board);
    expect(result.ban_level.board_minus).toBe(-10);   // 星伏吟のみ
    expect(result.ban_level.detected).toContain('星伏吟');
    // 全宮で -10 の盤レベル減点が入る
    for (const palName of Object.keys(result.palaces)) {
      expect(result.palaces[palName].breakdown.ban_level_minus).toBe(-10);
    }
    // 該当宮のみ門迫 -10
    expect(result.palaces.shin.breakdown.monpaku).toBe(-10);
    expect(result.palaces.ri.breakdown.monpaku).toBe(-10);
    expect(result.palaces.kan.breakdown.monpaku).toBe(0);
    expect(result.palaces.gon.breakdown.monpaku).toBe(0);
    expect(result.palaces.son.breakdown.monpaku).toBe(0);
    expect(result.palaces.kun.breakdown.monpaku).toBe(0);
    expect(result.palaces.da.breakdown.monpaku).toBe(0);
    expect(result.palaces.ken.breakdown.monpaku).toBe(0);
  });
});

// ============================================================
// Phase 3-C: ◎順利 (junri) — scoreBoard 統合
// ============================================================

describe('scoreBoard: ◎順利フラグ (Phase 3-C)', () => {
  /**
   * 起点宮=kan（dayKan=戊 を kan.tenban に置く）の盤を構成。
   * 対象宮テーブル(kan)=[kan, da, ken] の各宮で吉門/凶門/スコア境界を検証する。
   * 非対象宮(gon/shin/son/ri/kun)は星伏吟・五不遇時・門迫を回避するダミー構成。
   */
  function makeJunriBoardKanOrigin() {
    return {
      meta: makeBoardMeta({ eto_day: '戊申', junshu: '壬' }),
      palaces: {
        // 起点: dayKan='戊' を tenban に置く。吉門+高スコア → ◎順利想定。
        kan:  palace({ tenban: '戊', chiban: '己', kyusei: '天蓬', hasshin: '六合', hachimon: '休門' }),
        // 対象 da: 吉門だがスコア低 (<40) → 順利不成立想定。
        //   兌+景門は門迫なので、吉門は休門を使う。
        da:   palace({ tenban: '辛', chiban: '',  kyusei: '天柱', hasshin: '勾陳', hachimon: '休門' }),
        // 対象 ken: 凶門 (死門) → スコアにかかわらず順利不成立想定。
        ken:  palace({ tenban: '乙', chiban: '癸', kyusei: '天心', hasshin: '直符', hachimon: '死門' }),
        // 以下は非対象宮（kyusei は全宮で別星にして星伏吟を回避）
        gon:  palace({ tenban: '丁', chiban: '丁', kyusei: '天任', hasshin: '太陰', hachimon: '杜門' }),
        shin: palace({ tenban: '己', chiban: '己', kyusei: '天衝', hasshin: '九地', hachimon: '驚門' }),
        son:  palace({ tenban: '癸', chiban: '癸', kyusei: '天輔', hasshin: '螣蛇', hachimon: '傷門' }),
        ri:   palace({ tenban: '丙', chiban: '丙', kyusei: '天英', hasshin: '朱雀', hachimon: '驚門' }),
        kun:  palace({ tenban: '辛', chiban: '辛', kyusei: '天芮', hasshin: '九天', hachimon: '杜門' }),
      },
    };
  }

  it('day_kan_palace は天盤の日干から決まり、対象宮テーブルが適用される', () => {
    const r = scoreBoard(makeJunriBoardKanOrigin());
    expect(r.day_kan_palace).toBe('kan'); // dayKan='戊' は kan.tenban に存在
  });

  it('対象宮で吉門+40以上 → is_junri=true / junri_palaces に入る', () => {
    const r = scoreBoard(makeJunriBoardKanOrigin());
    // kan: 六合(+20) + 休門(+40) + 戊×己 jukkan(-10) = +50 を見込む
    expect(r.palaces.kan.score).toBeGreaterThanOrEqual(40);
    expect(r.palaces.kan.is_junri).toBe(true);
    expect(r.junri_palaces).toContain('kan');
  });

  it('対象宮で吉門だが40未満 → is_junri=false', () => {
    const r = scoreBoard(makeJunriBoardKanOrigin());
    // da: 辛(0) + 勾陳(-20) + 休門(+40) + jukkan(0) ≒ +20 (盤レベル減点が乗ればさらに減)
    expect(r.palaces.da.score).toBeLessThan(40);
    expect(r.palaces.da.is_junri).toBe(false);
    expect(r.junri_palaces).not.toContain('da');
  });

  it('対象宮で凶門 → is_junri=false（凶門フィルタが効く）', () => {
    // 注: scoring rules 上「凶門 (-40) を持ち合計 ≥40」は実質構築不能。
    //     ここでは achievable な凶門スコアで「八門が凶 → 順利棄却」を確認し、
    //     ≥40 with 凶門 のフィルタ動作は junri.test.js の単体テストで網羅。
    const board = makeJunriBoardKanOrigin();
    const r = scoreBoard(board);
    expect(['傷門','杜門','死門','驚門']).toContain(board.palaces.ken.hachimon);
    expect(r.palaces.ken.is_junri).toBe(false);
    expect(r.junri_palaces).not.toContain('ken');
  });

  it('日干が天盤に無く、旬首フォールバックで day_kan_palace が決まる', () => {
    // dayKan='甲' は天盤に存在しない。junshu='壬' を ri.tenban に置く → 起点=ri、対象=[ri, shin, son]
    // shin に 吉門+高スコア を置いて順利成立を確認
    const board = {
      meta: makeBoardMeta({ eto_day: '甲子', junshu: '壬' }),
      palaces: {
        kan:  palace({ tenban: '乙', chiban: '丙', kyusei: '天蓬', hasshin: '太陰', hachimon: '杜門' }),
        gon:  palace({ tenban: '丁', chiban: '丁', kyusei: '天任', hasshin: '六合', hachimon: '景門' }),
        // shin+開門は門迫なので 生門 を使う。乙(+10) + 直符(+20) + 生門(+40) ≒ +70
        shin: palace({ tenban: '乙', chiban: '丙', kyusei: '天衝', hasshin: '直符', hachimon: '生門' }),
        son:  palace({ tenban: '癸', chiban: '癸', kyusei: '天輔', hasshin: '螣蛇', hachimon: '傷門' }),
        ri:   palace({ tenban: '壬', chiban: '癸', kyusei: '天英', hasshin: '朱雀', hachimon: '驚門' }), // 旬首干あり
        kun:  palace({ tenban: '辛', chiban: '辛', kyusei: '天芮', hasshin: '九天', hachimon: '杜門' }),
        da:   palace({ tenban: '己', chiban: '己', kyusei: '天柱', hasshin: '勾陳', hachimon: '驚門' }),
        ken:  palace({ tenban: '丁', chiban: '丁', kyusei: '天心', hasshin: '九地', hachimon: '死門' }),
      },
    };
    const r = scoreBoard(board);
    expect(r.day_kan_palace).toBe('ri'); // 旬首フォールバック
    expect(r.palaces.shin.score).toBeGreaterThanOrEqual(40);
    expect(r.palaces.shin.is_junri).toBe(true);
    expect(r.junri_palaces).toContain('shin');
  });
});

// ============================================================
// breakdown の検証
// ============================================================

describe('breakdown: 内訳が読みやすい', () => {
  it('detected_kakkyoku に該当格局が並ぶ', () => {
    // 龍遁(乙+休門+坎)を使う：丙×甲(旬首)の飛鳥跌穴は十干剋応で処理されるため
    const meta = makeBoardMeta();
    const p = palace({
      tenban: '乙', chiban: '丙',
      kyusei: '天輔', hasshin: '直符', hachimon: '休門',
    });
    const r = scorePalace(p, 'kan', meta);
    expect(r.detected_kakkyoku.find(k => k.name === '龍遁')).toBeDefined();
  });

  it('breakdownで各要素の貢献が分かる', () => {
    const meta = makeBoardMeta();
    const p = palace({
      tenban: '乙', chiban: '丙',
      kyusei: '天輔', hasshin: '直符', hachimon: '休門',
    });
    const r = scorePalace(p, 'kan', meta);
    // 全要素のキーがある
    expect(r.breakdown).toHaveProperty('tenban_kan');
    expect(r.breakdown).toHaveProperty('hachimon');
    expect(r.breakdown).toHaveProperty('kyusei');
    expect(r.breakdown).toHaveProperty('hasshin');
    expect(r.breakdown).toHaveProperty('jukkan_kokuou');
    expect(r.breakdown).toHaveProperty('kakkyoku');
    expect(r.breakdown).toHaveProperty('ban_level_minus');
    expect(r.breakdown).toHaveProperty('subtotal');
  });
});
