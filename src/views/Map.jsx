import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapLibreMap, addProtocol, setWorkerUrl } from 'maplibre-gl';
// MapLibre 6 runs tile parsing in a module worker; Vite bundles it (with its imports) into one file.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { geoCentroid, geoArea, geoContains, geoBounds, geoInterpolate } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import world50 from '../data/world-50m.json';
import { useStore, fmtDate, fmtAgo } from '../store.jsx';
import { Panel, ClassBadge, Modal, Status } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { Loader } from '../brand/Mark.jsx';
import { CLEARANCE } from '../data/seed.js';
import { CITIES, TRACKS, TRACK_KIND, POINT_KINDS } from '../data/geo.js';
import { CONFLICTS, CONFLICTS_AS_OF } from '../data/conflicts.js';
import { fmtDD, fmtDMS, fmtMGRS, parseCoords, distanceKm, bearing, fmtKm, trackState } from '../map/coords.js';
import { copyText } from '../lib/io.js';
import { useLiveConflicts, ageHours } from '../map/live.js';
import { buildStyle, palette, zonesGeoJSON, eventsGeoJSON, graticule } from '../map/style.js';
import { useInstalledTiles, elevationAt } from '../map/tiles.js';

/* ---------- geography ---------- */

function prepare(topo) {
  const fc = feature(topo, topo.objects.countries);
  for (const f of fc.features) {
    const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    let best = null, bestA = -1;
    for (const p of polys) {
      const a = geoArea({ type: 'Polygon', coordinates: p });
      if (a > bestA) { bestA = a; best = p; }
    }
    f.properties.label = geoCentroid({ type: 'Polygon', coordinates: best });
    f.properties.bbox = geoBounds(f);
    f.properties.area = geoArea(f);
  }
  fc.features.sort((a, b) => b.properties.area - a.properties.area);
  return {
    fc,
    ua: fc.features.find((f) => f.id === '804'),
    borders: mesh(topo, topo.objects.countries, (a, b) => a !== b),
    coast: mesh(topo, topo.objects.countries, (a, b) => a === b),
  };
}
const BASE = prepare(world50);

function countryAt(lon, lat) {
  for (const f of BASE.fc.features) {
    const [[x0, y0], [x1, y1]] = f.properties.bbox;
    const inLon = x0 <= x1 ? lon >= x0 && lon <= x1 : lon >= x0 || lon <= x1;
    if (!inLon || lat < y0 || lat > y1) continue;
    if (geoContains(f, [lon, lat])) return f;
  }
  return null;
}

// Conflict zones as GeoJSON, rings wound the way d3 expects (a ring larger than a hemisphere is reversed).
const BUILTIN_ZONES = CONFLICTS.map((z) => {
  if (!z.ring) return { ...z, feature: BASE.fc.features.find((f) => f.id === z.country) };
  let ring = [...z.ring, z.ring[0]];
  let f = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
  if (geoArea(f) > 2 * Math.PI) { ring = ring.slice().reverse(); f = { ...f, geometry: { type: 'Polygon', coordinates: [ring] } }; }
  return { ...z, feature: f, bbox: geoBounds(f) };
});
function zoneAt(zones, lon, lat, country) {
  if (!country) return null;
  return zones.find((z) => (z.country
    ? country.id === z.country
    : (z.clip !== 'ukraine' || country.id === '804') && geoContains(z.feature, [lon, lat]))) || null;
}

const SOURCE_NAME = { deepstate: 'DeepState', isw: 'ISW', acled: 'ACLED', builtin: 'Вбудовані межі' };
const EVENT_TYPE = {
  Battles: 'Бої',
  'Explosions/Remote violence': 'Вибухи та удари',
  'Violence against civilians': 'Насильство проти цивільних',
};
const STALE_HOURS = 48;

const SERIF = '"Source Serif 4 Variable", Georgia, serif';
const pixelRatio = () => Math.min(2, window.devicePixelRatio || 1);

// [west, south, east, north]
const PRESETS = {
  world: [-180, -58, 180, 78],
  europe: [-11, 35, 42, 66],
  ukraine: [22.1, 44.3, 40.3, 52.4],
};
const SIM = [1, 60, 600];
const compass = (deg) => ['Пн', 'ПнСх', 'Сх', 'ПдСх', 'Пд', 'ПдЗх', 'Зх', 'ПнЗх'][Math.round(deg / 45) % 8];

// Great-circle segments drawn as curves: split each leg into short pieces before projecting.
function densify(pts, per = 24) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const f = geoInterpolate([pts[i].lon, pts[i].lat], [pts[i + 1].lon, pts[i + 1].lat]);
    for (let k = 0; k < per; k++) out.push(f(k / per));
  }
  if (pts.length) out.push([pts[pts.length - 1].lon, pts[pts.length - 1].lat]);
  return out;
}

let pmtilesReady = false;
function registerPmtiles() {
  if (pmtilesReady) return;
  setWorkerUrl(mapWorkerUrl);
  addProtocol('pmtiles', new Protocol().tile);
  pmtilesReady = true;
}

const STATUS_KIND = { ok: 'ok', error: 'danger', not_configured: 'idle', disabled: 'idle' };

