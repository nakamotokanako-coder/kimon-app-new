import { describe, it, expect } from 'vitest';
import { calcTimeKanshi, JIAZI_60 } from '../src/kimon/timeKanshi.js';

const SHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

const EXPECTED = {
  甲: ['甲子', '乙丑', '丙寅', '丁卯', '戊辰', '己巳', '庚午', '辛未', '壬申', '癸酉', '甲戌', '乙亥'],
  乙: ['丙子', '丁丑', '戊寅', '己卯', '庚辰', '辛巳', '壬午', '癸未', '甲申', '乙酉', '丙戌', '丁亥'],
  丙: ['戊子', '己丑', '庚寅', '辛卯', '壬辰', '癸巳', '甲午', '乙未', '丙申', '丁酉', '戊戌', '己亥'],
  丁: ['庚子', '辛丑', '壬寅', '癸卯', '甲辰', '乙巳', '丙午', '丁未', '戊申', '己酉', '庚戌', '辛亥'],
  戊: ['壬子', '癸丑', '甲寅', '乙卯', '丙辰', '丁巳', '戊午', '己未', '庚申', '辛酉', '壬戌', '癸亥'],
};

describe('JIAZI_60', () => {
  it('60干支が正しく生成される', () => {
    expect(JIAZI_60).toHaveLength(60);
    expect(JIAZI_60[0]).toBe('甲子');
    expect(JIAZI_60[12]).toBe('丙子');
    expect(JIAZI_60[24]).toBe('戊子');
    expect(JIAZI_60[36]).toBe('庚子');
    expect(JIAZI_60[48]).toBe('壬子');
    expect(JIAZI_60[59]).toBe('癸亥');
  });
});

describe('calcTimeKanshi: 5日干代表 × 12刻 = 60ケース', () => {
  for (const [dayKan, expectedRow] of Object.entries(EXPECTED)) {
    for (let hourIdx = 0; hourIdx < 12; hourIdx++) {
      const hour = hourIdx * 2;
      const expected = expectedRow[hourIdx];
      it(`日干=${dayKan} ${hour}時(${SHI[hourIdx]}刻) → ${expected}`, () => {
        expect(calcTimeKanshi(dayKan, hour)).toBe(expected);
      });
    }
  }
});

describe('五鼠遁ペアは同じ結果を返す', () => {
  const PAIRS = [['甲', '己'], ['乙', '庚'], ['丙', '辛'], ['丁', '壬'], ['戊', '癸']];
  for (const [a, b] of PAIRS) {
    it(`${a} と ${b} は全12刻で一致`, () => {
      for (let hour = 0; hour < 24; hour += 2) {
        expect(calcTimeKanshi(a, hour)).toBe(calcTimeKanshi(b, hour));
      }
    });
  }
});

describe('時刻→刻インデックス（奇数時/偶数時で同じ刻）', () => {
  it('0時と1時はどちらも子刻', () => {
    expect(calcTimeKanshi('戊', 0)).toBe('壬子');
    expect(calcTimeKanshi('戊', 1)).toBe('壬子');
  });
  it('22時と23時はどちらも亥刻', () => {
    expect(calcTimeKanshi('戊', 22)).toBe('癸亥');
    expect(calcTimeKanshi('戊', 23)).toBe('癸亥');
  });
});

describe('検証ケース（仕様書記載）', () => {
  it('日干=戊 0時 → 壬子 (2025-12-05 ケース)', () => {
    expect(calcTimeKanshi('戊', 0)).toBe('壬子');
  });
  it('日干=癸 0時 → 壬子 (2026-05-09 ケース)', () => {
    expect(calcTimeKanshi('癸', 0)).toBe('壬子');
  });
});
