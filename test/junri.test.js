// test/junri.test.js
// Phase 3-C: ◎順利判定の単体テスト
import { describe, it, expect } from 'vitest';
import {
  findDayKanPalace,
  detectJunri,
  JUNRI_KICHIMON,
  JUNRI_SCORE_THRESHOLD,
  JUNRI_TARGET_TABLE,
} from '../src/kimon/junri.js';

// ============================================================
// テストヘルパー
// ============================================================

const PALACE_KEYS = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];

/** 空の8宮を作る。caller が必要な宮だけ上書きする */
function makePalaces(overrides = {}) {
  const base = {};
  for (const k of PALACE_KEYS) {
    base[k] = { tenban: '', chiban: '', kyusei: '', hasshin: '', hachimon: '' };
  }
  for (const [k, v] of Object.entries(overrides)) {
    base[k] = { ...base[k], ...v };
  }
  return base;
}

/** scoreBoard が作る palaceScores と同じ形 */
function makeScores(overrides = {}) {
  const base = {};
  for (const k of PALACE_KEYS) {
    base[k] = { score: 0 };
  }
  for (const [k, v] of Object.entries(overrides)) {
    base[k] = { ...base[k], ...v };
  }
  return base;
}

function makeMeta(overrides = {}) {
  return {
    eto_day: '戊申',  // dayKan = 戊
    junshu: '壬',
    ...overrides,
  };
}

// ============================================================
// 定数
// ============================================================

describe('定数', () => {
  it('JUNRI_KICHIMON は休/生/開/景 の4種', () => {
    expect(JUNRI_KICHIMON).toEqual(['休門', '生門', '開門', '景門']);
  });

  it('JUNRI_SCORE_THRESHOLD は 40', () => {
    expect(JUNRI_SCORE_THRESHOLD).toBe(40);
  });

  it('JUNRI_TARGET_TABLE は仕様通り（8起点）', () => {
    expect(JUNRI_TARGET_TABLE.kan).toEqual(['kan', 'da', 'ken']);
    expect(JUNRI_TARGET_TABLE.gon).toEqual(['gon', 'ri']);
    expect(JUNRI_TARGET_TABLE.shin).toEqual(['shin', 'son', 'kan']);
    expect(JUNRI_TARGET_TABLE.son).toEqual(['shin', 'son', 'kan']);
    expect(JUNRI_TARGET_TABLE.ri).toEqual(['ri', 'shin', 'son']);
    expect(JUNRI_TARGET_TABLE.kun).toEqual(['kun', 'ri']);
    expect(JUNRI_TARGET_TABLE.da).toEqual(['da', 'ken', 'gon', 'kun']);
    expect(JUNRI_TARGET_TABLE.ken).toEqual(['da', 'ken', 'gon', 'kun']);
  });
});

// ============================================================
// findDayKanPalace
// ============================================================

describe('findDayKanPalace', () => {
  it('単独表記の天盤に日干があれば、その宮を返す', () => {
    const palaces = makePalaces({ shin: { tenban: '戊' } });
    expect(findDayKanPalace(palaces, makeMeta())).toBe('shin');
  });

  it('複合表記の中に日干があっても、その宮を返す', () => {
    const palaces = makePalaces({ ri: { tenban: '丙戊' } });
    expect(findDayKanPalace(palaces, makeMeta())).toBe('ri');
  });

  it('日干が天盤にない場合は meta.tenban_junshu_p（日本語名）→英字キーで返す', () => {
    // dayKan='戊' は天盤に存在せず、tenban_junshu_p='離' → 'ri'
    const palaces = makePalaces({
      kan: { tenban: '乙' },
      ri:  { tenban: '壬' },   // 旬首干 壬 がここに乗っている想定
    });
    const meta = makeMeta({ junshu: '壬', tenban_junshu_p: '離' });
    expect(findDayKanPalace(palaces, meta)).toBe('ri');
  });

  it('tenban_junshu_p 未設定でも meta.junshu を天盤スキャンしてフォールバックする', () => {
    // dayKan='戊' は天盤に存在せず、junshu='壬' を持つ宮が ken → 'ken'
    const palaces = makePalaces({
      kan: { tenban: '乙' },
      ken: { tenban: '壬' },
    });
    expect(findDayKanPalace(palaces, makeMeta({ junshu: '壬' }))).toBe('ken');
  });

  it('日干も旬首も天盤になければ null', () => {
    const palaces = makePalaces({ kan: { tenban: '乙' } });
    const meta = makeMeta({ eto_day: '甲子', junshu: '辛' });
    expect(findDayKanPalace(palaces, meta)).toBeNull();
  });

  it('palaces や meta が欠落していても安全に null を返す', () => {
    expect(findDayKanPalace(null, makeMeta())).toBeNull();
    expect(findDayKanPalace(makePalaces(), null)).toBeNull();
    expect(findDayKanPalace(makePalaces(), {})).toBeNull();
  });

  it('最初に見つかった宮を返す（探索は PALACE_NAMES 順）', () => {
    // kan と da の両方に '戊' を置いたら、PALACE_NAMES の順序で kan が先勝ち
    const palaces = makePalaces({
      kan: { tenban: '戊' },
      da:  { tenban: '戊' },
    });
    expect(findDayKanPalace(palaces, makeMeta())).toBe('kan');
  });
});

// ============================================================
// detectJunri
// ============================================================

