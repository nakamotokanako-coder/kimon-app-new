export const MAP_FAN = {
  radiusM: 500,
  sectorDeg: 45,
  zoom: 13,
  defaultBearingMode: 'plane',
  defaultDeclination: false,
  sphereReferenceM: 1000000,
  fadeBands: [
    { inner: 500, outer: 1000, opacity: 0.30 },
    { inner: 1000, outer: 2500, opacity: 0.20 },
    { inner: 2500, outer: 5000, opacity: 0.12 },
    { inner: 5000, outer: 10000, opacity: 0.07 },
  ],
};

export const MAP_FAN_COLORS = {
  great: '#185FA5',
  good: '#378ADD',
  weak: '#85B7EB',
  neutral: '#6f6c5e',
  bad: '#c2554f',
  'bad-strong': '#a3302a',
  best: '#e6c34a',
};

export function normalizeBearing(deg) {
  return ((deg % 360) + 360) % 360;
}

export function destPoint(center, deg, meters) {
  const earthRadius = 6378137;
  const bearing = deg * Math.PI / 180;
  const lat1 = center[0] * Math.PI / 180;
  const lon1 = center[1] * Math.PI / 180;
  const distanceRatio = meters / earthRadius;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceRatio)
    + Math.cos(lat1) * Math.sin(distanceRatio) * Math.cos(bearing),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(distanceRatio) * Math.cos(lat1),
    Math.cos(distanceRatio) - Math.sin(lat1) * Math.sin(lat2),
  );
  return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

export function initialBearing(from, to) {
  const lat1 = from[0] * Math.PI / 180;
  const lat2 = to[0] * Math.PI / 180;
  const deltaLon = (to[1] - from[1]) * Math.PI / 180;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return normalizeBearing(Math.atan2(y, x) * 180 / Math.PI);
}

export function planarOffsetPoint(center, deg, meters) {
  const rad = deg * Math.PI / 180;
  const northM = Math.cos(rad) * meters;
  const eastM = Math.sin(rad) * meters;
  const lat = center[0] + northM / 111320;
  const lon = center[1] + eastM / (111320 * Math.cos(center[0] * Math.PI / 180));
  return [lat, lon];
}

export function approximateWestDeclination(center) {
  const lat = Number.isFinite(center?.[0]) ? center[0] : 35;
  const lon = Number.isFinite(center?.[1]) ? center[1] : 135;
  const value = 7 + (lat - 35) * 0.08 - (lon - 135) * 0.12;
  return Math.min(9, Math.max(5, value));
}

export function bearingFor(dirIndex, options = {}) {
  const {
    mode = MAP_FAN.defaultBearingMode,
    declination = MAP_FAN.defaultDeclination,
    center = [35, 135],
    distanceM = MAP_FAN.sphereReferenceM,
  } = options;
  const base = dirIndex * MAP_FAN.sectorDeg;
  const bearing = mode === 'sphere'
    ? initialBearing(center, planarOffsetPoint(center, base, distanceM))
    : base;
  const adjusted = declination ? bearing - approximateWestDeclination(center) : bearing;
  return normalizeBearing(adjusted);
}

export function sectorPolygon(center, fromDeg, toDeg, outerM, innerM = 0, steps = 18) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const deg = fromDeg + ((toDeg - fromDeg) * i / steps);
    points.push(destPoint(center, deg, outerM));
  }
  if (innerM > 0) {
    for (let i = steps; i >= 0; i -= 1) {
      const deg = fromDeg + ((toDeg - fromDeg) * i / steps);
      points.push(destPoint(center, deg, innerM));
    }
  } else {
    points.push(center);
  }
  return points;
}

export function getFanColor(tone) {
  return MAP_FAN_COLORS[tone] || MAP_FAN_COLORS.neutral;
}

export function isPositiveTone(tone) {
  return tone === 'great' || tone === 'good' || tone === 'weak';
}

export function isNegativeTone(tone) {
  return tone === 'bad' || tone === 'bad-strong';
}

export function directionIndexFor(item) {
  if (Number.isFinite(item?.angle)) return Math.round(item.angle / MAP_FAN.sectorDeg) % 8;
  return 0;
}

export function buildFanLayerSpecs(rankings, bestPalace, bearingOptions = {}) {
  const specs = [];
  for (const item of rankings || []) {
    const color = getFanColor(item.tone);
    const isBest = item.palace === bestPalace;
    const isGood = isPositiveTone(item.tone);
    const isBad = isNegativeTone(item.tone);
    const angle = bearingFor(directionIndexFor(item), bearingOptions);
    const from = angle - MAP_FAN.sectorDeg / 2;
    const to = angle + MAP_FAN.sectorDeg / 2;

    specs.push({
      item,
      type: 'solid',
      angle,
      from,
      to,
      inner: 0,
      outer: MAP_FAN.radiusM,
      color,
      options: {
        color: isBest ? MAP_FAN_COLORS.best : color,
        weight: isBest ? 3 : (isGood || isBad ? 1.5 : 1),
        opacity: isBest ? 0.95 : (isGood || isBad ? 0.7 : 0.4),
        fillColor: color,
        fillOpacity: isBest ? 0.45 : (isGood ? 0.32 : (isBad ? 0.30 : 0.14)),
        dashArray: isBest || isGood || isBad ? null : '4 3',
      },
    });

    if (isGood || isBad) {
      const base = isBad ? 0.75 : 1;
      for (const band of MAP_FAN.fadeBands) {
        specs.push({
          item,
          type: 'fade',
          angle,
          from,
          to,
          inner: band.inner,
          outer: band.outer,
          color,
          options: {
            color,
            weight: 0.7,
            opacity: 0.4 * base,
            fillColor: color,
            fillOpacity: band.opacity * base,
            interactive: false,
          },
        });
      }
    }
  }
  return specs;
}
