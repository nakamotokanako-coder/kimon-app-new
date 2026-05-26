import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MAP_FAN,
  MAP_FAN_COLORS,
  buildFanLayerSpecs,
  destPoint,
  isNegativeTone,
  isPositiveTone,
  sectorPolygon,
} from './mapFan.js';

function scoreText(score) {
  return `${score > 0 ? '+' : ''}${score}`;
}

function scoreColor(tone) {
  if (isPositiveTone(tone)) return '#bfe0ff';
  if (isNegativeTone(tone)) return '#ffc0bc';
  return '#d8d6cf';
}

export default function DirectionMap({ location, rankings, bestPalace }) {
  const mapRef = useRef(null);
  const mapNodeRef = useRef(null);
  const layerGroupRef = useRef(null);
  const center = useMemo(() => [location.latitude, location.longitude], [location.latitude, location.longitude]);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;
    mapRef.current = L.map(mapNodeRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(center, MAP_FAN.zoom);
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
    map.setView(center, MAP_FAN.zoom);

    const specs = buildFanLayerSpecs(rankings, bestPalace);
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

    L.circle(center, {
      radius: MAP_FAN.radiusM,
      color: MAP_FAN_COLORS.best,
      weight: 1.5,
      opacity: 0.7,
      fill: false,
      dashArray: '3 5',
    }).bindTooltip('500m（確定ライン）', { permanent: false, direction: 'top' }).addTo(layerGroup);

    (rankings || []).forEach((item) => {
      const labelPoint = destPoint(center, item.angle, MAP_FAN.radiusM * 0.62);
      const icon = L.divIcon({
        className: '',
        html: `<div class="direction-map-label">${item.label}<br><span style="color:${scoreColor(item.tone)}">${scoreText(item.score)}</span></div>`,
        iconSize: [44, 32],
        iconAnchor: [22, 16],
      });
      L.marker(labelPoint, { icon, interactive: false }).addTo(layerGroup);
    });

    window.setTimeout(() => map.invalidateSize(), 0);
  }, [bestPalace, center, location.name, rankings]);

  return (
    <div className="direction-map-wrap">
      <div className="direction-map-note">
        <span>500m確定ライン</span>
        <span>外側は10kmまでフェード表示</span>
      </div>
      <div ref={mapNodeRef} className="direction-map" aria-label="地図上の吉方位扇表示" />
      <div className="direction-map-legend">
        <span><i className="legend-swatch tone-great" />大吉</span>
        <span><i className="legend-swatch tone-weak" />小吉</span>
        <span><i className="legend-swatch tone-neutral" />中立</span>
        <span><i className="legend-swatch tone-bad" />凶</span>
      </div>
    </div>
  );
}
