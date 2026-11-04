// SITUATION's map widget: points of a source (a register's coordinates, lat / lon columns of one's own table) on an
// OpenStreetMap base (OpenFreeMap, no key), coloured by the widget's group. Loaded only when a dashboard has a map.
import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, setWorkerUrl, Popup } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../store.jsx';

const COLORS = { dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'], light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] };
const UKRAINE = [[22.1, 44.3], [40.3, 52.4]];
let worker = false;

export function SitMap({ points, open, height = 320 }) {
  const { state } = useStore();
  const light = state.settings.theme === 'paper';
  const box = useRef(null);
  const map = useRef(null);
  const groups = [...new Set(points.map((p) => p.group || ''))];
  const color = (g) => COLORS[light ? 'light' : 'dark'][Math.max(0, groups.indexOf(g)) % 5];
  const data = { type: 'FeatureCollection', features: points.map((p, i) => ({ type: 'Feature', id: i, geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { i, color: color(p.group || ''), name: p.name, group: p.group } })) };
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!worker) { setWorkerUrl(mapWorkerUrl); worker = true; }
    const m = new MapLibreMap({
      container: box.current, style: `https://tiles.openfreemap.org/styles/${light ? 'positron' : 'dark'}`,
      bounds: UKRAINE, fitBoundsOptions: { padding: 16 }, dragRotate: false, attributionControl: { compact: true },
    });
    map.current = m;
    // The base map may not load (offline, blocked): the points then stand on a plain background.
    let based = false;
    m.on('error', () => { if (!based && !m.isStyleLoaded()) { based = true; m.setStyle({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': light ? '#f0efec' : '#121212' } }] }); } });
    m.on('style.load', () => {
      if (m.getSource('pts')) return;
      m.addSource('pts', { type: 'geojson', data: dataRef.current });
      m.addLayer({ id: 'pts', type: 'circle', source: 'pts', paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-color': light ? '#ffffff' : '#0a0a0a', 'circle-stroke-width': 2 } });
      const pts = dataRef.current.features;
      if (pts.length) {
        const xs = pts.map((f) => f.geometry.coordinates[0]); const ys = pts.map((f) => f.geometry.coordinates[1]);
        m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 40, maxZoom: 10, duration: 0 });
      }
      m.on('mouseenter', 'pts', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'pts', () => { m.getCanvas().style.cursor = ''; });
      m.on('click', 'pts', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = points[f.properties.i];
        const el = document.createElement('div');
        el.className = 'sit-pop';
        el.textContent = `${p?.name || ''}${p?.group ? ` · ${p.group}` : ''}`;
        if (p?.to) { const b = document.createElement('button'); b.className = 'vx-btn vx-btn--ghost vx-btn--sm'; b.textContent = 'Відкрити'; b.onclick = () => open(p.to); el.append(b); }
        new Popup({ closeButton: false }).setLngLat(f.geometry.coordinates).setDOMContent(el).addTo(m);
      });
    });
    return () => { m.remove(); map.current = null; };
  }, [light]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { map.current?.getSource('pts')?.setData(data); }); // the points follow the filters

  return (
    <div>
      <div ref={box} className="sit-map" style={{ height }} />
      {groups.filter(Boolean).length > 1 && (
        <div className="sit-legend">{groups.filter(Boolean).slice(0, 5).map((g) => <span key={g}><i style={{ background: color(g) }} />{g}</span>)}</div>
      )}
    </div>
  );
}
