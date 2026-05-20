import { describe, it, expect } from 'vitest';
import {
  detectGofuguuji,
  detectKanFukugin,
  detectSeiFukugin,
  detectMonFukugin,
  detectSeiHangin,
  detectMonHangin,
  isMonpakuCell,
  isKuubouCell,
  isKuubouZodiac,
  detectMonpakuPalaces,
  detectKuubouPalaces,
  detectBanLevel,
  scoreBoardBanLevel,
  scorePalaceBanLevel,
  PALACE_NAMES,
} from '../src/kimon/banLevel.js';

// ============================================================
// テストヘルパー
// ============================================================

function palace({ tenban = '', chiban = '', kyusei = '', hasshin = '', hachimon = '' }) {
  return { tenban, chiban, kyusei, hasshin, hachimon };
}

/** 全宮 九星=定位 の盤 */
function teiiKyuseiPalaces(overrides = {}) {
  const teii = {
    kan: '天蓬', gon: '天任', shin: '天衝', son: '天輔',
    ri: '天英', kun: '天芮', da: '天柱', ken: '天心',
  };
  const out = {};
  for (const n of PALACE_NAMES) {
    out[n] = palace({ kyusei: teii[n] });
  }
  return { ...out, ...overrides };
}

/** 全宮 九星=反吟逆配置 の盤 */
function hanginKyuseiPalaces(overrides = {}) {
  const hangin = {
    kan: '天英', gon: '天芮', shin: '天柱', son: '天心',
    ri: '天蓬', kun: '天任', da: '天衝', ken: '天輔',
  };
  const out = {};
  for (const n of PALACE_NAMES) {
    out[n] = palace({ kyusei: hangin[n] });
  }
  return { ...out, ...overrides };
}

/** 全宮 八門=定位 の盤 */
function teiiMonPalaces(overrides = {}) {
  const teii = {
    kan: '休門', gon: '生門', shin: '傷門', son: '杜門',
    ri: '景門', kun: '死門', da: '驚門', ken: '開門',
  };
  const out = {};
  for (const n of PALACE_NAMES) {
    out[n] = palace({ hachimon: teii[n] });
  }
  return { ...out, ...overrides };
}

/** 全宮 八門=反吟逆配置 の盤 */
function hanginMonPalaces(overrides = {}) {
  const hangin = {
    kan: '景門', gon: '死門', shin: '驚門', son: '開門',
    ri: '休門', kun: '生門', da: '傷門', ken: '杜門',
  };
  const out = {};
  for (const n of PALACE_NAMES) {
    out[n] = palace({ hachimon: hangin[n] });
  }
  return { ...out, ...overrides };
}

// ============================================================
// 五不遇時（Phase 1 から継続、-10 全宮化は scoreEngine 側でテスト）
// ============================================================

describe('detectGofuguuji', () => {
  it('甲日×庚時 で検出', () => {
    expect(detectGofuguuji('甲', '庚', '時')).toBe('甲日×庚時');
  });
  it('癸日×己時 で検出', () => {
    expect(detectGofuguuji('癸', '己', '時')).toBe('癸日×己時');
  });
  it('甲日×丙時 では検出しない', () => {
    expect(detectGofuguuji('甲', '丙', '時')).toBeNull();
  });
  it('日盤では検出しない', () => {
    expect(detectGofuguuji('甲', '庚', '日')).toBeNull();
  });
  it('日干・時干が空はnull', () => {
    expect(detectGofuguuji('', '庚', '時')).toBeNull();
    expect(detectGofuguuji('甲', '', '時')).toBeNull();
  });
  it('10通りの組み合わせ全てを検出', () => {
    const pairs = [
      ['甲', '庚'], ['乙', '辛'], ['丙', '壬'], ['丁', '癸'], ['戊', '甲'],
      ['己', '乙'], ['庚', '丙'], ['辛', '丁'], ['壬', '戊'], ['癸', '己'],
    ];
    for (const [d, h] of pairs) {
      expect(detectGofuguuji(d, h, '時')).toBe(`${d}日×${h}時`);
    }
  });
});

// ============================================================
// 干伏吟 (kan_fukugin)
// ============================================================

