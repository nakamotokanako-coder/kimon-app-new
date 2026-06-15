export const MAP_FAN = {
  sectorDeg: 45,
  defaultBearingMode: 'plane',
  defaultDeclination: false,
  sphereReferenceM: 1000000,
};

// 方位法トグルの表示文言（i18n布石・角度計算とは無関係の文言定数のみ）。
export const BEARING_LABELS = {
  heading: '方位の引き方',
  mode_plane: '平面',
  mode_sphere: '球面',
  declination_on: '西偏角あり',
  declination_off: '補正なし',
  group_aria: '方位線の引き方',
};

export const DISTANCE_PROFILE = {
  jiban: {
    key: 'jiban',
    confirmKm: 0.5,
    fadeMaxKm: 10,
    initialZoom: 13,
    caption: '500m以上＋5分滞在で効果（効果5日）。500mの確定ゾーンが濃く、外側は10kmまで薄くフェード表示。',
    note: ['500m 確定ライン', '外側は10kmまでフェード表示'],
    scaleTitle: '時盤の距離：内が濃い → 外が薄い',
    scaleNote: '徒歩5分≒400m。500m未満は近すぎ。確定ゾーンを出ると効果が薄れる＝外ほど淡く。',
    fadeBands: [
      { from: 0, to: 0.5, op: 0.55 },
      { from: 0.5, to: 2, op: 0.40 },
      { from: 2, to: 4, op: 0.28 },
      { from: 4, to: 7, op: 0.18 },
      { from: 7, to: 10, op: 0.10 },
    ],
    rings: [
      { km: 0.5, label: '500m 確定' },
      { km: 10, label: '10km' },
    ],
    ruler: [
      { x: 0, w: 5, op: 0.9, label: '0', bottom: '起点' },
      { x: 5, w: 20, op: 0.7, label: '500m', bottom: '確定ライン' },
      { x: 25, w: 75, op: 0.3, label: '', bottom: '10kmへフェード' },
    ],
  },
  nichiban: {
    key: 'nichiban',
    confirmKm: 50,
    fadeMaxKm: 250,
    initialZoom: 7,
    caption: '50km以上＋3時間滞在で効果（効果60日）。50km未満は近すぎ＝薄く、遠いほど効果が増すので外ほど濃い（時盤と逆）。',
    note: ['50km 有効ライン', '遠いほど濃い反転フェード'],
    scaleTitle: '日盤の距離：内が薄い → 外が濃い',
    scaleNote: '日帰り行軍≒39km、50kmで無難、50〜100km以上が理想。直線距離で測る。',
    fadeBands: [
      { from: 0, to: 50, op: 0.10 },
      { from: 50, to: 100, op: 0.28 },
      { from: 100, to: 160, op: 0.42 },
      { from: 160, to: 250, op: 0.55 },
    ],
    rings: [
      { km: 50, label: '50km 有効ライン' },
      { km: 100, label: '100km' },
      { km: 200, label: '200km' },
    ],
    ruler: [
      { x: 0, w: 20, op: 0.12, label: '0', bottom: '近すぎ' },
      { x: 20, w: 20, op: 0.30, label: '50km', bottom: '有効ライン' },
      { x: 40, w: 30, op: 0.45, label: '100km', bottom: '' },
      { x: 70, w: 30, op: 0.60, label: '200km〜', bottom: '遠いほど強' },
    ],
  },
};

function getThemeAccentColor() {
  if (typeof document === 'undefined') return '#e6c34a';
  return (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '').trim() || '#e6c34a';
}

export const MAP_FAN_COLORS = {
  great: '#185FA5',
  good: '#378ADD',
  weak: '#85B7EB',
  neutral: '#6f6c5e',
  bad: '#c2554f',
  'bad-strong': '#a3302a',
  get best() {
    return getThemeAccentColor();
  },
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

export function liveLineColor(liveDir, bestPalace) {
  if (!liveDir) return '#8a8a8a';
  if (liveDir.palace === bestPalace) return '#2e9e5b';
  if (isPositiveTone(liveDir.tone)) return '#2e9e5b';
  return '#8a8a8a';
}

export function directionIndexFor(item) {
  if (Number.isFinite(item?.angle)) return Math.round(item.angle / MAP_FAN.sectorDeg) % 8;
  return 0;
}

export function getDistanceProfile(profileKey = 'jiban') {
  return DISTANCE_PROFILE[profileKey] || DISTANCE_PROFILE.jiban;
}

export function buildFanLayerSpecs(rankings, bestPalace, bearingOptions = {}, profileKey = 'jiban') {
  const accent = getThemeAccentColor();
  const profile = getDistanceProfile(profileKey);
  const specs = [];
  for (const item of rankings || []) {
    const color = getFanColor(item.tone);
    const isBest = item.palace === bestPalace;
    const isGood = isPositiveTone(item.tone);
    const isBad = isNegativeTone(item.tone);
    const angle = bearingFor(directionIndexFor(item), bearingOptions);
    const from = angle - MAP_FAN.sectorDeg / 2;
    const to = angle + MAP_FAN.sectorDeg / 2;

    if (isGood || isBad) {
      const base = isBad ? 0.75 : 1;
      for (const band of profile.fadeBands) {
        specs.push({
          item,
          type: 'fade',
          angle,
          from,
          to,
          inner: band.from * 1000,
          outer: band.to * 1000,
          color,
          options: {
            color,
            weight: 0,
            opacity: 0.4 * base,
            fillColor: color,
            fillOpacity: band.op * base,
            interactive: false,
          },
        });
      }
    } else {
      specs.push({
        item,
        type: 'neutral',
        angle,
        from,
        to,
        inner: 0,
        outer: profile.confirmKm * 1000,
        color,
        options: {
          color,
          weight: 1,
          opacity: 0.35,
          fillColor: color,
          fillOpacity: 0.14,
          dashArray: '4 3',
        },
      });
    }

    specs.push({
      item,
      type: 'edge',
      angle,
      from,
      to,
      inner: profile.confirmKm * 1000,
      outer: profile.fadeMaxKm * 1000,
      color,
      options: {
        color: isBest ? accent : color,
        weight: isBest ? 2.5 : 1,
        opacity: isBest ? 0.95 : 0.35,
        fill: false,
        interactive: false,
      },
    });

    if (isBest) {
      specs.push({
        item,
        type: 'best',
        angle,
        from,
        to,
        inner: profile.confirmKm * 1000,
        outer: profile.fadeMaxKm * 1000,
        color: accent,
        options: {
          color: accent,
          weight: 4,
          opacity: 0.22,
          fill: false,
          interactive: false,
        },
      });
    }
  }
  return specs;
}
