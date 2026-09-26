import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath, geoGraticule, geoCentroid, geoArea, geoContains, geoBounds } from 'd3-geo';
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom';
import { select } from 'd3-selection';
import { feature, mesh } from 'topojson-client';
import world50 from '../data/world-50m.json';
import world110 from '../data/world-110m.json';
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
    others: { type: 'FeatureCollection', features: fc.features.filter((f) => f.id !== '804') },
    borders: mesh(topo, topo.objects.countries, (a, b) => a !== b),
    coast: mesh(topo, topo.objects.countries, (a, b) => a === b),
  };
}
const BASE = prepare(world50);
const LOW = prepare(world110);

function countryAt(lon, lat) {
  for (const f of BASE.fc.features) {
    const [[x0, y0], [x1, y1]] = f.properties.bbox;
    const inLon = x0 <= x1 ? lon >= x0 && lon <= x1 : lon >= x0 || lon <= x1;
    if (!inLon || lat < y0 || lat > y1) continue;
    if (geoContains(f, [lon, lat])) return f;
  }
  return null;
}

// [west, south, east, north]
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
const eventRadius = (e) => 2.5 + Math.min(6, Math.sqrt(e.fatalities || 0));

// Phones report 3× pixel density; 2× is indistinguishable on a map and draws 2.25× fewer pixels.
const pixelRatio = () => Math.min(2, window.devicePixelRatio || 1);
function inView(proj, bbox, w, h) {
  if (!bbox) return true;
  const [[x0, y0], [x1, y1]] = bbox;
  const a = proj([x0, y1]), b = proj([x1, y0]);
  if (!a || !b) return true;
  return !(Math.max(a[0], b[0]) < 0 || Math.min(a[0], b[0]) > w || Math.max(a[1], b[1]) < 0 || Math.min(a[1], b[1]) > h);
}

const PRESETS = {
  world: [-180, -58, 180, 78],
  europe: [-11, 35, 42, 66],
  ukraine: [22.1, 44.3, 40.3, 52.4],
};
const DETAIL_K = 7; // switch to 1:10m borders past this zoom
const SIM = [1, 60, 600];
const LAYERS = [
  ['conflicts', 'Зони конфліктів'], ['events', 'Події ACLED'], ['graticule', 'Координатна сітка'], ['labels', 'Назви країн'], ['cities', 'Міста'],
  ['points', 'Позначки'], ['tracks', 'Об’єкти'], ['trails', 'Сліди руху'],
];
const compass = (deg) => ['Пн', 'ПнСх', 'Сх', 'ПдСх', 'Пд', 'ПдЗх', 'Зх', 'ПнЗх'][Math.round(deg / 45) % 8];

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

