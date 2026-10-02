import { describe, it, expect } from 'vitest';
import { applyVetoCap, getPalaceVetoes, isKuubouRelieved, VETO_KYO_SCORE_CAP } from '../src/kimon/palaceVeto.js';
import { buildReverseBoard } from '../src/reverseDirection/reverseDirection.js';
import { getMiniBoardToneClass } from '../src/reverseDirection/reverseDirection.js';

describe('applyVetoCap', () => {
  it('拒否権なしは点数そのまま', () => {
    expect(applyVetoCap(70, [])).toBe(70);
  });
  it('空亡のみ（吉門なし）は中立(0)止まり・凶はそのまま', () => {
    expect(applyVetoCap(70, ['空亡'])).toBe(0);
    expect(applyVetoCap(70, ['空亡'], '景門')).toBe(0);
    expect(applyVetoCap(-30, ['空亡'])).toBe(-30);
  });
  it('空亡のみでも開・休・生門なら上限なし', () => {
    for (const gate of ['開門', '休門', '生門']) {
      expect(applyVetoCap(70, ['空亡'], gate)).toBe(70);
      expect(isKuubouRelieved(['空亡'], gate)).toBe(true);
    }
  });
  it('入墓などが重なれば吉門でも凶の上限', () => {
    expect(applyVetoCap(70, ['空亡', '三奇入墓'], '休門')).toBe(VETO_KYO_SCORE_CAP);
    expect(isKuubouRelieved(['空亡', '三奇入墓'], '休門')).toBe(false);
  });
  it('三奇入墓などを含むと凶の上限', () => {
    expect(applyVetoCap(70, ['空亡', '三奇入墓'])).toBe(VETO_KYO_SCORE_CAP);
    expect(applyVetoCap(70, ['六儀撃刑'])).toBe(VETO_KYO_SCORE_CAP);
    expect(applyVetoCap(-50, ['六儀撃刑'])).toBe(-50);
  });
});

describe('getPalaceVetoes', () => {
  it('不正キーは []', () => {
    expect(getPalaceVetoes('存在しない', 'ken')).toEqual([]);
    expect(getPalaceVetoes(null, 'ken')).toEqual([]);
  });
  it('陰6局壬申の乾は空亡＋三奇入墓（丙奇入墓）', () => {
    expect(getPalaceVetoes('陰6局壬申', 'ken')).toEqual(['空亡', '三奇入墓']);
  });
});

// 回帰: 2026-10-02 15-17時、北西が「+70・大吉」なのに願い5軸がすべて×だった。
describe('時盤お散歩: 拒否権の宮は大吉にならない', () => {
  it('2026-10-02 16時の北西(乾)は凶扱いで、最大吉に選ばれない', () => {
    const { rankings } = buildReverseBoard({ date: '2026-10-02', hour: 16 });
    const ken = rankings.find((r) => r.palace === 'ken');
    expect(ken.vetoes).toEqual(['空亡', '三奇入墓']);
    expect(ken.score).toBeLessThanOrEqual(VETO_KYO_SCORE_CAP);
    expect(getMiniBoardToneClass(ken.score)).toBe('kyo');
    expect(ken.reasons[0]).toBe('空亡');
    expect(rankings[0].palace).not.toBe('ken');
    expect(rankings[0].vetoes).toEqual([]);
  });
});