// Where the red layer comes from, how fresh each source is, and which one draws the front line.
function SourcesStatus({ manifest, front, frontSource, setFrontSource, available, events }) {
  const src = manifest?.sources || {};
  const line = (id) => {
    const s = src[id];
    if (!s) return <Status kind="idle">Ще не оновлювалось</Status>;
    const age = ageHours(s.sourceDate || s.updatedAt);
    if (s.status === 'ok') {
      return <Status kind={age > STALE_HOURS ? 'warn' : 'ok'}>
        Оновлено {fmtAgo(s.updatedAt)} · дані від {fmtDate(s.sourceDate || s.updatedAt)}{id === 'acled' ? ` · ${events} подій` : ''}
      </Status>;
    }
    if (s.status === 'error') return <Status kind="danger">Помилка оновлення{s.updatedAt ? `, показано дані від ${fmtDate(s.sourceDate || s.updatedAt)}` : ''}</Status>;
    if (s.status === 'not_configured') return <Status kind="idle">Не налаштовано</Status>;
    return <Status kind={STATUS_KIND[s.status] || 'idle'}>Вимкнено</Status>;
  };
  return (
    <div className="sources">
      <div className="vx-eyebrow">Джерела даних</div>
      {['deepstate', 'isw', 'acled'].map((id) => (
        <div className="sources__row" key={id}>
          <span className="sources__name">{SOURCE_NAME[id]}</span>
          {line(id)}
          {src[id]?.status === 'error' && <span className="vx-hint sources__err">{src[id].error}</span>}
        </div>
      ))}
      <div className="vx-field">
        <span className="vx-label">Лінія фронту</span>
        <div className="segmented" role="group" aria-label="Джерело лінії фронту">
          {['auto', 'deepstate', 'isw', 'builtin'].map((id) => (
            <button key={id} className={frontSource === id ? 'is-active' : ''} onClick={() => setFrontSource(id)}
              disabled={(id === 'deepstate' || id === 'isw') && !available[id]}>
              {id === 'auto' ? 'Авто' : id === 'builtin' ? 'Вбудовані' : SOURCE_NAME[id]}
            </button>
          ))}
        </div>
        <div className="vx-hint">
          Зараз: {SOURCE_NAME[front.pick]}. {front.pick === 'builtin' && `Орієнтовні межі станом на ${CONFLICTS_AS_OF} р. — не для оперативного використання.`}
        </div>
      </div>
    </div>
  );
}