export function MapView({ focus, go }) {
  const { state, me, perms, dispatch, userById, toast } = useStore();
  const canWrite = perms.map >= 2;

  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const size = useRef({ w: 800, h: 500 });
  const transform = useRef(zoomIdentity);
  const zoomRef = useRef(null);
  const interacting = useRef(false);
  const lastK = useRef(1);
  const drawn = useRef({ t: zoomIdentity, at: 0 }); // the view the canvas pixels currently show
  const frame = useRef(0);
  const simStart = useRef({ real: Date.now(), sim: Date.now(), mult: 60 });

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cursor, setCursor] = useState(null); // {lat, lon, country}
  const [touch, setTouch] = useState(false);
  const [mode, setMode] = useState('view');
  const [layers, setLayers] = useState({ conflicts: true, events: true, graticule: true, labels: true, cities: true, points: true, tracks: true, trails: true });
  const [layersOpen, setLayersOpen] = useState(false);
  const [sel, setSel] = useState(null); // {type:'point'|'track'|'coord', id?, lat?, lon?}
  const [follow, setFollow] = useState(null);
  const [measure, setMeasure] = useState([]);
  const [query, setQuery] = useState('');
  const [queryErr, setQueryErr] = useState('');
  const [draft, setDraft] = useState(null); // new point form
  const [tab, setTab] = useState('tracks');
  const [sim, setSim] = useState(60);
  const [now, setNow] = useState(Date.now());
  const [zoomK, setZoomK] = useState(1);
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
    ? { ...z, feature: front.fc, bbox: geoBounds(front.fc), note: `Дані ${SOURCE_NAME[front.pick]} станом на ${fmtDate(front.meta?.sourceDate || front.meta?.updatedAt)}.` }
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

  /* ---------- projection & drawing ---------- */

  const projection = useCallback(() => {
    const { w, h } = size.current;
    const t = transform.current;
    return geoMercator()
      .scale((w / (2 * Math.PI)) * t.k)
      .translate([t.x + (t.k * w) / 2, t.y + (t.k * h) / 2])
      .clipExtent([[-2, -2], [w + 2, h + 2]]);
  }, []);

  const draw = useRef(() => {});
  const snapshot = useRef({});
  snapshot.current = { points, tracks, live, sel, layers, measure, detail, cursor, follow, zones, events };

  // The static map (sea, land, borders, conflict zones, events) is rendered into an offscreen canvas and
  // reused until the view, theme, layers or data change; the one-second track ticks only redraw overlays.
  const base = useRef({ canvas: null, key: '', zones: null, events: null, t: null, at: 0 });

  draw.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.transform = '';
    drawn.current = { t: transform.current, at: performance.now() };
    const { w, h } = size.current;
    const dpr = pixelRatio();
    const ctx = canvas.getContext('2d');
    const css = getComputedStyle(canvas);
    const c = (n) => css.getPropertyValue(`--${n}`).trim();
    const col = {
      sea: c('surface'), land: c('surface-3'), ua: c('line-strong'), border: c('line-strong'), coast: c('ink-faint'),
      grid: c('line'), conflict: c('conflict'), ink: c('ink'), ink2: c('ink-2'), ink3: c('ink-3'), brass: c('brass'), bg: c('bg'),
    };
    const s = snapshot.current;
    const t = transform.current;
    const k = t.k;
    const moving = interacting.current;
    const proj = projection();
    // Level of detail: coarse borders and lower resolution while the map moves, full detail at rest.
    const geo = moving ? (k < 4 ? LOW : BASE) : (s.detail && k >= DETAIL_K ? s.detail : k < 1.6 ? LOW : BASE);
    const baseRes = moving ? Math.min(dpr, 1) : dpr;

    const b = base.current;
    if (!b.canvas) b.canvas = document.createElement('canvas');
    const key = [t.k, t.x, t.y, w, h, baseRes, geo === LOW ? 'l' : geo === BASE ? 'm' : 'h', col.sea, col.land, col.conflict,
      s.layers.graticule, s.layers.conflicts, s.layers.events, s.sel?.type === 'event' ? s.sel.id : ''].join('|');
    const stale = key !== b.key || b.zones !== s.zones || b.events !== s.events;
    // During a gesture, keep moving the last bitmap and re-render it at most ~4 times a second.
    const ratio = b.t ? t.k / b.t.k : 1;
    const reuse = moving && b.t && performance.now() - b.at < 250 && ratio > 0.5 && ratio < 2;
    if (stale && !reuse) {
      b.key = key; b.zones = s.zones; b.events = s.events; b.t = t; b.at = performance.now();
      const bc = b.canvas;
      if (bc.width !== Math.round(w * baseRes) || bc.height !== Math.round(h * baseRes)) { bc.width = Math.round(w * baseRes); bc.height = Math.round(h * baseRes); }
      const g = bc.getContext('2d');
      g.setTransform(baseRes, 0, 0, baseRes, 0, 0);
      const bpath = geoPath(proj, g);
      g.fillStyle = col.sea;
      g.fillRect(0, 0, w, h);
      if (s.layers.graticule) {
        const step = k >= 40 ? 1 : k >= 12 ? 2 : k >= 4 ? 5 : 15;
        g.beginPath();
        bpath(geoGraticule().step([step, step]).extentMinor([[-180, -85], [180, 85]])());
        g.strokeStyle = col.grid; g.lineWidth = 1; g.stroke();
      }
      g.beginPath(); bpath(geo.others); g.fillStyle = col.land; g.fill();
      g.beginPath(); bpath(geo.ua); g.fillStyle = col.ua; g.fill();
      if (s.layers.conflicts) {
        const paint = (f) => {
          g.beginPath(); bpath(f);
          g.fillStyle = col.conflict; g.globalAlpha = 0.34; g.fill();
          g.globalAlpha = 0.9; g.lineWidth = 1.2; g.strokeStyle = col.conflict; g.stroke();
          g.globalAlpha = 1;
        };
        // Country-wide zones need no clipping; the rest share one clip per kind instead of one per zone.
        for (const z of s.zones) if (z.country) { const f = geo.fc.features.find((x) => x.id === z.country); if (f) paint(f); }
        for (const kind of ['ukraine', 'land']) {
          const list = s.zones.filter((z) => z.clip === kind && inView(proj, z.bbox, w, h));
          if (!list.length) continue;
          g.save();
          g.beginPath(); bpath(geo.ua); if (kind === 'land') bpath(geo.others); g.clip();
          list.forEach((z) => paint(z.feature));
          g.restore();
        }
      }
      g.beginPath(); bpath(geo.borders); g.strokeStyle = col.border; g.lineWidth = 0.8; g.stroke();
      if (s.layers.events && s.events.length) {
        for (const e of s.events) {
          const p = proj([e.lon, e.lat]);
          if (!p || p[0] < -10 || p[1] < -10 || p[0] > w + 10 || p[1] > h + 10) continue;
          const active = s.sel?.type === 'event' && s.sel.id === e.id;
          g.beginPath(); g.arc(p[0], p[1], eventRadius(e) + (active ? 2 : 0), 0, Math.PI * 2);
          g.fillStyle = active ? col.brass : col.conflict; g.globalAlpha = active ? 1 : 0.8; g.fill(); g.globalAlpha = 1;
          g.lineWidth = 1; g.strokeStyle = col.sea; g.stroke();
        }
      }
      g.beginPath(); bpath(geo.coast); g.strokeStyle = col.coast; g.lineWidth = 0.8; g.stroke();
      g.beginPath(); bpath(geo.ua); g.strokeStyle = col.ink3; g.lineWidth = 1.2; g.stroke();
    }

    // Place the bitmap where its view now sits: screen' = r·screen + (t − r·t₀).
    const r = t.k / b.t.k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (r !== 1 || t.x !== b.t.x || t.y !== b.t.y) { ctx.fillStyle = col.sea; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.setTransform(dpr * r, 0, 0, dpr * r, dpr * (t.x - r * b.t.x), dpr * (t.y - r * b.t.y));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(b.canvas, 0, 0, w, h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const path = geoPath(proj, ctx);

    if (!moving && s.cursor?.country && s.cursor.country.id !== '804') {
      const hov = geo.fc.features.find((f) => f.id === s.cursor.country.id && f.properties.name === s.cursor.country.properties.name);
      if (hov) { ctx.beginPath(); path(hov); ctx.fillStyle = col.ink; ctx.globalAlpha = 0.06; ctx.fill(); ctx.globalAlpha = 1; }
    }

    const taken = [];
    const free = (x, y, wd, ht) => {
      const r = [x - 2, y - 2, x + wd + 2, y + ht + 2];
      if (r[0] < 0 || r[1] < 0 || r[2] > w || r[3] > h) return false;
      if (taken.some((t) => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) return false;
      taken.push(r);
      return true;
    };
    const label = (text, x, y, color, font = '500 11px Inter, system-ui, sans-serif') => {
      ctx.font = font;
      const tw = ctx.measureText(text).width;
      if (!free(x, y - 9, tw, 12)) return;
      ctx.lineWidth = 3; ctx.strokeStyle = col.sea; ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color; ctx.fillText(text, x, y);
    };

    // Selected / tracked things first so their labels win collisions.
    const markers = [];
    if (s.layers.tracks) {
      for (const t of s.tracks) {
        const st = s.live[t.id];
        const p = proj([st.lon, st.lat]);
        if (!p) continue;
        const active = s.sel?.type === 'track' && s.sel.id === t.id;
        if (s.layers.trails && st.trail.length > 1) {
          ctx.beginPath();
          path({ type: 'LineString', coordinates: st.trail.map((q) => [q.lon, q.lat]) });
          ctx.strokeStyle = active ? col.brass : col.ink3;
          ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke(); ctx.globalAlpha = 1;
        }
        if (active) {
          ctx.beginPath();
          path({ type: 'LineString', coordinates: t.route.map(([la, lo]) => [lo, la]) });
          ctx.strokeStyle = col.ink3; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
        }
        const back = st.trail[1] ? proj([st.trail[1].lon, st.trail[1].lat]) : null;
        const ang = back && (back[0] !== p[0] || back[1] !== p[1]) ? Math.atan2(p[1] - back[1], p[0] - back[0]) : ((st.heading - 90) * Math.PI) / 180;
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath();
        ctx.fillStyle = active ? col.brass : col.ink; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = col.sea; ctx.stroke();
        ctx.restore();
        markers.push({ text: t.name, x: p[0] + 11, y: p[1] + 4, color: active ? col.brass : col.ink, font: '600 11px Inter, system-ui, sans-serif', always: active || k >= 3.5 });
      }
    }
    if (s.layers.points) {
      for (const pt of s.points) {
        const p = proj([pt.lon, pt.lat]);
        if (!p) continue;
        const active = s.sel?.type === 'point' && s.sel.id === pt.id;
        const r = pt.kind === 'wp' ? 4 : 6;
        ctx.beginPath(); ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0] + r, p[1]); ctx.lineTo(p[0], p[1] + r); ctx.lineTo(p[0] - r, p[1]); ctx.closePath();
        if (pt.kind === 'obs') { ctx.fillStyle = col.sea; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = active ? col.brass : col.ink; ctx.stroke(); }
        else { ctx.fillStyle = active ? col.brass : col.ink; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = col.sea; ctx.stroke(); }
        markers.push({ text: pt.name, x: p[0] + 9, y: p[1] + 4, color: active ? col.brass : col.ink2, always: active || k >= 5 });
      }
    }
    // Measurement line
    if (s.measure.length) {
      ctx.beginPath();
      path({ type: 'LineString', coordinates: s.measure.map((q) => [q.lon, q.lat]) });
      ctx.strokeStyle = col.brass; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      s.measure.forEach((q, i) => {
        const p = proj([q.lon, q.lat]);
        if (!p) return;
        ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = col.sea; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col.brass; ctx.stroke();
        if (i === s.measure.length - 1 && i > 0) {
          const total = s.measure.slice(1).reduce((a, b, j) => a + distanceKm(s.measure[j], b), 0);
          markers.unshift({ text: fmtKm(total), x: p[0] + 9, y: p[1] - 8, color: col.brass, font: '600 12px Inter, system-ui, sans-serif', always: true });
        }
      });
    }
    // Inspected coordinate
    if (s.sel?.type === 'coord') {
      const p = proj([s.sel.lon, s.sel.lat]);
      if (p) {
        ctx.strokeStyle = col.brass; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p[0] - 15, p[1]); ctx.lineTo(p[0] - 5, p[1]); ctx.moveTo(p[0] + 5, p[1]); ctx.lineTo(p[0] + 15, p[1]);
        ctx.moveTo(p[0], p[1] - 15); ctx.lineTo(p[0], p[1] - 5); ctx.moveTo(p[0], p[1] + 5); ctx.lineTo(p[0], p[1] + 15); ctx.stroke();
      }
    }
    for (const m of markers) if (m.always) label(m.text, m.x, m.y, m.color, m.font);

    if (s.layers.cities) {
      for (const city of CITIES) {
        if (city.tier === 2 && k < 7) continue;
        if (city.tier === 1 && k < 2.2 && city.name !== 'Київ') continue;
        const p = proj([city.lon, city.lat]);
        if (!p) continue;
        ctx.beginPath(); ctx.arc(p[0], p[1], city.name === 'Київ' ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = col.ink2; ctx.fill();
        label(city.name, p[0] + 6, p[1] + 4, col.ink2);
      }
    }
    if (s.layers.labels && !moving) { // skipped while panning: 250 label placements per frame add up on phones
      ctx.textAlign = 'left';
      for (const f of geo.fc.features) {
        const p = proj(f.properties.label);
        if (!p) continue;
        const [[x0, y0], [x1, y1]] = f.properties.bbox;
        const a = proj([x0, y1]), b = proj([x1, y0]);
        const span = a && b ? Math.abs(b[0] - a[0]) : 0;
        if (span < 70 && !(f.id === '804' && span > 30)) continue;
        const text = f.properties.uk.toUpperCase();
        ctx.font = '600 10px Inter, system-ui, sans-serif';
        const tw = ctx.measureText(text).width;
        label(text, p[0] - tw / 2, p[1] + 4, f.id === '804' ? col.ink2 : col.ink3, '600 10px Inter, system-ui, sans-serif');
      }
    }
  };

  // Data ticks wait while a finger is on the map (the gesture end repaints); `force` is for the gesture itself.
  const requestDraw = useCallback((force) => {
    if (interacting.current && force !== true) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => draw.current());
  }, []);

  /* ---------- setup: canvas size + zoom behaviour ---------- */

  const setTransform = useCallback((target, duration = 0) => {
    const zb = zoomRef.current;
    const sel = select(canvasRef.current);
    // zoom.transform() skips the pan/zoom limits, so clamp the target to the world first.
    const { w: vw, h: vh } = size.current;
    const [k0, k1] = zb.scaleExtent();
    const clampedK = zoomIdentity.translate(target.x, target.y).scale(Math.min(k1, Math.max(k0, target.k)));
    const t = zb.constrain()(clampedK, [[0, 0], [vw, vh]], zb.translateExtent());
    if (!duration) { zb.transform(sel, t); return; }
    const from = transform.current;
    const t0 = performance.now();
    const step = (ts) => {
      const e = Math.min(1, (ts - t0) / duration);
      const q = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
      const k = Math.exp(Math.log(from.k) + (Math.log(t.k) - Math.log(from.k)) * q);
      // interpolate the map centre, not the raw translation, so the flight stays on target
      const { w, h } = size.current;
      const cx0 = (w / 2 - from.x) / from.k, cy0 = (h / 2 - from.y) / from.k;
      const cx1 = (w / 2 - t.x) / t.k, cy1 = (h / 2 - t.y) / t.k;
      const cx = cx0 + (cx1 - cx0) * q, cy = cy0 + (cy1 - cy0) * q;
      zb.transform(sel, zoomIdentity.translate(w / 2 - cx * k, h / 2 - cy * k).scale(k));
      if (e < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  const flyTo = useCallback((lat, lon, k = transform.current.k, duration = 700) => {
    const { w, h } = size.current;
    const base = geoMercator().scale(w / (2 * Math.PI)).translate([w / 2, h / 2]);
    const [bx, by] = base([lon, lat]);
    setTransform(zoomIdentity.translate(w / 2 - k * bx, h / 2 - k * by).scale(k), duration);
  }, [setTransform]);

  // Frame a lon/lat box in the current view, whatever the screen size.
  const fitBounds = useCallback(([w0, s0, e0, n0], duration = 700) => {
    const { w, h } = size.current;
    const base = geoMercator().scale(w / (2 * Math.PI)).translate([w / 2, h / 2]);
    const east = e0 < w0 ? e0 + 360 : e0;
    const [x0, y0] = base([w0, n0]);
    const [x1, y1] = base([east, s0]);
    const k = Math.min(1200, Math.max(1, 0.9 * Math.min(w / (x1 - x0), h / (y1 - y0))));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    setTransform(zoomIdentity.translate(w / 2 - k * cx, h / 2 - k * cy).scale(k), duration);
  }, [setTransform]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    let idle;
    const zb = d3zoom()
      .scaleExtent([1, 1200])
      .on('start', () => { interacting.current = true; })
      .on('zoom', (e) => {
        transform.current = e.transform;
        // Re-rendering the page on every pinch frame is what phones feel; update the readout in 5% steps.
        if (Math.abs(Math.log(e.transform.k / lastK.current)) > 0.05) { lastK.current = e.transform.k; setZoomK(e.transform.k); }
        if (!e.sourceEvent) { requestDraw(true); return; }
        // Finger or mouse gesture: move the drawn pixels on the GPU and repaint only a few times a second.
        const d = drawn.current.t, t = e.transform, r = t.k / d.k;
        canvas.style.transformOrigin = '0 0';
        canvas.style.transform = `translate(${t.x - r * d.x}px, ${t.y - r * d.y}px) scale(${r})`;
        // Repaint mid-gesture only when blank edges would start to show.
        const { w, h } = size.current;
        const tx = t.x - r * d.x, ty = t.y - r * d.y;
        const exposed = r < 0.75 || r > 1.8 || Math.abs(tx + (r - 1) * w / 2) > w * 0.35 || Math.abs(ty + (r - 1) * h / 2) > h * 0.35;
        if (exposed && performance.now() - drawn.current.at > 300) requestDraw(true);
      })
      .on('end', (e) => {
        lastK.current = e.transform.k;
        setZoomK(e.transform.k);
        interacting.current = false;
        clearTimeout(idle);
        idle = setTimeout(() => requestDraw(), 60);
      });
    zoomRef.current = zb;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const w = Math.max(200, Math.round(r.width)), h = Math.max(200, Math.round(r.height));
      const dpr = pixelRatio();
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      size.current = { w, h };
      // The Mercator world is a w × w square centred vertically; keep it covering the view.
      zb.scaleExtent([Math.max(1, h / w), 1200]).translateExtent([[0, h / 2 - w / 2], [w, h / 2 + w / 2]]).extent([[0, 0], [w, h]]);
      zb.transform(select(canvas), transform.current);
      requestDraw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    select(canvas).call(zb).on('dblclick.zoom', null);
    resize();
    return () => { ro.disconnect(); select(canvas).on('.zoom', null); clearTimeout(idle); };
  }, [requestDraw]);

  // First view: Ukraine, or the linked object.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = focus && TRACKS.find((x) => x.id === focus);
    const p = focus && state.points.find((x) => x.id === focus);
    if (t && t.clearance <= me.clearance) { const st = trackState(t, simNow()); setSel({ type: 'track', id: t.id }); flyTo(st.lat, st.lon, 14, 0); }
    else if (p && p.clearance <= me.clearance) { setSel({ type: 'point', id: p.id }); setTab('points'); flyTo(p.lat, p.lon, 16, 0); }
    else fitBounds(PRESETS.ukraine, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the 1:10m borders the first time the map is zoomed in.
  useEffect(() => {
    if (zoomK < DETAIL_K || detail || detailLoading) return;
    setDetailLoading(true);
    import('../data/world-10m.json')
      .then((m) => setDetail(prepare(m.default)))
      .catch(() => toast('Не вдалося завантажити детальні кордони'))
      .finally(() => setDetailLoading(false));
  }, [zoomK, detail, detailLoading, toast]);

  // Follow a moving object.
  useEffect(() => {
    if (!follow) return;
    const st = live[follow];
    if (st) flyTo(st.lat, st.lon, transform.current.k, 0);
  }, [follow, live, flyTo]);

  useEffect(() => { requestDraw(); }, [points, tracks, live, sel, layers, measure, detail, cursor, requestDraw, state.settings.theme]);

  /* ---------- pointer ---------- */

  const hover = useRef(0);
  const onMove = (e) => {
    if (e.pointerType === 'touch') { setTouch(true); return; }
    const r = canvasRef.current.getBoundingClientRect();
    const xy = [e.clientX - r.left, e.clientY - r.top];
    cancelAnimationFrame(hover.current);
    hover.current = requestAnimationFrame(() => {
      const ll = projection().invert(xy);
      if (!ll || Math.abs(ll[1]) > 85.05) { setCursor(null); return; }
      setCursor({ lon: ll[0], lat: ll[1], country: countryAt(ll[0], ll[1]) });
    });
  };

  const hit = (xy) => {
    const proj = projection();
    let best = null, bestD = 14;
    if (layers.tracks) for (const t of tracks) {
      const p = proj([live[t.id].lon, live[t.id].lat]);
      const d = p && Math.hypot(p[0] - xy[0], p[1] - xy[1]);
      if (d < bestD) { bestD = d; best = { type: 'track', id: t.id }; }
    }
    if (layers.points) for (const pt of points) {
      const p = proj([pt.lon, pt.lat]);
      const d = p && Math.hypot(p[0] - xy[0], p[1] - xy[1]);
      if (d < bestD) { bestD = d; best = { type: 'point', id: pt.id }; }
    }
    if (layers.events) for (const e of events) {
      const p = proj([e.lon, e.lat]);
      const d = p && Math.hypot(p[0] - xy[0], p[1] - xy[1]);
      if (d < bestD) { bestD = d; best = { type: 'event', id: e.id }; }
    }
    return best;
  };

  const onClick = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const xy = [e.clientX - r.left, e.clientY - r.top];
    const ll = projection().invert(xy);
    if (!ll || Math.abs(ll[1]) > 85.05) return;
    const at = { lat: ll[1], lon: ((ll[0] + 540) % 360) - 180 };
    if (mode === 'measure') { setMeasure((m) => [...m, at]); setTab('measure'); return; }
    if (mode === 'mark') { setDraft({ ...at, name: '', kind: 'site', clearance: 0, note: '' }); return; }
    const h = hit(xy);
    setFollow(null);
    if (h) { setSel(h); setTab(h.type === 'track' ? 'tracks' : h.type === 'event' ? 'conflicts' : 'points'); }
    else setSel({ type: 'coord', ...at });
    setArmed(false);
  };

  /* ---------- actions ---------- */

  const copy = async (text) => { toast((await copyText(text)) ? `Скопійовано: ${text}` : 'Не вдалося скопіювати'); };

  const search = (e) => {
    e.preventDefault();
    setQueryErr('');
    const q = query.trim();
    if (!q) return;
    const c = parseCoords(q);
    if (c) {
      setSel({ type: 'coord', ...c });
      flyTo(c.lat, c.lon, Math.max(transform.current.k, 24));
      dispatch({ type: 'map/log', text: `Пошук координат ${fmtDD(c.lat, c.lon)}` });
      return;
    }
    const low = q.toLowerCase();
    const city = CITIES.find((x) => x.name.toLowerCase().startsWith(low));
    if (city) { setSel({ type: 'coord', lat: city.lat, lon: city.lon }); flyTo(city.lat, city.lon, Math.max(transform.current.k, 30)); return; }
    const pt = points.find((x) => x.name.toLowerCase().includes(low));
    if (pt) { setSel({ type: 'point', id: pt.id }); setTab('points'); flyTo(pt.lat, pt.lon, Math.max(transform.current.k, 20)); return; }
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

  const zoomBy = (f) => setTransform(transform.current.scale(f), 250);
  const preset = (p) => { setFollow(null); fitBounds(PRESETS[p]); };

  const measureTotal = measure.slice(1).reduce((a, b, i) => a + distanceKm(measure[i], b), 0);

  // Scale bar: km per pixel at the map centre.
  const scale = useMemo(() => {
    const { w, h } = size.current;
    const ll = projection().invert([w / 2, h / 2]);
    if (!ll) return null;
    const kmPerPx = (2 * Math.PI * 6371 * Math.cos((ll[1] * Math.PI) / 180)) / ((w / (2 * Math.PI)) * zoomK * 2 * Math.PI);
    const target = kmPerPx * 100;
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const nice = [1, 2, 5, 10].map((m) => m * pow).filter((v) => v <= target).pop() || pow;
    return { km: nice, px: nice / kmPerPx };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomK, now, cursor]);

  const centre = touch ? (() => { const { w, h } = size.current; const ll = projection().invert([w / 2, h / 2]); return ll ? { lon: ll[0], lat: ll[1] } : null; })() : null;
  const readout = touch ? centre : cursor;

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
          <div className="vx-eyebrow">WGS 84 · Меркатор · Natural Earth</div>
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
          <canvas ref={canvasRef} className="map-canvas" onPointerMove={onMove} onPointerDown={(e) => e.pointerType === 'touch' && setTouch(true)} onClick={onClick}
            onPointerLeave={() => !touch && setCursor(null)} aria-label="Карта світу" role="img" />
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
              {!touch && <div><span>Країна</span> {readout.country?.properties.uk ?? 'Відкрите море'}</div>}
              {!touch && layers.conflicts && (() => { const z = zoneAt(zones, readout.lon, readout.lat, readout.country); return z && <div className="map-readout__zone"><span>Зона</span> {z.name}</div>; })()}
            </> : <div className="vx-hint">Наведіть курсор на карту</div>}
          </div>
          <div className="map-scale vx-mono">
            {scale && <><i style={{ width: scale.px }} /> {fmtKm(scale.km)}</>}
            <span className="vx-hint">×{zoomK < 10 ? zoomK.toFixed(1) : Math.round(zoomK)}</span>
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
                      <button className="vx-btn vx-btn--sm" onClick={() => flyTo(st.lat, st.lon, Math.max(zoomK, 14))}>Центрувати</button>
                    </div>
                  </>;
                })()}
                {selPoint && <>
                  <div className="map-card__meta"><span className="vx-tag">{POINT_KINDS.find((k) => k.id === selPoint.kind)?.name}</span><ClassBadge level={selPoint.clearance} /></div>
                  {selPoint.note && <p className="vx-muted map-card__note">{selPoint.note}</p>}
                  {coordRows(selPoint.lat, selPoint.lon)}
                  <div className="vx-hint">{userById(selPoint.owner)?.name ?? '—'} · {fmtDate(selPoint.at)}</div>
                  <div className="row-btns">
                    <button className="vx-btn vx-btn--sm" onClick={() => flyTo(selPoint.lat, selPoint.lon, Math.max(zoomK, 16))}>Центрувати</button>
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
                      onClick={() => { setSel({ type: 'track', id: t.id }); flyTo(st.lat, st.lon, Math.max(zoomK, 12)); }}>
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
                    onClick={() => { setSel({ type: 'point', id: p.id }); flyTo(p.lat, p.lon, Math.max(zoomK, 16)); }}>
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
