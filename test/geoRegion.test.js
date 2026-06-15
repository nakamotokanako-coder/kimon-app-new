import { describe, expect, it } from 'vitest';
import {
  JAPAN_BOUNDS,
  isInJapan,
  isOverseas,
} from '../src/reverseDirection/geoRegion.js';

describe('geoRegion: 国内/海外判定', () => {
  it('国内の主要地点は国内(false)と判定する', () => {
    expect(isOverseas([35.6812, 139.7671])).toBe(false); // 東京
    expect(isOverseas([26.2124, 127.6809])).toBe(false); // 那覇
    expect(isOverseas([43.0618, 141.3545])).toBe(false); // 札幌
    expect(isInJapan([35.6812, 139.7671])).toBe(true);
  });

  it('海外の主要地点は海外(true)と判定する', () => {
    expect(isOverseas([40.71, -74.0])).toBe(true); // NYC
    expect(isOverseas([51.51, -0.13])).toBe(true); // ロンドン
    expect(isOverseas([-33.87, 151.21])).toBe(true); // シドニー（南半球・経度は日本帯だが緯度で海外）
    expect(isInJapan([40.71, -74.0])).toBe(false);
  });

  it('バウンディングボックス境界の最小ケース', () => {
    // 角・辺ちょうどは国内（境界含む）
    expect(isInJapan([JAPAN_BOUNDS.minLat, JAPAN_BOUNDS.minLng])).toBe(true);
    expect(isInJapan([JAPAN_BOUNDS.maxLat, JAPAN_BOUNDS.maxLng])).toBe(true);
    // 境界をわずかに外れたら海外
    expect(isOverseas([JAPAN_BOUNDS.minLat - 0.01, 135])).toBe(true);
    expect(isOverseas([JAPAN_BOUNDS.maxLat + 0.01, 135])).toBe(true);
    expect(isOverseas([35, JAPAN_BOUNDS.minLng - 0.01])).toBe(true);
    expect(isOverseas([35, JAPAN_BOUNDS.maxLng + 0.01])).toBe(true);
  });

  it('不正値は海外と断定せず false（国内タイルのまま）', () => {
    expect(isOverseas(null)).toBe(false);
    expect(isOverseas(undefined)).toBe(false);
    expect(isOverseas([])).toBe(false);
    expect(isOverseas([NaN, NaN])).toBe(false);
    expect(isOverseas(['a', 'b'])).toBe(false);
    expect(isInJapan(null)).toBe(false);
    expect(isInJapan([NaN, 139])).toBe(false);
  });
});
