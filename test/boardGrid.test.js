import { describe, expect, it } from 'vitest';
import { getZodiacLabelClass } from '../src/components/BoardGrid.jsx';

describe('BoardGrid 外周十二支の空亡表示', () => {
  it('空亡=辰巳なら外周の辰・巳に赤表示用クラスが付く', () => {
    expect(getZodiacLabelClass('辰', '辰巳')).toBe('zodiac-label is-kuubou');
    expect(getZodiacLabelClass('巳', '辰巳')).toBe('zodiac-label is-kuubou');
  });

  it('空亡ではない十二支には赤表示用クラスが付かない', () => {
    expect(getZodiacLabelClass('午', '辰巳')).toBe('zodiac-label');
  });
});