describe('detectKanFukugin', () => {
  it('全宮で天盤===地盤 → 干伏吟', () => {
    const palaces = {};
    for (const n of PALACE_NAMES) palaces[n] = palace({ tenban: '戊', chiban: '戊' });
    expect(detectKanFukugin(palaces)).toBe(true);
  });
  it('1宮でも不一致なら干伏吟は不発', () => {
    const palaces = {};
    for (const n of PALACE_NAMES) palaces[n] = palace({ tenban: '戊', chiban: '戊' });
    palaces.kan = palace({ tenban: '戊', chiban: '己' });
    expect(detectKanFukugin(palaces)).toBe(false);
  });
  it('複合表記は先頭干で比較（旧仕様の流儀を踏襲）', () => {
    const palaces = {};
    for (const n of PALACE_NAMES) palaces[n] = palace({ tenban: '戊丁', chiban: '戊' });
    expect(detectKanFukugin(palaces)).toBe(true);
  });
});

// ============================================================
// 星伏吟・門伏吟
// ============================================================

describe('detectSeiFukugin', () => {
  it('全宮で九星=定位 → 星伏吟', () => {
    expect(detectSeiFukugin(teiiKyuseiPalaces())).toBe(true);
  });
  it('1宮ずれていれば不発', () => {
    expect(detectSeiFukugin(teiiKyuseiPalaces({ kan: palace({ kyusei: '天英' }) }))).toBe(false);
  });
  it('天冲↔天衝の同字異体は同一視', () => {
    expect(detectSeiFukugin(teiiKyuseiPalaces({ shin: palace({ kyusei: '天冲' }) }))).toBe(true);
  });
});

describe('detectMonFukugin', () => {
  it('全宮で八門=定位 → 門伏吟', () => {
    expect(detectMonFukugin(teiiMonPalaces())).toBe(true);
  });
  it('1宮ずれていれば不発', () => {
    expect(detectMonFukugin(teiiMonPalaces({ kan: palace({ hachimon: '生門' }) }))).toBe(false);
  });
});

// ============================================================
// 星反吟・門反吟（全宮逆配置）
// ============================================================

describe('detectSeiHangin', () => {
  it('全宮で九星=反吟逆配置 → 星反吟', () => {
    expect(detectSeiHangin(hanginKyuseiPalaces())).toBe(true);
  });
  it('1宮でも反吟逆配置でなければ不発', () => {
    expect(detectSeiHangin(hanginKyuseiPalaces({ kan: palace({ kyusei: '天蓬' }) }))).toBe(false);
  });
  it('単一宮の反吟逆配置だけでは発火しない（旧仕様の過剰検出を解消）', () => {
    const palaces = teiiKyuseiPalaces();
    palaces.ri = palace({ kyusei: '天蓬' }); // ri は反吟逆配置（定位は天英）
    expect(detectSeiHangin(palaces)).toBe(false);
  });
});

describe('detectMonHangin', () => {
  it('全宮で八門=反吟逆配置 → 門反吟', () => {
    expect(detectMonHangin(hanginMonPalaces())).toBe(true);
  });
  it('1宮でも反吟逆配置でなければ不発', () => {
    expect(detectMonHangin(hanginMonPalaces({ kan: palace({ hachimon: '休門' }) }))).toBe(false);
  });
  it('離宮+休門の1宮だけでは発火しない', () => {
    const palaces = teiiMonPalaces();
    palaces.ri = palace({ hachimon: '休門' });
    expect(detectMonHangin(palaces)).toBe(false);
  });
});

// ============================================================
// 門迫 4パターン（先生指示で限定）
// ============================================================

