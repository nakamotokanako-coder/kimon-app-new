import { describe, expect, it } from 'vitest';
import { getClosing, getOmamori } from '../src/kimon/luckyOmamori.js';

describe('getOmamori', () => {
  it('returns the same message for the same palace and seed', () => {
    const first = getOmamori('ri', '2026-06-02');
    const second = getOmamori('ri', '2026-06-02');
    expect(first).toBe(second);
    expect(typeof first).toBe('string');
  });

  it('can change the message when the time slot changes', () => {
    const messages = new Set();
    for (let slot = 0; slot < 12; slot += 1) {
      messages.add(getOmamori('ri', `2026-06-02#${slot}`));
    }
    expect(messages.size).toBeGreaterThan(1);
  });

  it('does not reveal direction, kyusei, or gogyo words', () => {
    const banned = [
      '北', '南', '東', '西',
      '一白', '二黒', '三碧', '四緑', '五黄', '六白', '七赤', '八白', '九紫',
      '水星', '木星', '火星', '金星', '土星',
      '坎', '艮', '震', '巽', '離', '坤', '兌', '乾', '中宮',
    ];
    for (const palace of ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken']) {
      for (let slot = 0; slot < 24; slot += 1) {
        const message = getOmamori(palace, `2026-06-02#${slot}`);
        for (const word of banned) expect(message.includes(word)).toBe(false);
      }
    }
  });

  it('returns null for the center palace and invalid palace keys', () => {
    expect(getOmamori('chuguu', '2026-06-02')).toBeNull();
    expect(getOmamori('xxx', '2026-06-02')).toBeNull();
    expect(getOmamori(undefined, '2026-06-02')).toBeNull();
  });
});

describe('getClosing', () => {
  it('returns the same message for the same seed', () => {
    expect(getClosing('2026-06-02')).toBe(getClosing('2026-06-02'));
    expect(typeof getClosing('2026-06-02')).toBe('string');
  });

  it('can change the message when the time slot changes', () => {
    const messages = new Set();
    for (let slot = 0; slot < 12; slot += 1) {
      messages.add(getClosing(`2026-06-02#${slot}`));
    }
    expect(messages.size).toBeGreaterThan(1);
  });

  it('returns strings independently from the omamori pool', () => {
    expect(typeof getOmamori('ri', '2026-06-02')).toBe('string');
    expect(typeof getClosing('2026-06-02')).toBe('string');
  });
});
