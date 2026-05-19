// test/jukkanKokuou.test.js
import { describe, it, expect } from 'vitest';
import {
  lookupJukkanKokuou,
  lookupJukkanKokuouMulti,
  splitCompoundKan,
  kikkyoToScore,
  scoreJukkanKokuou,
  jukkanData,
} from '../src/kimon/jukkanKokuou.js';

const ALL_KAN = ['乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

describe('jukkanKokuou: データ完全性', () => {
  it('天盤干9種すべてが table に存在する', () => {
    for (const t of ALL_KAN) {
      expect(jukkanData.table[t]).toBeDefined();
    }
  });

  it('全81通り（9×9）のエントリが揃っている', () => {
    let count = 0;
    for (const t of ALL_KAN) {
      for (const c of ALL_KAN) {
        expect(jukkanData.table[t]?.[c]).toBeDefined();
        expect(jukkanData.table[t][c].kikkyo).toMatch(/^[〇△×]$/);
        expect(jukkanData.table[t][c].name).toBeTruthy();
        count++;
      }
    }
    expect(count).toBe(81);
  });
});

describe('lookupJukkanKokuou: 単一lookup', () => {
  it('乙丙 → 〇奇儀順遂', () => {
    const r = lookupJukkanKokuou('乙', '丙');
    expect(r.kikkyo).toBe('〇');
    expect(r.name).toBe('奇儀順遂');
  });

  it('丙戊 → 〇飛鳥跌穴（先生流派で人気）', () => {
    const r = lookupJukkanKokuou('丙', '戊');
    expect(r.kikkyo).toBe('〇');
    expect(r.name).toBe('飛鳥跌穴');
  });

  it('戊丙 → 〇青龍返首', () => {
    const r = lookupJukkanKokuou('戊', '丙');
    expect(r.kikkyo).toBe('〇');
    expect(r.name).toBe('青龍返首');
  });

  it('辛乙 → ×白虎猖狂', () => {
    const r = lookupJukkanKokuou('辛', '乙');
    expect(r.kikkyo).toBe('×');
    expect(r.name).toBe('白虎猖狂');
  });

  it('乙辛 → ×青龍逃走', () => {
    const r = lookupJukkanKokuou('乙', '辛');
    expect(r.kikkyo).toBe('×');
    expect(r.name).toBe('青龍逃走');
  });

  it('庚庚 → ×太白同宮（庚の三大凶格の一つ）', () => {
    const r = lookupJukkanKokuou('庚', '庚');
    expect(r.kikkyo).toBe('×');
    expect(r.name).toBe('太白同宮');
  });

  it('戊戊 → ×伏吟', () => {
    const r = lookupJukkanKokuou('戊', '戊');
    expect(r.kikkyo).toBe('×');
    expect(r.name).toBe('伏吟');
  });
});

describe('lookupJukkanKokuou: エラー処理', () => {
  it('甲（旬首扱いのため除外）は null を返す', () => {
    expect(lookupJukkanKokuou('甲', '丙')).toBeNull();
    expect(lookupJukkanKokuou('丙', '甲')).toBeNull();
  });

  it('空文字・null・undefined は null を返す', () => {
    expect(lookupJukkanKokuou('', '丙')).toBeNull();
    expect(lookupJukkanKokuou('丙', '')).toBeNull();
    expect(lookupJukkanKokuou(null, '丙')).toBeNull();
    expect(lookupJukkanKokuou(undefined, undefined)).toBeNull();
  });

  it('不正な文字は null を返す', () => {
    expect(lookupJukkanKokuou('A', '丙')).toBeNull();
    expect(lookupJukkanKokuou('丙', 'X')).toBeNull();
  });

  it('複合表記をそのまま渡すと null（単一lookupは1文字のみ）', () => {
    expect(lookupJukkanKokuou('戊丁', '丙')).toBeNull();
  });
});

describe('splitCompoundKan: 複合表記の分解', () => {
  it('単一干はそのまま1要素配列に', () => {
    expect(splitCompoundKan('戊')).toEqual(['戊']);
  });

  it('複合表記を2要素配列に分解', () => {
    expect(splitCompoundKan('戊丁')).toEqual(['戊', '丁']);
    expect(splitCompoundKan('丙己')).toEqual(['丙', '己']);
    expect(splitCompoundKan('癸庚')).toEqual(['癸', '庚']);
    expect(splitCompoundKan('乙癸')).toEqual(['乙', '癸']);
  });

  it('空文字・null は空配列', () => {
    expect(splitCompoundKan('')).toEqual([]);
    expect(splitCompoundKan(null)).toEqual([]);
  });

  it('甲は通す（旬首として）', () => {
    expect(splitCompoundKan('甲')).toEqual(['甲']);
  });
});

describe('lookupJukkanKokuouMulti: 複合表記対応lookup', () => {
  it('単一×単一は1件返す', () => {
    const results = lookupJukkanKokuouMulti('乙', '丙');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('奇儀順遂');
  });

  it('複合×単一は複数件返す', () => {
    const results = lookupJukkanKokuouMulti('戊丁', '丙');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.name)).toEqual(
      expect.arrayContaining(['青龍返首', '星髄月転'])
    );
  });

  it('複合×複合は最大4件返す', () => {
    const results = lookupJukkanKokuouMulti('戊丁', '乙丙');
    expect(results).toHaveLength(4);
  });

  it('甲を含む組み合わせは甲分が除外される', () => {
    const results = lookupJukkanKokuouMulti('甲', '丙');
    expect(results).toHaveLength(0);
  });
});

describe('kikkyoToScore: 点数変換', () => {
  it('〇は+10', () => expect(kikkyoToScore('〇')).toBe(10));
  it('△は0', () => expect(kikkyoToScore('△')).toBe(0));
  it('×は-10', () => expect(kikkyoToScore('×')).toBe(-10));
  it('不明値は0', () => expect(kikkyoToScore('?')).toBe(0));
});

describe('scoreJukkanKokuou: 1宮分のスコア', () => {
  it('乙丙(〇)は+10', () => {
    expect(scoreJukkanKokuou('乙', '丙')).toBe(10);
  });

  it('庚庚(×)は-10', () => {
    expect(scoreJukkanKokuou('庚', '庚')).toBe(-10);
  });

  it('乙乙(△)は0', () => {
    expect(scoreJukkanKokuou('乙', '乙')).toBe(0);
  });

  it('該当なしは0', () => {
    expect(scoreJukkanKokuou('甲', '甲')).toBe(0);
  });

  it('複合表記は平均スコア（戊丁×丙 = (10+10)/2 = 10）', () => {
    // 戊丙=青龍返首〇(+10), 丁丙=星髄月転△(0)
    // 平均 = (10 + 0) / 2 = 5
    expect(scoreJukkanKokuou('戊丁', '丙')).toBe(5);
  });
});