describe('isMonpakuCell: 4パターン限定', () => {
  it('坎宮+生門 → 門迫', () => expect(isMonpakuCell('kan', '生門')).toBe(true));
  it('震宮+開門 → 門迫', () => expect(isMonpakuCell('shin', '開門')).toBe(true));
  it('離宮+休門 → 門迫', () => expect(isMonpakuCell('ri', '休門')).toBe(true));
  it('兌宮+景門 → 門迫', () => expect(isMonpakuCell('da', '景門')).toBe(true));

  // 先生レビュー回答に基づく非該当サンプル（旧実装が誤検出していたケース）
  it.each([
    ['kan', '驚門'],   // 陰1局辛未 坎宮 驚門
    ['ri', '驚門'],    // 陰1局丁卯 離宮 驚門
    ['gon', '景門'],   // 陰1局壬申 艮宮 景門
    ['kan', '杜門'],   // 陰1局壬申 坎宮 杜門
    ['gon', '驚門'],   // 陰1局庚午 艮宮 驚門
    ['shin', '死門'],  // 陰2局壬申 震宮 死門
  ])('%s宮+%s は門迫ではない（先生レビュー回答準拠）', (p, m) => {
    expect(isMonpakuCell(p, m)).toBe(false);
  });

  it('4パターン外の組合せは全て non-門迫', () => {
    const allMon = ['休門', '生門', '傷門', '杜門', '景門', '死門', '驚門', '開門'];
    const pat = { kan: '生門', shin: '開門', ri: '休門', da: '景門' };
    for (const p of PALACE_NAMES) {
      for (const m of allMon) {
        const expected = pat[p] === m;
        expect(isMonpakuCell(p, m)).toBe(expected);
      }
    }
  });
});

describe('detectMonpakuPalaces', () => {
  it('該当宮のみ配列に含まれる', () => {
    const palaces = {
      kan: palace({ hachimon: '生門' }),     // 該当
      gon: palace({ hachimon: '生門' }),     // 非該当
      shin: palace({ hachimon: '開門' }),    // 該当
      son: palace({ hachimon: '開門' }),     // 非該当
      ri: palace({ hachimon: '休門' }),      // 該当
      kun: palace({ hachimon: '休門' }),     // 非該当
      da: palace({ hachimon: '景門' }),      // 該当
      ken: palace({ hachimon: '景門' }),     // 非該当
    };
    expect(detectMonpakuPalaces(palaces).sort()).toEqual(['da', 'kan', 'ri', 'shin'].sort());
  });
});

// ============================================================
// 空亡（地支重複）
// ============================================================

describe('isKuubouZodiac（Phase 2C: 外周ラベル単独判定）', () => {
  it('空亡="申酉" のとき 申 と 酉 は true、他は false', () => {
    expect(isKuubouZodiac('申', '申酉')).toBe(true);
    expect(isKuubouZodiac('酉', '申酉')).toBe(true);
    expect(isKuubouZodiac('戌', '申酉')).toBe(false);
    expect(isKuubouZodiac('子', '申酉')).toBe(false);
  });
  it('空亡="午未" のとき 午 と 未 のみ true', () => {
    expect(isKuubouZodiac('午', '午未')).toBe(true);
    expect(isKuubouZodiac('未', '午未')).toBe(true);
    expect(isKuubouZodiac('巳', '午未')).toBe(false);
    expect(isKuubouZodiac('申', '午未')).toBe(false);
  });
  it('空亡 が空/未設定なら false', () => {
    expect(isKuubouZodiac('子', '')).toBe(false);
    expect(isKuubouZodiac('子', null)).toBe(false);
  });
  it('十二支文字が空なら false', () => {
    expect(isKuubouZodiac('', '申酉')).toBe(false);
    expect(isKuubouZodiac(null, '申酉')).toBe(false);
  });
  it('12 十二支すべて空亡判定を貫通できる', () => {
    const all = '子丑寅卯辰巳午未申酉戌亥';
    for (const z of all) {
      expect(isKuubouZodiac(z, all)).toBe(true);
    }
  });
});

describe('isKuubouCell / detectKuubouPalaces', () => {
  it('kuubou="申酉" → 坤宮(未申) と 兌宮(酉) が該当', () => {
    expect(isKuubouCell('kun', '申酉')).toBe(true);
    expect(isKuubouCell('da', '申酉')).toBe(true);
    expect(isKuubouCell('kan', '申酉')).toBe(false);
    expect(isKuubouCell('ken', '申酉')).toBe(false);
  });
  it('kuubou="戌亥" → 乾宮のみ該当', () => {
    expect(isKuubouCell('ken', '戌亥')).toBe(true);
    expect(isKuubouCell('kan', '戌亥')).toBe(false);
  });
  it('kuubou が空/未設定なら該当宮は0件', () => {
    const palaces = {};
    for (const n of PALACE_NAMES) palaces[n] = palace({});
    expect(detectKuubouPalaces(palaces, '')).toEqual([]);
    expect(detectKuubouPalaces(palaces, null)).toEqual([]);
  });
});

// ============================================================
// detectBanLevel: 統合構造
// ============================================================