describe('detectJunri', () => {
  it('対象宮で吉門4種＋40点以上 → 順利成立', () => {
    // dayKan=戊 を kan に置く → 起点=kan → 対象=[kan, da, ken]
    const palaces = makePalaces({
      kan: { tenban: '戊', hachimon: '休門' },
      da:  { tenban: '丙', hachimon: '生門' },
      ken: { tenban: '乙', hachimon: '開門' },
      ri:  { tenban: '丁', hachimon: '景門' },  // 対象外宮（除外確認）
    });
    const scores = makeScores({
      kan: { score: 50 },
      da:  { score: 60 },
      ken: { score: 70 },
      ri:  { score: 100 },   // 対象外なので junri 入りしない
    });
    const r = detectJunri({ meta: makeMeta(), palaces }, scores);
    expect(r.day_kan_palace).toBe('kan');
    expect(r.targets).toEqual(['kan', 'da', 'ken']);
    expect(r.junri_palaces.sort()).toEqual(['da', 'kan', 'ken']);
  });

  it('景門も吉門として順利に含める', () => {
    const palaces = makePalaces({
      kan: { tenban: '戊', hachimon: '景門' },
    });
    const scores = makeScores({ kan: { score: 40 } });
    const r = detectJunri({ meta: makeMeta(), palaces }, scores);
    expect(r.junri_palaces).toContain('kan');
  });

  it('傷/杜/死/驚は順利にならない（吉門でない）', () => {
    const palaces = makePalaces({
      kan: { tenban: '戊', hachimon: '傷門' },
      da:  { hachimon: '杜門' },
      ken: { hachimon: '死門' },
    });
    const scores = makeScores({
      kan: { score: 80 }, da: { score: 80 }, ken: { score: 80 },
    });
    const r = detectJunri({ meta: makeMeta(), palaces }, scores);
    expect(r.junri_palaces).toEqual([]);
  });

  it('合計点 < 40 なら順利にならない', () => {
    const palaces = makePalaces({
      kan: { tenban: '戊', hachimon: '休門' },
      da:  { hachimon: '生門' },
    });
    const scores = makeScores({
      kan: { score: 39 },  // 39 はNG
      da:  { score: 40 },  // 40 ジャストはOK
    });
    const r = detectJunri({ meta: makeMeta(), palaces }, scores);
    expect(r.junri_palaces).toEqual(['da']);
  });

  it('40点ジャストは順利成立（境界値）', () => {
    const palaces = makePalaces({
      kan: { tenban: '戊', hachimon: '休門' },
    });
    const scores = makeScores({ kan: { score: 40 } });
    const r = detectJunri({ meta: makeMeta(), palaces }, scores);
    expect(r.junri_palaces).toContain('kan');
  });

  it('対象宮テーブル外の宮は順利に入らない（坎起点で離は対象外）', () => {
    const palaces = makePalaces({
      kan: { tenban: '戊' },                   // 起点=kan, 対象=[kan, da, ken]
      ri:  { hachimon: '休門' },               // 離は対象外
    });
    const scores = makeScores({ ri: { score: 100 } });
    const r = detectJunri({ meta: makeMeta(), palaces }, scores);
    expect(r.junri_palaces).not.toContain('ri');
  });

  it('起点宮自身も対象に含まれる（坎→坎, 兌→兌 など）', () => {
    const palaces = makePalaces({
      da: { tenban: '戊', hachimon: '開門' },  // 起点=da, 対象=[da, ken, gon, kun]
    });
    const scores = makeScores({ da: { score: 60 } });
    const r = detectJunri({ meta: makeMeta(), palaces }, scores);
    expect(r.day_kan_palace).toBe('da');
    expect(r.junri_palaces).toContain('da');
  });

  it('日干が天盤に無く、旬首フォールバックで起点が決まるケース', () => {
    // dayKan=戊 は天盤に無い。junshu=壬 を ri.tenban に置けば、起点=ri、対象=[ri, shin, son]
    const palaces = makePalaces({
      kan: { tenban: '乙' },
      ri:  { tenban: '壬', hachimon: '休門' },   // 旬首干あり、吉門
      shin:{ hachimon: '生門' },
      son: { hachimon: '開門' },
    });
    const scores = makeScores({
      ri:  { score: 80 },
      shin:{ score: 50 },
      son: { score: 30 },   // 30は40未満なのでNG
    });
    const r = detectJunri({ meta: makeMeta({ junshu: '壬' }), palaces }, scores);
    expect(r.day_kan_palace).toBe('ri');
    expect(r.junri_palaces.sort()).toEqual(['ri', 'shin']);
  });

  it('起点が決まらなければ空を返す', () => {
    const palaces = makePalaces({ kan: { tenban: '乙' } });
    const scores = makeScores();
    const r = detectJunri({
      meta: makeMeta({ eto_day: '甲子', junshu: '辛' }),
      palaces,
    }, scores);
    expect(r).toEqual({ day_kan_palace: null, targets: [], junri_palaces: [] });
  });

  it('palaces / palaceScores が欠落しても安全に空を返す', () => {
    expect(detectJunri(null, makeScores())).toEqual({
      day_kan_palace: null, targets: [], junri_palaces: [],
    });
    expect(detectJunri({ meta: makeMeta(), palaces: makePalaces() }, null))
      .toEqual({ day_kan_palace: null, targets: [], junri_palaces: [] });
  });
});