export function MapView({ focus }) {
  const { state, me, perms, dispatch, userById, toast } = useStore();
  const canWrite = perms.map >= 2;
  const theme = state.settings.theme;

  const wrapRef = useRef(null);
  const mapDivRef = useRef(null);
  const overlayRef = useRef(null);
  const mapRef = useRef(null);
  const frame = useRef(0);
  const simStart = useRef({ real: Date.now(), sim: Date.now(), mult: 60 });

  const tiles = useInstalledTiles();
  const detailed = !!tiles.basemap;
  const [ready, setReady] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cursor, setCursor] = useState(null); // {lat, lon, country}
  const [elevation, setElevation] = useState(null);
  // Touch screens have no hover: show the centre of the map under a crosshair instead of the cursor.
  const [touch, setTouch] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false);
  const [centre, setCentre] = useState(null);
  const [mode, setMode] = useState('view');
  const [layers, setLayers] = useState({ relief: true, conflicts: true, events: true, graticule: false, labels: true, cities: true, points: true, tracks: true, trails: true });
  const [layersOpen, setLayersOpen] = useState(false);
  const [sel, setSel] = useState(null); // {type:'point'|'track'|'event'|'coord', id?, lat?, lon?}
  const [follow, setFollow] = useState(null);
  const [measure, setMeasure] = useState([]);
  const [query, setQuery] = useState('');
  const [queryErr, setQueryErr] = useState('');
  const [draft, setDraft] = useState(null); // new point form
  const [tab, setTab] = useState('tracks');
  const [sim, setSim] = useState(60);
  const [now, setNow] = useState(Date.now());
  const [zoom, setZoom] = useState(5);
  const [armed, setArmed] = useState(false);
  const [frontSource, setFrontSource] = useState('auto');

  // Live conflict data (see scripts/update-conflicts.mjs); built-in outlines when it is absent.
  const liveData = useLiveConflicts();
  const front = useMemo(() => {
    const want = frontSource === 'auto' ? (liveData.deepstate ? 'deepstate' : liveData.isw ? 'isw' : 'builtin') : frontSource;
    const fc = want === 'builtin' ? null : liveData[want];
    return fc ? { pick: want, fc, meta: liveData.manifest?.sources?.[want] } : { pick: 'builtin', fc: null, meta: null };
  }, [liveData, frontSource]);
  const zones = useMemo(() => BUILTIN_ZONES.map((z) => (z.id === 'ua-occupied' && front.fc
    ? { ...z, live: true, feature: front.fc, bbox: geoBounds(front.fc), note: `Дані ${SOURCE_NAME[front.pick]} станом на ${fmtDate(front.meta?.sourceDate || front.meta?.updatedAt)}.` }
    : z)), [front]);
  const events = useMemo(() => liveData.acled?.events || [], [liveData.acled]);
  const frontAge = ageHours(front.meta?.sourceDate || front.meta?.updatedAt);

  const points = useMemo(() => state.points.filter((p) => p.clearance <= me.clearance), [state.points, me.clearance]);
  const hiddenPoints = state.points.length - points.length;
  const tracks = useMemo(() => TRACKS.filter((t) => t.clearance <= me.clearance), [me.clearance]);
  const live = useMemo(() => Object.fromEntries(tracks.map((t) => [t.id, trackState(t, now)])), [tracks, now]);

  // Simulated clock: real time × multiplier, continuous across multiplier changes.
  const simNow = useCallback(() => {
    const s = simStart.current;
    return s.sim + (Date.now() - s.real) * s.mult;
  }, []);
  useEffect(() => {
    const s = simStart.current;
    const cur = s.mult ? s.sim + (Date.now() - s.real) * s.mult : Date.now();
    simStart.current = { real: Date.now(), sim: cur, mult: sim };
  }, [sim]);
  useEffect(() => {
    const t = setInterval(() => setNow(simNow()), 1000);
    return () => clearInterval(t);
  }, [simNow]);

  /* ---------- map data for MapLibre ---------- */

  const geo = detail || BASE;
  const zonesData = useMemo(() => zonesGeoJSON(zones, BASE.fc), [zones]);
  const eventsData = useMemo(() => eventsGeoJSON(events), [events]);
  const gratStep = graticule(zoom).properties.step;
  const gratData = useMemo(() => graticule(zoom), [gratStep]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedEvent = sel?.type === 'event' ? sel.id : '';

  const styleFor = useRef(null);
  styleFor.current = () => buildStyle({
    col: palette(wrapRef.current), theme, tiles, layers,
    data: { countries: geo.fc, borders: geo.borders, coast: geo.coast, ua: geo.ua, zones: zonesData, events: eventsData, graticule: gratData, selectedEvent },
  });

  const project = useCallback(([lon, lat]) => {
    const p = mapRef.current?.project([lon, lat]);
    return p ? [p.x, p.y] : null;
  }, []);

  /* ---------- overlay: tracks, points, measurement, labels (drawn on a canvas above the map) ---------- */

  const snapshot = useRef({});
  snapshot.current = { points, tracks, live, sel, layers, measure, geo, detailed, zoom };
  const draw = useRef(() => {});
  draw.current = () => {
    const canvas = overlayRef.current, map = mapRef.current;
    if (!canvas || !map) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const dpr = pixelRatio();
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const col = palette(canvas);
    const s = snapshot.current;
    const z = map.getZoom();
    const proj = ([lon, lat]) => { const p = map.project([lon, lat]); return [p.x, p.y]; };
    const line = (coords) => { ctx.beginPath(); coords.forEach((c, i) => { const p = proj(c); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); };

    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const taken = [];
    const free = (x, y, wd, ht) => {
      const r = [x - 2, y - 2, x + wd + 2, y + ht + 2];
      if (r[2] < 0 || r[3] < 0 || r[0] > w || r[1] > h) return false;
      if (taken.some((t) => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) return false;
      taken.push(r);
      return true;
    };
    const label = (text, x, y, color, font = `500 12px ${SERIF}`) => {
      ctx.font = font;
      const tw = ctx.measureText(text).width;
      if (!free(x, y - 10, tw, 13)) return;
      ctx.lineWidth = 3; ctx.strokeStyle = col.sea; ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color; ctx.fillText(text, x, y);
    };

    const markers = [];
    if (s.layers.tracks) {
      for (const t of s.tracks) {
        const st = s.live[t.id];
        const p = proj([st.lon, st.lat]);
        const active = s.sel?.type === 'track' && s.sel.id === t.id;
        if (s.layers.trails && st.trail.length > 1) {
          line(st.trail.map((q) => [q.lon, q.lat]));
          ctx.strokeStyle = active ? col.brass : col.ink3; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.6; ctx.setLineDash([]); ctx.stroke(); ctx.globalAlpha = 1;
        }
        if (active) {
          line(densify(t.route.map(([la, lo]) => ({ lat: la, lon: lo })), 8));
          ctx.strokeStyle = col.ink3; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
        }
        const back = st.trail[1] ? proj([st.trail[1].lon, st.trail[1].lat]) : null;
        const ang = back && (back[0] !== p[0] || back[1] !== p[1]) ? Math.atan2(p[1] - back[1], p[0] - back[0]) : ((st.heading - 90) * Math.PI) / 180;
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-3, 0); ctx.lineTo(-6, 7); ctx.closePath();
        ctx.fillStyle = active ? col.brass : col.ink; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = col.sea; ctx.stroke();
        ctx.restore();
        markers.push({ text: t.name, x: p[0] + 12, y: p[1] + 4, color: active ? col.brass : col.ink, font: `600 12.5px ${SERIF}`, always: active || z >= 4.5 });
      }
    }
    if (s.layers.points) {
      for (const pt of s.points) {
        const p = proj([pt.lon, pt.lat]);
        const active = s.sel?.type === 'point' && s.sel.id === pt.id;
        const r = pt.kind === 'wp' ? 4.5 : 6.5;
        ctx.beginPath(); ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0] + r, p[1]); ctx.lineTo(p[0], p[1] + r); ctx.lineTo(p[0] - r, p[1]); ctx.closePath();
        if (pt.kind === 'obs') { ctx.fillStyle = col.sea; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = active ? col.brass : col.ink; ctx.stroke(); }
        else { ctx.fillStyle = active ? col.brass : col.ink; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = col.sea; ctx.stroke(); }
        markers.push({ text: pt.name, x: p[0] + 10, y: p[1] + 4, color: active ? col.brass : col.ink2, always: active || z >= 6 });
      }
    }
    if (s.measure.length) {
      line(densify(s.measure));
      ctx.strokeStyle = col.brass; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      s.measure.forEach((q, i) => {
        const p = proj([q.lon, q.lat]);
        ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = col.sea; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col.brass; ctx.stroke();
        if (i === s.measure.length - 1 && i > 0) {
          const total = s.measure.slice(1).reduce((a, b, j) => a + distanceKm(s.measure[j], b), 0);
          markers.unshift({ text: fmtKm(total), x: p[0] + 10, y: p[1] - 8, color: col.brass, font: `600 13px ${SERIF}`, always: true });
        }
      });
    }
    if (s.sel?.type === 'coord') {
      const p = proj([s.sel.lon, s.sel.lat]);
      ctx.strokeStyle = col.brass; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p[0] - 15, p[1]); ctx.lineTo(p[0] - 5, p[1]); ctx.moveTo(p[0] + 5, p[1]); ctx.lineTo(p[0] + 15, p[1]);
      ctx.moveTo(p[0], p[1] - 15); ctx.lineTo(p[0], p[1] - 5); ctx.moveTo(p[0], p[1] + 5); ctx.lineTo(p[0], p[1] + 15); ctx.stroke();
    }
    for (const m of markers) if (m.always) label(m.text, m.x, m.y, m.color, m.font);

    // The detailed basemap brings its own place and country names; the fallback map needs ours.
    if (!s.detailed && s.layers.cities) {
      for (const city of CITIES) {
        if (city.tier === 2 && z < 5.5) continue;
        if (city.tier === 1 && z < 3 && city.name !== 'Київ') continue;
        const p = proj([city.lon, city.lat]);
        if (p[0] < -20 || p[1] < -20 || p[0] > w + 20 || p[1] > h + 20) continue;
        ctx.beginPath(); ctx.arc(p[0], p[1], city.name === 'Київ' ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = col.ink2; ctx.fill();
        label(city.name, p[0] + 6, p[1] + 4, col.ink2);
      }
    }
    if (!s.detailed && s.layers.labels) {
      for (const f of s.geo.fc.features) {
        const [[x0, y0], [x1, y1]] = f.properties.bbox;
        if (x1 < x0) continue;
        const a = proj([x0, y1]), b = proj([x1, y0]);
        const span = Math.abs(b[0] - a[0]);
        if (span < 70 && !(f.id === '804' && span > 30)) continue;
        const p = proj(f.properties.label);
        const text = f.properties.uk.toUpperCase();
        ctx.font = `600 11px ${SERIF}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
        const tw = ctx.measureText(text).width;
        label(text, p[0] - tw / 2, p[1] + 4, f.id === '804' ? col.ink2 : col.ink3, `600 11px ${SERIF}`);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      }
    }
  };
  const requestDraw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => draw.current());
  }, []);

  /* ---------- the map ---------- */

  const pending = useRef(null); // a view requested before the map existed
  const flyTo = useCallback((lat, lon, z, duration = 900) => {
    const map = mapRef.current;
    if (!map) { pending.current = { center: [lon, lat], zoom: z ?? 9 }; return; }
    map.flyTo({ center: [lon, lat], zoom: z ?? map.getZoom(), duration, essential: true });
  }, []);
  const fitBounds = useCallback(([w, s, e, n], duration = 900) => {
    const map = mapRef.current;
    if (!map) { pending.current = { bounds: [[w, s], [e, n]] }; return; }
    map.fitBounds([[w, s], [e, n]], { padding: 24, duration, essential: true });
  }, []);

  useEffect(() => {
    if (!tiles.loaded) return undefined;
    registerPmtiles();
    const view = pending.current;
    const map = new MapLibreMap({
      container: mapDivRef.current,
      style: styleFor.current(),
      bounds: view?.bounds || [[PRESETS.ukraine[0], PRESETS.ukraine[1]], [PRESETS.ukraine[2], PRESETS.ukraine[3]]],
      fitBoundsOptions: { padding: 24 },
      center: view?.center, zoom: view?.zoom,
      minZoom: 1, maxZoom: tiles.basemap ? 18 : 11,
      dragRotate: false, pitchWithRotate: false, touchPitch: false,
      attributionControl: { compact: true },
      fadeDuration: 150,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    mapRef.current = map;
    let raf = 0;
    const onMove = () => {
      requestDraw();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setZoom((z) => (Math.abs(z - map.getZoom()) > 0.05 ? map.getZoom() : z));
        const c = map.getCenter();
        setCentre({ lat: c.lat, lon: c.lng });
      });
    };
    map.on('load', () => {
      // Keep the data credits folded behind the (i) button so they do not cover the map on small screens.
      map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      setReady(true);
      onMove();
    });
    map.on('move', onMove);
    map.on('moveend', () => setZoom(map.getZoom()));
    map.on('dragstart', () => setFollow(null));
    const ro = new ResizeObserver(() => { map.resize(); requestDraw(); });
    ro.observe(wrapRef.current);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); map.remove(); mapRef.current = null; setReady(false); };
  }, [tiles.loaded, requestDraw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme change: rebuild the style with the new palette.
  const themeRef = useRef(theme);
  useEffect(() => {
    if (!ready || themeRef.current === theme) return;
    themeRef.current = theme;
    mapRef.current.setStyle(styleFor.current());
  }, [theme, ready]);

  // Data and visibility updates go straight to the sources and layers.
  const setData = (id, data) => { try { mapRef.current?.getSource(id)?.setData(data); } catch { /* style reloading */ } };
  useEffect(() => { if (ready) setData('zones', zonesData); }, [ready, zonesData]);
  useEffect(() => { if (ready) setData('events', eventsData); }, [ready, eventsData]);
  useEffect(() => { if (ready) setData('graticule', gratData); }, [ready, gratData]);
  useEffect(() => {
    if (!ready) return;
    setData('borders', geo.borders); setData('ua', geo.ua); setData('countries', geo.fc); setData('coast', geo.coast);
  }, [ready, geo]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const vis = (id, on) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    vis('hillshade', layers.relief); vis('graticule', layers.graticule);
    vis('zones-fill', layers.conflicts); vis('zones-line', layers.conflicts); vis('events', layers.events);
  }, [ready, layers]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer('events')) return;
    const col = palette(wrapRef.current);
    map.setPaintProperty('events', 'circle-color', ['case', ['==', ['get', 'id'], selectedEvent], col.brass, col.conflict]);
  }, [ready, selectedEvent, theme]);

  // Sharper country borders (1:10m) once the map is zoomed in, or straight away over the detailed basemap.
  useEffect(() => {
    if ((!detailed && zoom < 4) || detail || detailLoading) return;
    setDetailLoading(true);
    import('../data/world-10m.json')
      .then((m) => setDetail(prepare(m.default)))
      .catch(() => toast('Не вдалося завантажити детальні кордони'))
      .finally(() => setDetailLoading(false));
  }, [zoom, detailed, detail, detailLoading, toast]);

  // First view: Ukraine, or the linked object.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = focus && TRACKS.find((x) => x.id === focus);
    const p = focus && state.points.find((x) => x.id === focus);
    if (t && t.clearance <= me.clearance) { const st = trackState(t, simNow()); setSel({ type: 'track', id: t.id }); flyTo(st.lat, st.lon, 8, 0); }
    else if (p && p.clearance <= me.clearance) { setSel({ type: 'point', id: p.id }); setTab('points'); flyTo(p.lat, p.lon, 12, 0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow a moving object.
  useEffect(() => {
    if (!follow || !mapRef.current) return;
    const st = live[follow];
    if (st) mapRef.current.easeTo({ center: [st.lon, st.lat], duration: 900 });
  }, [follow, live]);

  useEffect(() => { requestDraw(); }, [points, tracks, live, sel, layers, measure, geo, ready, requestDraw, theme]);
  useEffect(() => { document.fonts?.ready.then(() => requestDraw()); }, [requestDraw]);

  /* ---------- pointer ---------- */

  const hover = useRef(0);
  const cursorRef = useRef(null);
  const onPointerMove = (e) => {
    if (e.pointerType === 'touch') { setTouch(true); return; }
    const map = mapRef.current;
    if (!map) return;
    const r = mapDivRef.current.getBoundingClientRect();
    const ll = map.unproject([e.clientX - r.left, e.clientY - r.top]);
    cancelAnimationFrame(hover.current);
    hover.current = requestAnimationFrame(() => {
      if (Math.abs(ll.lat) > 85.05) { setCursor(null); return; }
      const c = { lon: ll.lng, lat: ll.lat, country: countryAt(ll.lng, ll.lat) };
      cursorRef.current = c;
      setCursor(c);
      elevationAt(tiles.terrain, c.lat, c.lon).then((m) => { if (cursorRef.current === c) setElevation(m); });
    });
  };
  useEffect(() => {
    if (!touch || !centre) return;
    let alive = true;
    elevationAt(tiles.terrain, centre.lat, centre.lon).then((m) => { if (alive) setElevation(m); });
    return () => { alive = false; };
  }, [touch, centre, tiles.terrain]);

  const hit = (xy) => {
    let best = null, bestD = 14;
    const near = (lon, lat) => { const p = project([lon, lat]); return p ? Math.hypot(p[0] - xy[0], p[1] - xy[1]) : Infinity; };
    if (layers.tracks) for (const t of tracks) { const d = near(live[t.id].lon, live[t.id].lat); if (d < bestD) { bestD = d; best = { type: 'track', id: t.id }; } }
    if (layers.points) for (const pt of points) { const d = near(pt.lon, pt.lat); if (d < bestD) { bestD = d; best = { type: 'point', id: pt.id }; } }
    if (layers.events) for (const e of events) { const d = near(e.lon, e.lat); if (d < bestD) { bestD = d; best = { type: 'event', id: e.id }; } }
    return best;
  };

  const onClick = (e) => {
    const map = mapRef.current;
    if (!map) return;
    const r = mapDivRef.current.getBoundingClientRect();
    const xy = [e.clientX - r.left, e.clientY - r.top];
    const ll = map.unproject(xy);
    if (Math.abs(ll.lat) > 85.05) return;
    const at = { lat: ll.lat, lon: ((ll.lng + 540) % 360) - 180 };
    if (mode === 'measure') { setMeasure((m) => [...m, at]); setTab('measure'); return; }
    if (mode === 'mark') { setDraft({ ...at, name: '', kind: 'site', clearance: 0, note: '' }); return; }
    const h = hit(xy);
    setFollow(null);
    if (h) { setSel(h); setTab(h.type === 'track' ? 'tracks' : h.type === 'event' ? 'conflicts' : 'points'); }
    else setSel({ type: 'coord', ...at });
    setArmed(false);
  };
  // MapLibre swallows click events after a drag; plain pointer taps on the map pass through here.
  const down = useRef(null);
  const onPointerDown = (e) => { if (e.pointerType === 'touch') setTouch(true); down.current = [e.clientX, e.clientY]; };
  const onPointerUp = (e) => {
    const d = down.current;
    down.current = null;
    if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) < 6 && !e.target.closest?.('.maplibregl-ctrl')) onClick(e);
  };

  /* ---------- actions ---------- */

  const copy = async (text) => { toast((await copyText(text)) ? `Скопійовано: ${text}` : 'Не вдалося скопіювати'); };

  const search = (e) => {
    e.preventDefault();
    setQueryErr('');
    const q = query.trim();
    if (!q) return;
    const cur = mapRef.current?.getZoom() ?? 5;
    const c = parseCoords(q);
    if (c) {
      setSel({ type: 'coord', ...c });
      flyTo(c.lat, c.lon, Math.max(cur, detailed ? 14 : 9));
      dispatch({ type: 'map/log', text: `Пошук координат ${fmtDD(c.lat, c.lon)}` });
      return;
    }
    const low = q.toLowerCase();
    const city = CITIES.find((x) => x.name.toLowerCase().startsWith(low));
    if (city) { setSel({ type: 'coord', lat: city.lat, lon: city.lon }); flyTo(city.lat, city.lon, Math.max(cur, detailed ? 11 : 8)); return; }
    const pt = points.find((x) => x.name.toLowerCase().includes(low));
    if (pt) { setSel({ type: 'point', id: pt.id }); setTab('points'); flyTo(pt.lat, pt.lon, Math.max(cur, detailed ? 14 : 9)); return; }
    const country = BASE.fc.features.find((f) => f.properties.uk.toLowerCase().startsWith(low) || f.properties.name.toLowerCase().startsWith(low));
    if (country) {
      const [[x0, y0], [x1, y1]] = country.properties.bbox;
      // Very wide countries (Russia, USA with islands) frame their main landmass instead.
      if ((x1 >= x0 ? x1 - x0 : x1 + 360 - x0) > 120) flyTo(country.properties.label[1], country.properties.label[0], 3);
      else fitBounds([x0, Math.max(-80, y0), x1, Math.min(84, y1)]);
      return;
    }
    setQueryErr('Не розпізнано. Приклади: 50.4501, 30.5234 · 50°27′N 30°31′E · 36U UA 24182 91607 · Львів');
  };

  const savePoint = (e) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    dispatch({ type: 'point/add', point: { name, kind: draft.kind, clearance: draft.clearance, note: draft.note.trim(), lat: draft.lat, lon: draft.lon } });
    toast(`Позначку «${name}» додано`);
    setDraft(null);
    setMode('view');
    setTab('points');
  };

  const removePoint = (id) => {
    if (!armed) { setArmed(true); return; }
    dispatch({ type: 'point/delete', id });
    setSel(null); setArmed(false);
    toast('Позначку видалено');
  };

  const zoomBy = (f) => (f > 1 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut());
  const preset = (p) => { setFollow(null); fitBounds(PRESETS[p]); };

  const measureTotal = measure.slice(1).reduce((a, b, i) => a + distanceKm(measure[i], b), 0);

  // Scale bar from MapLibre's 512-px world at the current zoom and centre latitude.
  const scale = useMemo(() => {
    const lat = centre?.lat ?? 48;
    const kmPerPx = (40075.016686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
    const target = kmPerPx * 100;
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const nice = [1, 2, 5, 10].map((m) => m * pow).filter((v) => v <= target).pop() || pow;
    return { km: nice, px: nice / kmPerPx };
  }, [zoom, centre]);

  const readout = touch ? centre : cursor;
  const LAYERS = [
    ...(tiles.terrain ? [['relief', 'Рельєф']] : []),
    ['conflicts', 'Зони конфліктів'], ['events', 'Події ACLED'], ['graticule', 'Координатна сітка'],
    ...(detailed ? [] : [['labels', 'Назви країн'], ['cities', 'Міста']]),
    ['points', 'Позначки'], ['tracks', 'Об’єкти'], ['trails', 'Сліди руху'],
  ];

  /* ---------- selected item card ---------- */

  const selPoint = sel?.type === 'point' && points.find((p) => p.id === sel.id);
  const selTrack = sel?.type === 'track' && tracks.find((t) => t.id === sel.id);
  const selEvent = sel?.type === 'event' && events.find((e) => e.id === sel.id);
  const selCoord = sel?.type === 'coord' ? sel : selPoint || (selTrack && live[selTrack.id]) || selEvent || null;

  const coordRows = (lat, lon) => (
    <dl className="coords">
      {[['DD', fmtDD(lat, lon)], ['DMS', fmtDMS(lat, lon)], ['MGRS', fmtMGRS(lat, lon)]].map(([k, v]) => (
        <div key={k} className="coords__row">
          <dt>{k}</dt><dd className="vx-mono">{v}</dd>
          <button className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" onClick={() => copy(v)} aria-label={`Копіювати ${k}`} title="Копіювати"><Icon name="copy" /></button>
        </div>
      ))}
    </dl>
  );

  return (
    <div className="page page--map">
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">WGS 84 · {detailed ? 'OpenStreetMap' : 'Natural Earth'}{tiles.terrain ? ' · Copernicus DEM' : ''}</div>
          <h1 className="vx-h1">Карта</h1>
        </div>
        <form className="map-search" onSubmit={search}>
          <div className="vx-search">
            <Icon name="search" />
            <input className="vx-input" value={query} onChange={(e) => { setQuery(e.target.value); setQueryErr(''); }}
              placeholder="Координати, MGRS, місто, країна або позначка" aria-label="Пошук на карті" id="map-query" />
          </div>
          <button className="vx-btn vx-btn--primary">Знайти</button>
        </form>
      </header>
      {queryErr && <div className="vx-error map-err" role="alert">{queryErr}</div>}

      <div className="map-tools">
        <div className="segmented" role="group" aria-label="Режим">
          <button className={mode === 'view' ? 'is-active' : ''} onClick={() => setMode('view')}>Огляд</button>
          <button className={mode === 'mark' ? 'is-active' : ''} onClick={() => setMode('mark')} disabled={!canWrite} title={canWrite ? '' : 'Недостатньо прав'}>Позначка</button>
          <button className={mode === 'measure' ? 'is-active' : ''} onClick={() => { setMode('measure'); setTab('measure'); }}>Вимір</button>
        </div>
        <div className="segmented" role="group" aria-label="Швидкий перехід">
          <button onClick={() => preset('world')}>Світ</button>
          <button onClick={() => preset('europe')}>Європа</button>
          <button onClick={() => preset('ukraine')}>Україна</button>
        </div>
        <div className="map-layers">
          <button className="vx-btn" onClick={() => setLayersOpen((o) => !o)} aria-expanded={layersOpen}><Icon name="layers" /> Шари</button>
          {layersOpen && (
            <div className="map-layers__menu vx-panel">
              {LAYERS.map(([id, name]) => (
                <label key={id} className="check"><input type="checkbox" checked={layers[id]} onChange={(e) => setLayers({ ...layers, [id]: e.target.checked })} /> {name}</label>
              ))}
              <div className="vx-hint map-layers__note">
                {detailed
                  ? `Детальна карта: OpenStreetMap, збірка ${tiles.basemap.build}.`
                  : 'Детальна карта не встановлена на цьому сервері. Показано кордони Natural Earth.'}
                {tiles.terrain ? ` Рельєф: ${tiles.terrain.dataset}.` : ''}
              </div>
            </div>
          )}
        </div>
        <label className="map-sim">
          <span className="vx-hint">Час симуляції</span>
          <select className="vx-select" value={sim} onChange={(e) => setSim(+e.target.value)} aria-label="Швидкість симуляції">
            {SIM.map((m) => <option key={m} value={m}>×{m}</option>)}
          </select>
        </label>
      </div>

      <div className="map-layout">
        <div className={`map-frame vx-panel mode-${mode}`} ref={wrapRef}>
          <div ref={mapDivRef} className="map-gl" onPointerMove={onPointerMove} onPointerDown={onPointerDown} onPointerUp={onPointerUp}
            onPointerLeave={() => !touch && setCursor(null)} role="application" aria-label="Карта" />
          <canvas ref={overlayRef} className="map-overlay" aria-hidden="true" />
          {!ready && <div className="map-loading"><Loader size={48} label="Завантаження карти" /></div>}
          {touch && <div className="map-crosshair" aria-hidden="true" />}
          <div className="map-zoom">
            <button className="vx-btn vx-btn--icon vx-btn--sm" onClick={() => zoomBy(2)} aria-label="Наблизити"><Icon name="plus" /></button>
            <button className="vx-btn vx-btn--icon vx-btn--sm" onClick={() => zoomBy(0.5)} aria-label="Віддалити"><Icon name="minus" /></button>
          </div>
          {layers.conflicts && (
            <button className="map-legend" onClick={() => setTab('conflicts')} title="Показати список зон">
              <i aria-hidden="true" />
              {front.pick === 'builtin'
                ? <>Зони конфліктів · орієнтовно, {CONFLICTS_AS_OF}</>
                : <>Фронт: {SOURCE_NAME[front.pick]} · {fmtDate(front.meta?.sourceDate || front.meta?.updatedAt)}{frontAge > STALE_HOURS && <b className="map-legend__stale"> · застаріло</b>}</>}
            </button>
          )}
          {mode !== 'view' && (
            <div className="map-mode vx-hint">
              {mode === 'mark' ? 'Клацніть на карті, щоб додати позначку' : 'Клацайте точки маршруту — відстань рахується по великому колу'}
              <button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setMode('view')}>Готово</button>
            </div>
          )}
          <div className="map-readout vx-mono" aria-live="off">
            {readout ? <>
              <div><span>{touch ? 'Центр' : 'Курсор'}</span> {fmtDD(readout.lat, readout.lon)}</div>
              <div><span>DMS</span> {fmtDMS(readout.lat, readout.lon)}</div>
              <div><span>MGRS</span> {fmtMGRS(readout.lat, readout.lon)}</div>
              {tiles.terrain && <div><span>Висота</span> {elevation == null ? '—' : `${elevation.toLocaleString('uk-UA')} м`}</div>}
              {!touch && <div><span>Країна</span> {readout.country?.properties.uk ?? 'Відкрите море'}</div>}
              {!touch && layers.conflicts && (() => { const z = zoneAt(zones, readout.lon, readout.lat, readout.country); return z && <div className="map-readout__zone"><span>Зона</span> {z.name}</div>; })()}
            </> : <div className="vx-hint">Наведіть курсор на карту</div>}
          </div>
          <div className="map-scale vx-mono">
            {scale && <><i style={{ width: scale.px }} /> {fmtKm(scale.km)}</>}
            <span className="vx-hint">z {zoom.toFixed(1)}</span>
            {detailLoading && <Loader size={14} label="Детальні кордони" />}
          </div>
        </div>

        <aside className="map-side">
          {selCoord && (
            <Panel className="map-card" title={selPoint ? selPoint.name : selTrack ? selTrack.name : selEvent ? (EVENT_TYPE[selEvent.type] || selEvent.type) : 'Координата'}
              action={<button className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" onClick={() => { setSel(null); setFollow(null); }} aria-label="Закрити"><Icon name="close" /></button>}>
              <div className="stack">
                {selTrack && (() => {
                  const st = live[selTrack.id];
                  return <>
                    <div className="map-card__meta"><span className="vx-tag">{TRACK_KIND[selTrack.kind]}</span><ClassBadge level={selTrack.clearance} /></div>
                    <dl className="meta">
                      <dt>Швидкість</dt><dd className="vx-num">{selTrack.speed} км/год</dd>
                      <dt>Курс</dt><dd className="vx-num">{Math.round(st.heading)}° · {compass(st.heading)}</dd>
                      <dt>До точки</dt><dd className="vx-num">{fmtKm(st.remainingKm)} · {st.etaMin < 60 ? `${Math.round(st.etaMin)} хв` : `${(st.etaMin / 60).toFixed(1)} год`}</dd>
                      <dt>Маршрут</dt><dd className="vx-num">{fmtKm(st.totalKm)}, {selTrack.route.length} точок</dd>
                      <dt>Оновлено</dt><dd>щойно · симуляція ×{sim}</dd>
                    </dl>
                    {coordRows(st.lat, st.lon)}
                    <div className="row-btns">
                      <button className={`vx-btn vx-btn--sm ${follow === selTrack.id ? 'vx-btn--brass' : ''}`} onClick={() => setFollow(follow === selTrack.id ? null : selTrack.id)}>
                        <Icon name="target" /> {follow === selTrack.id ? 'Стежу' : 'Стежити'}
                      </button>
                      <button className="vx-btn vx-btn--sm" onClick={() => flyTo(st.lat, st.lon, Math.max(zoom, 9))}>Центрувати</button>
                    </div>
                  </>;
                })()}
                {selPoint && <>
                  <div className="map-card__meta"><span className="vx-tag">{POINT_KINDS.find((k) => k.id === selPoint.kind)?.name}</span><ClassBadge level={selPoint.clearance} /></div>
                  {selPoint.note && <p className="vx-muted map-card__note">{selPoint.note}</p>}
                  {coordRows(selPoint.lat, selPoint.lon)}
                  <div className="vx-hint">{userById(selPoint.owner)?.name ?? '—'} · {fmtDate(selPoint.at)}</div>
                  <div className="row-btns">
                    <button className="vx-btn vx-btn--sm" onClick={() => flyTo(selPoint.lat, selPoint.lon, Math.max(zoom, detailed ? 14 : 9))}>Центрувати</button>
                    <button className="vx-btn vx-btn--sm" onClick={() => { setMeasure([{ lat: selPoint.lat, lon: selPoint.lon }]); setMode('measure'); setTab('measure'); }}>Виміряти звідси</button>
                    {(perms.map >= 3 || selPoint.owner === me.id) && (
                      <button className="vx-btn vx-btn--sm vx-btn--danger" onClick={() => removePoint(selPoint.id)} onBlur={() => setArmed(false)}>{armed ? 'Точно видалити?' : 'Видалити'}</button>
                    )}
                  </div>
                </>}
                {selEvent && <>
                  <div className="map-card__meta"><span className="vx-tag">ACLED</span><span className="vx-hint">{selEvent.id}</span></div>
                  <dl className="meta">
                    <dt>Дата</dt><dd>{fmtDate(selEvent.date, false)}</dd>
                    <dt>Місце</dt><dd>{[selEvent.location, selEvent.admin1, selEvent.country].filter(Boolean).join(', ')}</dd>
                    <dt>Тип</dt><dd>{selEvent.subType}</dd>
                    <dt>Загиблі</dt><dd className="vx-num">{selEvent.fatalities}</dd>
                  </dl>
                  {selEvent.notes && <p className="vx-muted map-card__note">{selEvent.notes}</p>}
                  {coordRows(selEvent.lat, selEvent.lon)}
                  <div className="vx-hint">Джерело: ACLED, acleddata.com</div>
                </>}
                {sel?.type === 'coord' && <>
                  {(() => {
                    const ctry = countryAt(sel.lon, sel.lat);
                    const z = zoneAt(zones, sel.lon, sel.lat, ctry);
                    return <>
                      <div className="vx-muted">{ctry?.properties.uk ?? 'Відкрите море'}</div>
                      {z && <div className="zone-chip"><i aria-hidden="true" />{z.name}</div>}
                    </>;
                  })()}
                  {coordRows(sel.lat, sel.lon)}
                  <div className="row-btns">
                    {canWrite && <button className="vx-btn vx-btn--sm vx-btn--primary" onClick={() => setDraft({ lat: sel.lat, lon: sel.lon, name: '', kind: 'site', clearance: 0, note: '' })}><Icon name="plus" /> Позначка</button>}
                    <button className="vx-btn vx-btn--sm" onClick={() => { setMeasure([{ lat: sel.lat, lon: sel.lon }]); setMode('measure'); setTab('measure'); }}>Виміряти звідси</button>
                  </div>
                </>}
              </div>
            </Panel>
          )}

          <Panel bodyClass="map-list">
            <nav className="vx-tabs map-tabs" role="tablist">
              {[['tracks', `Об’єкти · ${tracks.length}`], ['points', `Позначки · ${points.length}`], ['conflicts', 'Конфлікти'], ['measure', 'Вимір']].map(([id, l]) => (
                <button key={id} role="tab" aria-selected={tab === id} className={`vx-tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>{l}</button>
              ))}
            </nav>
            {tab === 'tracks' && (
              <div className="list">
                {tracks.map((t) => {
                  const st = live[t.id];
                  return (
                    <button key={t.id} className={`list__row list__row--btn ${sel?.id === t.id ? 'is-sel' : ''}`}
                      onClick={() => { setSel({ type: 'track', id: t.id }); flyTo(st.lat, st.lon, Math.max(zoom, 7)); }}>
                      <span className="list__text"><span>{t.name} {follow === t.id && <span className="vx-tag">стежу</span>}</span>
                        <span className="vx-hint vx-num">{TRACK_KIND[t.kind]} · {t.speed} км/год · {Math.round(st.heading)}° {compass(st.heading)}</span></span>
                      <ClassBadge level={t.clearance} />
                    </button>
                  );
                })}
                {TRACKS.length > tracks.length && <div className="list__row vx-hint">Ще {TRACKS.length - tracks.length} об’єкт(и) — вище вашого допуску</div>}
              </div>
            )}
            {tab === 'points' && (
              <div className="list">
                {points.map((p) => (
                  <button key={p.id} className={`list__row list__row--btn ${sel?.id === p.id ? 'is-sel' : ''}`}
                    onClick={() => { setSel({ type: 'point', id: p.id }); flyTo(p.lat, p.lon, Math.max(zoom, detailed ? 14 : 9)); }}>
                    <span className="list__text"><span>{p.name}</span><span className="vx-hint vx-mono">{fmtDD(p.lat, p.lon)}</span></span>
                    <ClassBadge level={p.clearance} />
                  </button>
                ))}
                {!points.length && <div className="vx-empty">Позначок немає</div>}
                {hiddenPoints > 0 && <div className="list__row vx-hint">Ще {hiddenPoints} — вище вашого допуску</div>}
                {canWrite && <div className="list__row row-btns"><button className="vx-btn vx-btn--sm" onClick={() => setMode('mark')}><Icon name="plus" /> Додати на карті</button></div>}
              </div>
            )}
            {tab === 'conflicts' && (
              <div className="list">
                <SourcesStatus manifest={liveData.manifest} front={front} frontSource={frontSource} setFrontSource={setFrontSource}
                  available={{ deepstate: !!liveData.deepstate, isw: !!liveData.isw }} events={events.length} />
                {zones.map((z) => (
                  <button key={z.id} className="list__row list__row--btn list__row--top"
                    onClick={() => {
                      setLayers((l) => ({ ...l, conflicts: true }));
                      const [[x0, y0], [x1, y1]] = geoBounds(z.feature);
                      fitBounds([x0, y0, x1, y1]);
                    }}>
                    <i className="zone-swatch" aria-hidden="true" />
                    <span className="list__text"><span>{z.name}</span><span className="vx-hint">{z.region} · {z.note}</span></span>
                  </button>
                ))}
              </div>
            )}
            {tab === 'measure' && (
              <div className="list">
                {measure.length === 0 && <div className="vx-empty"><Icon name="ruler" /><div>Увімкніть «Вимір» і клацайте точки на карті.</div></div>}
                {measure.map((q, i) => (
                  <div className="list__row" key={i}>
                    <span className="list__text"><span className="vx-mono">{i + 1}. {fmtDD(q.lat, q.lon)}</span>
                      {i > 0 && <span className="vx-hint vx-num">+{fmtKm(distanceKm(measure[i - 1], q))} · азимут {Math.round(bearing(measure[i - 1], q))}°</span>}</span>
                  </div>
                ))}
                {measure.length > 1 && (
                  <div className="list__row measure-total">
                    <span>Разом</span><b className="vx-num">{fmtKm(measureTotal)}</b>
                  </div>
                )}
                {measure.length > 0 && (
                  <div className="list__row row-btns">
                    <button className="vx-btn vx-btn--sm" onClick={() => setMeasure((m) => m.slice(0, -1))}>Скасувати точку</button>
                    <button className="vx-btn vx-btn--sm" onClick={() => copy(`${fmtKm(measureTotal)}: ${measure.map((q) => fmtDD(q.lat, q.lon)).join(' → ')}`)}>Копіювати</button>
                    <button className="vx-btn vx-btn--sm vx-btn--ghost" onClick={() => setMeasure([])}>Очистити</button>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </aside>
      </div>

      {draft && (
        <Modal onClose={() => setDraft(null)} label="Нова позначка">
          <form onSubmit={savePoint}>
            <div className="vx-drawer__head"><h2 className="vx-h2">Нова позначка</h2></div>
            <div className="vx-drawer__body">
              <div className="vx-mono vx-muted">{fmtDD(draft.lat, draft.lon)} · {fmtMGRS(draft.lat, draft.lon)}</div>
              <div className="vx-field"><label className="vx-label" htmlFor="pt-name">Назва</label>
                <input id="pt-name" className="vx-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus /></div>
              <div className="form-grid">
                <div className="vx-field"><label className="vx-label" htmlFor="pt-kind">Тип</label>
                  <select id="pt-kind" className="vx-select" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                    {POINT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select></div>
                <div className="vx-field"><label className="vx-label" htmlFor="pt-cl">Гриф</label>
                  <select id="pt-cl" className="vx-select" value={draft.clearance} onChange={(e) => setDraft({ ...draft, clearance: +e.target.value })}>
                    {CLEARANCE.filter((c) => c.id <= me.clearance).map((c) => <option key={c.id} value={c.id}>{c.full}</option>)}
                  </select></div>
              </div>
              <div className="vx-field"><label className="vx-label" htmlFor="pt-note">Примітка</label>
                <input id="pt-note" className="vx-input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></div>
            </div>
            <div className="vx-drawer__foot">
              <button type="button" className="vx-btn vx-btn--ghost" onClick={() => setDraft(null)}>Скасувати</button>
              <button className="vx-btn vx-btn--primary" disabled={!draft.name.trim()}>Зберегти</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
