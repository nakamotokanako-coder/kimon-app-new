export const MAP_FAN = {
  radiusM: 500,
  sectorDeg: 45,
  zoom: 13,
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

export function buildFanLayerSpecs(rankings, bestPalace) {
  const specs = [];
  for (const item of rankings || []) {
    const color = getFanColor(item.tone);
    const isBest = item.palace === bestPalace;
    const isGood = isPositiveTone(item.tone);
    const isBad = isNegativeTone(item.tone);
    const from = item.angle - MAP_FAN.sectorDeg / 2;
    const to = item.angle + MAP_FAN.sectorDeg / 2;

    specs.push({
      item,
      type: 'solid',
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
