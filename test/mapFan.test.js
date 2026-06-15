/* @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import {
  approximateWestDeclination,
  bearingFor,
  buildFanLayerSpecs,
  BEARING_STORAGE_KEY,
  DEFAULT_BEARING_SETTINGS,
  DISTANCE_PROFILE,
  destPoint,
  liveLineColor,
  readBearingSettings,
  sanitizeBearingSettings,
  sectorPolygon,
  writeBearingSettings,
} from '../src/reverseDirection/mapFan.js';

const center = [35, 139];

describe('map fan geometry', () => {
  it('returns fixed 45 degree steps in plane mode', () => {
    expect(bearingFor(0, { mode: 'plane', declination: false })).toBe(0);
    expect(bearingFor(1, { mode: 'plane', declination: false })).toBe(45);
    expect(bearingFor(7, { mode: 'plane', declination: false })).toBe(315);
  });

  it('keeps sphere mode close to plane mode nearby and different at long distance', () => {
    const near = bearingFor(1, {
      mode: 'sphere',
      declination: false,
      center,
      distanceM: 100,
    });
    const far = bearingFor(1, {
      mode: 'sphere',
      declination: false,
      center,
      distanceM: 1000000,
    });
    expect(Math.abs(near - 45)).toBeLessThan(0.01);
    expect(Math.abs(far - 45)).toBeGreaterThan(0.1);
  });

  it('rotates every direction by the same west declination amount', () => {
    const declination = approximateWestDeclination(center);
    const north = bearingFor(0, { mode: 'plane', declination: true, center });
    const east = bearingFor(2, { mode: 'plane', declination: true, center });
    expect(declination).toBeGreaterThanOrEqual(5);
    expect(declination).toBeLessThanOrEqual(9);
    expect(north).toBeCloseTo(360 - declination, 6);
    expect(east).toBeCloseTo(90 - declination, 6);
  });

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
    expect(specs.filter((spec) => spec.item.palace === 'kan' && spec.type === 'fade')).toHaveLength(5);
    expect(specs.filter((spec) => spec.item.palace === 'shin' && spec.type === 'fade')).toHaveLength(5);
    expect(specs.filter((spec) => spec.item.palace === 'ken' && spec.type === 'neutral')).toHaveLength(1);
    expect(specs.find((spec) => spec.item.palace === 'kan' && spec.type === 'edge').options.color).toBe('#e6c34a');
  });

  it('applies bearing options when building fan layer specs', () => {
    const rankings = [
      { palace: 'kan', angle: 0, tone: 'great', score: 40 },
      { palace: 'shin', angle: 90, tone: 'bad', score: -10 },
    ];
    const specs = buildFanLayerSpecs(rankings, 'kan', { mode: 'plane', declination: true, center });
    const declination = approximateWestDeclination(center);
    expect(specs.find((spec) => spec.item.palace === 'kan' && spec.type === 'edge').angle)
      .toBeCloseTo(360 - declination, 6);
    expect(specs.find((spec) => spec.item.palace === 'shin' && spec.type === 'edge').angle)
      .toBeCloseTo(90 - declination, 6);
  });

  it('uses the day-board distance profile for reversed long-distance fade', () => {
    const rankings = [
      { palace: 'kan', angle: 0, tone: 'great', score: 40 },
    ];
    const specs = buildFanLayerSpecs(rankings, 'kan', {}, 'nichiban');
    const fade = specs.filter((spec) => spec.type === 'fade');
    expect(DISTANCE_PROFILE.nichiban.confirmKm).toBe(50);
    expect(DISTANCE_PROFILE.nichiban.fadeBands[0].op).toBeLessThan(DISTANCE_PROFILE.nichiban.fadeBands.at(-1).op);
    expect(fade[0].inner).toBe(0);
    expect(fade[0].outer).toBe(50000);
    expect(fade.at(-1).outer).toBe(250000);
  });

  it('colors the live location line by best palace and positive tone', () => {
    expect(liveLineColor(null, 'kan')).toBe('#8a8a8a');
    expect(liveLineColor({ palace: 'kan', tone: 'bad' }, 'kan')).toBe('#2e9e5b');
    expect(liveLineColor({ palace: 'shin', tone: 'weak' }, 'kan')).toBe('#2e9e5b');
    expect(liveLineColor({ palace: 'shin', tone: 'neutral' }, 'kan')).toBe('#8a8a8a');
    expect(liveLineColor({ palace: 'shin', tone: 'bad' }, 'kan')).toBe('#8a8a8a');
  });
});

describe('bearing settings persistence', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('sanitizes valid settings unchanged', () => {
    expect(sanitizeBearingSettings({ mode: 'sphere', declination: true }))
      .toEqual({ mode: 'sphere', declination: true });
    expect(sanitizeBearingSettings({ mode: 'plane', declination: false }))
      .toEqual({ mode: 'plane', declination: false });
  });

  it('falls back to defaults for invalid or partial input', () => {
    expect(sanitizeBearingSettings({ mode: 'bogus', declination: true }))
      .toEqual({ mode: DEFAULT_BEARING_SETTINGS.mode, declination: true });
    expect(sanitizeBearingSettings({ mode: 'sphere', declination: 'yes' }))
      .toEqual({ mode: 'sphere', declination: DEFAULT_BEARING_SETTINGS.declination });
    expect(sanitizeBearingSettings({ mode: 'sphere' }))
      .toEqual({ mode: 'sphere', declination: DEFAULT_BEARING_SETTINGS.declination });
    expect(sanitizeBearingSettings({})).toEqual(DEFAULT_BEARING_SETTINGS);
  });

  it('returns defaults for non-object / nullish input', () => {
    expect(sanitizeBearingSettings(null)).toEqual(DEFAULT_BEARING_SETTINGS);
    expect(sanitizeBearingSettings(undefined)).toEqual(DEFAULT_BEARING_SETTINGS);
    expect(sanitizeBearingSettings('plane')).toEqual(DEFAULT_BEARING_SETTINGS);
    expect(sanitizeBearingSettings(42)).toEqual(DEFAULT_BEARING_SETTINGS);
  });

  it('reads defaults when nothing is stored', () => {
    expect(readBearingSettings()).toEqual(DEFAULT_BEARING_SETTINGS);
  });

  it('reads defaults when the stored value is corrupt JSON', () => {
    window.localStorage.setItem(BEARING_STORAGE_KEY, '{not json');
    expect(readBearingSettings()).toEqual(DEFAULT_BEARING_SETTINGS);
  });

  it('round-trips a written setting and sanitizes on write', () => {
    writeBearingSettings({ mode: 'sphere', declination: true });
    expect(readBearingSettings()).toEqual({ mode: 'sphere', declination: true });

    // 不正値で書いても保存はサニタイズ済み（デフォルト補完）になる
    writeBearingSettings({ mode: 'bogus', declination: 'nope' });
    expect(readBearingSettings()).toEqual(DEFAULT_BEARING_SETTINGS);
  });
});
