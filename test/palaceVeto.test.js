import { describe, it, expect } from 'vitest';
import { applyVetoCap, getPalaceVetoes, getPalaceVetoInfo, VETO_KYO_SCORE_CAP } from '../src/kimon/palaceVeto.js';
import { buildReverseBoard } from '../src/reverseDirection/reverseDirection.js';
import { getMiniBoardToneClass } from '../src/reverseDirection/reverseDirection.js';

describe('applyVetoCap', () => {
  it('拒否権なしは点数そのまま', () => {
    expect(applyVetoCap(70, [])).toBe(70);
  });
  it('空亡のみ・救済なしは中立(0)止まり・凶はそのまま', () => {
    expect(applyVetoCap(70, ['空亡'])).toBe(0);
    expect(applyVetoCap(-30, ['空亡'])).toBe(-30);
  });
  it('空亡のみ・救済ありは上限なし', () => {
    expect(applyVetoCap(70, ['空亡'], true)).toBe(70);
  });
  it('入墓などが重なれば救済フラグがあっても凶の上限', () => {
    expect(applyVetoCap(70, ['空亡', '三奇入墓'], true)).toBe(VETO_KYO_SCORE_CAP);
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
  it('空亡＋生門は救済（陰1局丁卯・乾）', () => {
    expect(getPalaceVetoInfo('陰1局丁卯', 'ken')).toEqual({ vetoes: ['空亡'], kuubouRelief: true });
  });
  it('盤全体が伏吟の日は空亡＋生門でも救済しない（陰7局甲辰・艮）', () => {
    expect(getPalaceVetoInfo('陰7局甲辰', 'gon')).toEqual({ vetoes: ['空亡'], kuubouRelief: false });
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
