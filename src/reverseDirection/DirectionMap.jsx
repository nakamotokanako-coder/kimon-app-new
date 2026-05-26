import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MAP_FAN,
  MAP_FAN_COLORS,
  bearingFor,
  buildFanLayerSpecs,
  destPoint,
  directionIndexFor,
  getDistanceProfile,
  isNegativeTone,
  isPositiveTone,
  sectorPolygon,
} from './mapFan.js';

const LABEL_MODE = {
  compact: { className: 'is-compact', showScore: true },
  fullscreen: { className: 'is-fullscreen', showScore: true },
};

function scoreText(score) {
  return `${score > 0 ? '+' : ''}${score}`;
}

function scoreColor(tone) {
  if (isPositiveTone(tone)) return '#bfe0ff';
  if (isNegativeTone(tone)) return '#ffc0bc';
  return '#d8d6cf';
}

function buildBearingOptions(center, bearingMode, useDeclination) {
  return {
    center,
    mode: bearingMode,
    declination: useDeclination,
  };
}

export default function DirectionMap({ location, rankings, bestPalace, profileKey = 'jiban', showScale = false }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bearingMode, setBearingMode] = useState(MAP_FAN.defaultBearingMode);
  const [useDeclination, setUseDeclination] = useState(MAP_FAN.defaultDeclination);
  const mapRef = useRef(null);
  const mapNodeRef = useRef(null);
  const layerGroupRef = useRef(null);
  const center = useMemo(() => [location.latitude, location.longitude], [location.latitude, location.longitude]);
  const bearingOptions = useMemo(
    () => buildBearingOptions(center, bearingMode, useDeclination),
    [bearingMode, center, useDeclination],
  );
  const profile = getDistanceProfile(profileKey);
  const labelMode = isFullscreen ? LABEL_MODE.fullscreen : LABEL_MODE.compact;

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;
    mapRef.current = L.map(mapNodeRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(center, profile.initialZoom);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(mapRef.current);
    layerGroupRef.current = L.layerGroup().addTo(mapRef.current);
  }, [center]);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    map.setView(center, isFullscreen ? Math.max(profile.initialZoom, 7) : profile.initialZoom);

    const specs = buildFanLayerSpecs(rankings, bestPalace, bearingOptions, profileKey);
    specs.forEach((spec) => {
      L.polygon(
        sectorPolygon(center, spec.from, spec.to, spec.outer, spec.inner),
        spec.options,
      ).addTo(layerGroup);
    });

    L.circleMarker(center, {
      radius: 6,
      color: MAP_FAN_COLORS.best,
      fillColor: MAP_FAN_COLORS.best,
      fillOpacity: 1,
      weight: 2,
    }).bindTooltip(`基準点：${location.name}`, { permanent: false }).addTo(layerGroup);

    profile.rings.forEach((ring) => {
      const isConfirm = ring.km === profile.confirmKm;
      if (isConfirm) {
        L.circle(center, {
          radius: ring.km * 1000,
          color: MAP_FAN_COLORS.best,
          weight: 6,
          opacity: 0.25,
          fill: false,
          interactive: false,
        }).addTo(layerGroup);
      }
      L.circle(center, {
        radius: ring.km * 1000,
        color: isConfirm ? MAP_FAN_COLORS.best : '#c9c4b0',
        weight: isConfirm ? 2.5 : 1,
        opacity: 0.85,
        fill: false,
        dashArray: isConfirm ? null : '4 6',
        interactive: false,
      }).bindTooltip(ring.label, { permanent: false, direction: 'top' }).addTo(layerGroup);

      const labelPoint = destPoint(center, 65, ring.km * 1000);
      L.marker(labelPoint, {
        icon: L.divIcon({
          className: '',
          html: `<div class="direction-ring-label">${ring.label}</div>`,
          iconSize: [96, 16],
          iconAnchor: [48, 8],
        }),
        interactive: false,
      }).addTo(layerGroup);
    });

    (rankings || []).forEach((item) => {
      const labelAngle = bearingFor(directionIndexFor(item), bearingOptions);
      const labelPoint = destPoint(center, labelAngle, profile.fadeMaxKm * 1000 * 0.72);
      const score = labelMode.showScore
        ? `<br><span style="color:${scoreColor(item.tone)}">${scoreText(item.score)}</span>`
        : '';
      const icon = L.divIcon({
        className: '',
        html: `<div class="direction-map-label ${labelMode.className}">${item.label}${score}</div>`,
        iconSize: isFullscreen ? [54, 38] : [44, 28],
        iconAnchor: isFullscreen ? [27, 19] : [22, 14],
      });
      L.marker(labelPoint, { icon, interactive: false }).addTo(layerGroup);
    });

    window.setTimeout(() => map.invalidateSize(), 0);
  }, [bearingOptions, bestPalace, center, isFullscreen, labelMode, location.name, profile, profileKey, rankings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timer);
  }, [isFullscreen]);

  return (
    <div className={`direction-map-wrap ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <div className="direction-map-header">
        <div className="direction-map-note">
          <span>{profile.note[0]}</span>
          <span>{profile.note[1]}</span>
        </div>
        <button
          type="button"
          className="direction-map-action"
          onClick={() => setIsFullscreen((value) => !value)}
        >
          {isFullscreen ? '閉じる' : '拡大'}
        </button>
      </div>

      {isFullscreen && (
        <div className="direction-map-controls" aria-label="方位線の引き方">
          <div className="direction-map-toggle" role="group" aria-label="平面または球面">
            <button
              type="button"
              className={bearingMode === 'plane' ? 'is-active' : ''}
              onClick={() => setBearingMode('plane')}
            >
              平面
            </button>
            <button
              type="button"
              className={bearingMode === 'sphere' ? 'is-active' : ''}
              onClick={() => setBearingMode('sphere')}
            >
              球面
            </button>
          </div>
          <label className="direction-map-check">
            <input
              type="checkbox"
              checked={useDeclination}
              onChange={(event) => setUseDeclination(event.target.checked)}
            />
            西偏角あり
          </label>
        </div>
      )}

      <div ref={mapNodeRef} className="direction-map" aria-label="地図上の吉方位扇表示" />
      <p className="direction-map-caption">{profile.caption}</p>
      {showScale && (
        <div className="direction-scale-card">
          <h3>{profile.scaleTitle}</h3>
          <div className="direction-ruler" aria-hidden="true">
            {profile.ruler.map((segment) => (
              <React.Fragment key={`${segment.x}-${segment.w}`}>
                <span
                  className="direction-ruler-band"
                  style={{
                    left: `${segment.x}%`,
                    width: `${segment.w}%`,
                    backgroundColor: `rgba(24, 95, 165, ${segment.op})`,
                  }}
                />
                {segment.label && (
                  <span className="direction-ruler-label" style={{ left: `${segment.x + 1}%` }}>{segment.label}</span>
                )}
                {segment.bottom && (
                  <span className="direction-ruler-label is-bottom" style={{ left: `${segment.x + 1}%` }}>{segment.bottom}</span>
                )}
              </React.Fragment>
            ))}
          </div>
          <p>{profile.scaleNote}</p>
        </div>
      )}
      <div className="direction-map-legend">
        <span><i className="legend-swatch tone-great" />大吉</span>
        <span><i className="legend-swatch tone-weak" />小吉</span>
        <span><i className="legend-swatch tone-neutral" />中立</span>
        <span><i className="legend-swatch tone-bad" />凶</span>
      </div>
    </div>
  );
}
