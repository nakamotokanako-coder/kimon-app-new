/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  ADAPTIVE_SPHERE_THRESHOLD_KM,
  DISTANCE_PROFILE,
  buildFanLayerSpecs,
  outerEdgeKm,
  resolveBearingMode,
  resolveFadeBands,
} from '../src/reverseDirection/mapFan.js';

describe('outerEdgeKm: 画面端までの外縁距離', () => {
  const tokyo = [35.68, 139.77];

  it('日本スケールの bounds → 数百km規模', () => {
    // 関東〜東海程度（±2°弱）の四隅
    const corners = [
      [37.0, 138.0],
      [37.0, 141.5],
      [34.0, 138.0],
      [34.0, 141.5],
    ];
    const km = outerEdgeKm(tokyo, corners);
    expect(km).toBeGreaterThan(150);
    expect(km).toBeLessThan(600);
  });

  it('世界スケールの bounds → 数千km規模', () => {
    const corners = [
      [70, 60],
      [70, 220],
      [-10, 60],
      [-10, 220],
    ];
    const km = outerEdgeKm(tokyo, corners);
    expect(km).toBeGreaterThan(3000);
  });

  it('余裕係数で素の最大距離より大きくなる', () => {
    const corners = [[36.68, 139.77]]; // ほぼ真北に約111km
    const withMargin = outerEdgeKm(tokyo, corners, 1.15);
    const noMargin = outerEdgeKm(tokyo, corners, 1);
    expect(withMargin).toBeGreaterThan(noMargin);
    expect(withMargin / noMargin).toBeCloseTo(1.15, 5);
  });

  it('不正入力は 0 を返す', () => {
    expect(outerEdgeKm(null, [[1, 2]])).toBe(0);
    expect(outerEdgeKm(tokyo, [])).toBe(0);
    expect(outerEdgeKm(tokyo, null)).toBe(0);
    expect(outerEdgeKm([NaN, NaN], [[1, 2]])).toBe(0);
  });
});

describe('resolveBearingMode: ユーザー選択 vs 自動球面', () => {
  it('閾値は 1500km', () => {
    expect(ADAPTIVE_SPHERE_THRESHOLD_KM).toBe(1500);
  });

  it('plane 選択：1499km→平面、1500km→球面（境界）', () => {
    expect(resolveBearingMode('plane', 1499)).toBe('plane');
    expect(resolveBearingMode('plane', 1500)).toBe('sphere');
    expect(resolveBearingMode('plane', 5000)).toBe('sphere');
  });

  it('sphere 選択は外縁に関係なく絶対に降格しない', () => {
    expect(resolveBearingMode('sphere', 10)).toBe('sphere');
    expect(resolveBearingMode('sphere', 1499)).toBe('sphere');
    expect(resolveBearingMode('sphere', 9999)).toBe('sphere');
  });

  it('外縁が不正値なら plane のまま（昇格しない）', () => {
    expect(resolveBearingMode('plane', null)).toBe('plane');
    expect(resolveBearingMode('plane', undefined)).toBe('plane');
    expect(resolveBearingMode('plane', NaN)).toBe('plane');
  });
});

describe('resolveFadeBands: 確定ゾーン固定＋外側を画面基準で伸縮', () => {
  const nichiban = DISTANCE_PROFILE.nichiban; // confirmKm 50

  it('outerKm 未指定なら従来の profile.fadeBands をそのまま返す', () => {
    expect(resolveFadeBands(nichiban, null)).toBe(nichiban.fadeBands);
    expect(resolveFadeBands(nichiban, 30)).toBe(nichiban.fadeBands); // confirmKm以下
  });

  it('有効な outerKm：確定ゾーン(0→50)は固定、外側は 50→outerKm に等分割', () => {
    const bands = resolveFadeBands(nichiban, 2050); // span = 2000, 外側3段 → 各 ~666.7km
    // 確定ゾーンは実距離のまま
    expect(bands[0].from).toBe(0);
    expect(bands[0].to).toBe(50);
    // 外側は 50 から始まり outerKm で終わる
    expect(bands[1].from).toBe(50);
    expect(bands.at(-1).to).toBeCloseTo(2050, 6);
    // 等分割（3段）
    expect(bands).toHaveLength(4);
    expect(bands[2].from).toBeCloseTo(50 + 2000 / 3, 6);
  });

  it('「外ほど濃い反転」パターン（op が外側ほど大きい）が保たれる', () => {
    const bands = resolveFadeBands(nichiban, 3000);
    const outer = bands.filter((b) => b.from >= nichiban.confirmKm);
    expect(outer[0].op).toBeLessThan(outer.at(-1).op);
    // 元の外側帯の op 並びをそのまま流用
    const originalOuterOps = nichiban.fadeBands.filter((b) => b.to > 50).map((b) => b.op);
    expect(outer.map((b) => b.op)).toEqual(originalOuterOps);
  });
});

describe('buildFanLayerSpecs: outerKm 連動と後方互換', () => {
  const rankings = [{ palace: 'kan', angle: 0, tone: 'great', score: 40 }];

  it('outerKm 未指定なら従来どおり（edge outer = fadeMaxKm）', () => {
    const specs = buildFanLayerSpecs(rankings, 'kan', {}, 'nichiban');
    const edge = specs.find((s) => s.type === 'edge');
    expect(edge.outer).toBe(DISTANCE_PROFILE.nichiban.fadeMaxKm * 1000); // 250km
    const fade = specs.filter((s) => s.type === 'fade');
    expect(fade[0].inner).toBe(0);
    expect(fade[0].outer).toBe(50000);
    expect(fade.at(-1).outer).toBe(250000);
  });

  it('outerKm 指定で扇の外縁が画面端まで伸び、確定ゾーンは50km固定', () => {
    const specs = buildFanLayerSpecs(rankings, 'kan', {}, 'nichiban', 2050);
    const edge = specs.find((s) => s.type === 'edge');
    expect(edge.outer).toBeCloseTo(2050 * 1000, 0);
    const fade = specs.filter((s) => s.type === 'fade');
    expect(fade[0].inner).toBe(0);
    expect(fade[0].outer).toBe(50000); // 確定ゾーン固定
    expect(fade.at(-1).outer).toBeCloseTo(2050 * 1000, 0); // 外縁まで伸びる
  });

  it('色（tone→fillColor）は距離を変えても不変', () => {
    const near = buildFanLayerSpecs(rankings, 'kan', {}, 'nichiban');
    const far = buildFanLayerSpecs(rankings, 'kan', {}, 'nichiban', 3000);
    const nearColor = near.find((s) => s.type === 'fade').options.fillColor;
    const farColor = far.find((s) => s.type === 'fade').options.fillColor;
    expect(farColor).toBe(nearColor);
  });
});
