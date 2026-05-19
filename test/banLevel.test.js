import { describe, it, expect } from 'vitest';
import { detectGofuguuji } from '../src/kimon/banLevel.js';

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