describe('detectBanLevel: 統合', () => {
  it('全フラグ false の盤では全て false / 空配列 / null', () => {
    const palaces = {};
    for (const n of PALACE_NAMES) palaces[n] = palace({ tenban: '甲', chiban: '乙' });
    const r = detectBanLevel({ meta: { boardType: '日', kuubou: '' }, palaces });
    expect(r.kan_fukugin).toBe(false);
    expect(r.sei_fukugin).toBe(false);
    expect(r.mon_fukugin).toBe(false);
    expect(r.sei_hangin).toBe(false);
    expect(r.mon_hangin).toBe(false);
    expect(r.monpaku_palaces).toEqual([]);
    expect(r.kuubou_palaces).toEqual([]);
    expect(r.gofuguuji).toBeNull();
  });

  it('星伏吟 + 門迫(離+休門) が同時発火', () => {
    const palaces = teiiKyuseiPalaces();
    // 既存 kyusei に hachimon を追加（離宮を休門に）
    for (const n of PALACE_NAMES) palaces[n].hachimon = '';
    palaces.ri.hachimon = '休門';
    const r = detectBanLevel({ meta: { boardType: '日', kuubou: '' }, palaces });
    expect(r.sei_fukugin).toBe(true);
    expect(r.monpaku_palaces).toContain('ri');
  });
});

// ============================================================
// スコアリング（盤レベル / per-palace）
// ============================================================

describe('scoreBoardBanLevel', () => {
  it('該当フラグなし → 0', () => {
    expect(scoreBoardBanLevel({
      kan_fukugin: false, sei_fukugin: false, mon_fukugin: false,
      sei_hangin: false, mon_hangin: false, gofuguuji: null,
    })).toBe(0);
  });
  it('1フラグで -10、3フラグで -30', () => {
    expect(scoreBoardBanLevel({
      kan_fukugin: true, sei_fukugin: false, mon_fukugin: false,
      sei_hangin: false, mon_hangin: false, gofuguuji: null,
    })).toBe(-10);
    expect(scoreBoardBanLevel({
      kan_fukugin: true, sei_fukugin: true, mon_fukugin: true,
      sei_hangin: false, mon_hangin: false, gofuguuji: null,
    })).toBe(-30);
  });
  it('指示書の最大累積 -40（干+星+門伏吟+五不遇時）', () => {
    expect(scoreBoardBanLevel({
      kan_fukugin: true, sei_fukugin: true, mon_fukugin: true,
      sei_hangin: false, mon_hangin: false, gofuguuji: '甲日×庚時',
    })).toBe(-40);
  });
  it('五不遇時単独で -10（Phase 1の-30から -10 へ変更済）', () => {
    expect(scoreBoardBanLevel({
      kan_fukugin: false, sei_fukugin: false, mon_fukugin: false,
      sei_hangin: false, mon_hangin: false, gofuguuji: '甲日×庚時',
    })).toBe(-10);
  });
});

describe('scorePalaceBanLevel', () => {
  it('門迫4パターン該当 → monpaku -10', () => {
    expect(scorePalaceBanLevel('kan', { hachimon: '生門' }, '')).toEqual({ monpaku: -10, kuubou: 0 });
    expect(scorePalaceBanLevel('ri', { hachimon: '休門' }, '')).toEqual({ monpaku: -10, kuubou: 0 });
  });
  it('門迫4パターン外 → monpaku 0', () => {
    expect(scorePalaceBanLevel('kan', { hachimon: '驚門' }, '')).toEqual({ monpaku: 0, kuubou: 0 });
  });
  it('空亡該当 → kuubou -10', () => {
    expect(scorePalaceBanLevel('kun', { hachimon: '' }, '申酉')).toEqual({ monpaku: 0, kuubou: -10 });
    expect(scorePalaceBanLevel('da', { hachimon: '' }, '申酉')).toEqual({ monpaku: 0, kuubou: -10 });
  });
  it('門迫 + 空亡 同時で -20', () => {
    // 兌宮(酉)+景門 = 門迫、かつ kuubou=申酉 で空亡
    const r = scorePalaceBanLevel('da', { hachimon: '景門' }, '申酉');
    expect(r.monpaku).toBe(-10);
    expect(r.kuubou).toBe(-10);
  });
});
