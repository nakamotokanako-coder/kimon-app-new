import { describe, expect, it } from 'vitest';
import {
  buildFanLayerSpecs,
  destPoint,
  sectorPolygon,
} from '../src/reverseDirection/mapFan.js';

const center = [35, 139];

describe('map fan geometry', () => {
  it('moves coordinates in expected cardinal directions', () => {
    expect(destPoint(center, 0, 100)[0]).toBeGreaterThan(center[0]);
    expect(destPoint(center, 90, 100)[1]).toBeGreaterThan(center[1]);
    expect(destPoint(center, 180, 100)[0]).toBeLessThan(center[0]);
    expect(destPoint(center, 270, 100)[1]).toBeLessThan(center[1]);
  });

  it('builds a center-origin sector when inner radius is zero', () => {
    const points = sectorPolygon(center, -22.5, 22.5, 500, 0, 4);
    expect(points).toHaveLength(6);
    expect(points.at(-1)).toBe(center);
  });

  it('builds a ring sector when inner radius is present', () => {
    const points = sectorPolygon(center, -22.5, 22.5, 1000, 500, 4);
    expect(points).toHaveLength(10);
    expect(points.at(-1)).not.toBe(center);
  });

  it('creates solid and fade layers for good and bad directions, solid only for neutral', () => {
    const rankings = [
      { palace: 'kan', angle: 0, tone: 'great', score: 40 },
      { palace: 'shin', angle: 90, tone: 'bad', score: -10 },
      { palace: 'ken', angle: 315, tone: 'neutral', score: 0 },
    ];
    const specs = buildFanLayerSpecs(rankings, 'kan');
    expect(specs.filter((spec) => spec.item.palace === 'kan')).toHaveLength(5);
    expect(specs.filter((spec) => spec.item.palace === 'shin')).toHaveLength(5);
    expect(specs.filter((spec) => spec.item.palace === 'ken')).toHaveLength(1);
    expect(specs.find((spec) => spec.item.palace === 'kan' && spec.type === 'solid').options.color).toBe('#e6c34a');
  });
});
