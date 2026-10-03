import { describe, expect, it } from 'vitest';
import { neighborPalace, PALACE_CLOCKWISE } from '../src/components/BoardGrid.jsx';

describe('盤のシートの「前の方位／次の方位」', () => {
  it('北から時計回りに8方位を一巡する', () => {
    const seen = [];
    let key = 'kan';
    for (let i = 0; i < 8; i += 1) {
      const next = neighborPalace(key, 1);
      seen.push(next.direction);
      key = next.key;
    }
    expect(seen).toEqual(['北東', '東', '南東', '南', '南西', '西', '北西', '北']);
    expect(PALACE_CLOCKWISE).toHaveLength(8);
  });

  it('北の前は北西（端でつながる）', () => {
    expect(neighborPalace('kan', -1)).toMatchObject({ key: 'ken', direction: '北西' });
  });

  it('選択なしのときは null', () => {
    expect(neighborPalace(null, 1)).toBe(null);
  });
});
