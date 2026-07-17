import { describe, expect, it } from 'vitest';
import { CENTER_INDICATOR_NEAR_BASE_METERS, describeCenterOffset } from './mapSearch.js';
import { planarOffsetPoint } from './mapFan.js';
import { getScoreTone } from './reverseDirection.js';

const BASE = [35.681, 139.767];

const PALACE_DEFS = [
  { palace: 'kan', label: '北', short: 'N', angle: 0 },
  { palace: 'gon', label: '北東', short: 'NE', angle: 45 },
  { palace: 'shin', label: '東', short: 'E', angle: 90 },
  { palace: 'son', label: '南東', short: 'SE', angle: 135 },
  { palace: 'ri', label: '南', short: 'S', angle: 180 },
  { palace: 'kun', label: '南西', short: 'SW', angle: 225 },
  { palace: 'da', label: '西', short: 'W', angle: 270 },
  { palace: 'ken', label: '北西', short: 'NW', angle: 315 },
];

function makeRankings(scoreByPalace = {}) {
  return PALACE_DEFS.map((def) => {
    const score = scoreByPalace[def.palace] ?? 0;
    return { ...def, score, tone: getScoreTone(score), reasons: [] };
  });
}

describe('describeCenterOffset（地図中心インジケータ用の純関数）', () => {
  it('地図中心の方位が変わればdirectionが追従する（北/東の判定）', () => {
    const rankings = makeRankings({ kan: 50, shin: 10 });

    const north = planarOffsetPoint(BASE, 0, 10000);
    const northResult = describeCenterOffset(BASE, north, rankings, {});
    expect(northResult.isNearBase).toBe(false);
    expect(northResult.direction.label).toBe('北');
    expect(northResult.direction.short).toBe('N');
    expect(northResult.direction.score).toBe(50);

    const east = planarOffsetPoint(BASE, 90, 10000);
    const eastResult = describeCenterOffset(BASE, east, rankings, {});
    expect(eastResult.direction.label).toBe('東');
    expect(eastResult.direction.short).toBe('E');
    expect(eastResult.direction.score).toBe(10);
  });

  it('distanceMeters相当の直線距離を返す', () => {
    const rankings = makeRankings({ kan: 50 });
    const north = planarOffsetPoint(BASE, 0, 24700);
    const result = describeCenterOffset(BASE, north, rankings, {});
    expect(result.distanceM).toBeGreaterThan(24000);
    expect(result.distanceM).toBeLessThan(25500);
  });

  it(`基準点から${CENTER_INDICATOR_NEAR_BASE_METERS}m未満ではisNearBase=trueになり、directionは算出しない`, () => {
    const rankings = makeRankings({ kan: 50 });
    const veryClose = planarOffsetPoint(BASE, 0, 10);
    const result = describeCenterOffset(BASE, veryClose, rankings, {});
    expect(result.isNearBase).toBe(true);
    expect(result.direction).toBe(null);
  });

  it(`基準点から${CENTER_INDICATOR_NEAR_BASE_METERS}m以上ではisNearBase=falseになる`, () => {
    const rankings = makeRankings({ kan: 50 });
    const justOutside = planarOffsetPoint(BASE, 0, CENTER_INDICATOR_NEAR_BASE_METERS + 10);
    const result = describeCenterOffset(BASE, justOutside, rankings, {});
    expect(result.isNearBase).toBe(false);
  });

  it('rankingsを差し替える（時盤/日盤相当）と同じ地点でも評価が追従する', () => {
    const timeRankings = makeRankings({ kan: 30 });
    const dayRankings = makeRankings({ kan: -20 });
    const north = planarOffsetPoint(BASE, 0, 5000);

    const timeResult = describeCenterOffset(BASE, north, timeRankings, {});
    const dayResult = describeCenterOffset(BASE, north, dayRankings, {});

    expect(timeResult.direction.score).toBe(30);
    expect(timeResult.direction.tone).toBe('good');
    expect(dayResult.direction.score).toBe(-20);
    expect(dayResult.direction.tone).toBe('bad-strong');
  });
});
