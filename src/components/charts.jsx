// Dashboard charts for SITUATION, in the manner of the business-intelligence platforms: a sparkline for a KPI,
// stacked columns, several lines on one axis, a donut, a heat map and a gauge. Categorical colours come in a fixed
// order (--sit-c1…--sit-c5, validated for colour-blind separation on the dark and the light surface) and follow the
// entity, never its rank; every chart has a hover tooltip and a legend when it has two series or more.
import { useEffect, useRef, useState } from 'react';

export const SERIES = ['var(--sit-c1)', 'var(--sit-c2)', 'var(--sit-c3)', 'var(--sit-c4)', 'var(--sit-c5)'];

function useWidth(min = 160) {
  const ref = useRef(null);
  const [w, setW] = useState(480);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [min]);
  return [ref, w];
}
const niceMax = (v) => { if (v <= 5) return 5; const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p) * p; };

export function Legend({ items }) {
  return (
    <div className="sit-legend">
      {items.map((x, i) => <span key={x.label}><i style={{ background: x.color || SERIES[i] }} />{x.label}</span>)}
    </div>
  );
}

/** A small line under a KPI: its last twelve weeks. */
export function Spark({ data, color = 'var(--sit-c1)' }) {
  const [ref, w] = useWidth(80);
  const h = 36;
  const max = Math.max(1, ...data);
  const x = (i) => (i / Math.max(1, data.length - 1)) * (w - 4) + 2;
  const y = (v) => h - 3 - (v / max) * (h - 8);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <div className="sit-spark" ref={ref} aria-hidden="true">
      <svg width={w} height={h}>
        <path d={`${line}L${x(data.length - 1)},${h}L${x(0)},${h}Z`} style={{ fill: color, opacity: 0.14 }} />
        <path d={line} style={{ stroke: color }} className="sit-spark__line" />
        <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="3" style={{ fill: color }} />
      </svg>
    </div>
  );
}

/** Columns per period, stacked by series: { labels, series: [{ label, data }] }. */
export function Columns({ labels, series, height = 200, unit = '' }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 30, r: 6, t: 10, b: 24 };
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.data[i] || 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const step = (w - pad.l - pad.r) / labels.length;
  const bw = Math.max(4, Math.min(28, step * 0.62));
  const y = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  return (
    <div className="vx-chart" ref={ref}>
      <svg height={height} role="img" aria-label="Стовпчикова діаграма">
        <g className="grid">{[0, max / 2, max].map((t) => <line key={t} x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {[0, max / 2, max].map((t) => <text key={t} x={pad.l - 6} y={y(t) + 4} textAnchor="end">{t}</text>)}
          {labels.map((l, i) => (i % 2 === 1 || i === labels.length - 1) && <text key={i} x={pad.l + step * i + step / 2} y={height - 6} textAnchor="middle">{l}</text>)}
        </g>
        {labels.map((_, i) => {
          let acc = 0;
          const cx = pad.l + step * i + (step - bw) / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + step * i} y={pad.t} width={step} height={height - pad.t - pad.b} fill="transparent" />
              {series.map((s, k) => {
                const v = s.data[i] || 0;
                if (!v) return null;
                const top = y(acc + v), bottom = y(acc);
                acc += v;
                return <rect key={k} x={cx} y={top + 1} width={bw} height={Math.max(1, bottom - top - 2)} rx="2" style={{ fill: SERIES[k] }} opacity={hover == null || hover === i ? 1 : 0.55} />;
              })}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && <Legend items={series} />}
      {hover != null && (
        <div className="vx-tip sit-tip" style={{ left: pad.l + step * hover + step / 2, top: y(totals[hover]) }}>
          <b>{labels[hover]} · {totals[hover]} {unit}</b>
          {series.filter((s) => s.data[hover]).map((s) => <span key={s.label}><i style={{ background: SERIES[series.indexOf(s)] }} />{s.label}: {s.data[hover]}</span>)}
        </div>
      )}
    </div>
  );
}

/** Several lines on one axis (one unit): { labels, series: [{ label, data }] }. */
export function Lines({ labels, series, height = 200, unit = '' }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 30, r: 10, t: 10, b: 24 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.data)));
  const x = (i) => pad.l + (i / Math.max(1, labels.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / (w - pad.l - pad.r)) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };
  return (
    <div className="vx-chart" ref={ref}>
      <svg height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Лінійний графік">
        <g className="grid">{[0, max / 2, max].map((t) => <line key={t} x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {[0, max / 2, max].map((t) => <text key={t} x={pad.l - 6} y={y(t) + 4} textAnchor="end">{t}</text>)}
          {labels.map((l, i) => (i % 2 === 1 || i === labels.length - 1) && <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{l}</text>)}
        </g>
        {series.map((s, k) => (
          <path key={s.label} className="sit-line" style={{ stroke: SERIES[k] }} d={s.data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')} />
        ))}
        {hover != null && <line className="cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} />}
        {hover != null && series.map((s, k) => <circle key={k} cx={x(hover)} cy={y(s.data[hover])} r="4.5" className="sit-dot" style={{ fill: SERIES[k] }} />)}
      </svg>
      {series.length > 1 && <Legend items={series} />}
      {hover != null && (
        <div className="vx-tip sit-tip" style={{ left: x(hover), top: pad.t + 10 }}>
          <b>{labels[hover]}</b>
          {series.map((s, k) => <span key={s.label}><i style={{ background: SERIES[k] }} />{s.label}: {s.data[hover]} {unit}</span>)}
        </div>
      )}
    </div>
  );
}

/** Parts of a whole: [{ id, label, value }], the total in the middle. */
export function Donut({ rows, unit = '', onPick, active }) {
  const [hover, setHover] = useState(null);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const R = 62, r0 = 42, C = 72;
  let a0 = -Math.PI / 2;
  const arc = (a1, a2) => {
    const big = a2 - a1 > Math.PI ? 1 : 0;
    const p = (a, rad) => `${(C + rad * Math.cos(a)).toFixed(2)},${(C + rad * Math.sin(a)).toFixed(2)}`;
    return `M${p(a1, R)}A${R},${R} 0 ${big} 1 ${p(a2, R)}L${p(a2, r0)}A${r0},${r0} 0 ${big} 0 ${p(a1, r0)}Z`;
  };
  const shown = hover != null ? rows[hover] : null;
  return (
    <div className="sit-donut">
      <svg width={C * 2} height={C * 2} role="img" aria-label="Кільцева діаграма">
        {!total && <circle cx={C} cy={C} r={(R + r0) / 2} className="sit-donut__empty" strokeWidth={R - r0} />}
        {total > 0 && rows.map((x, i) => {
          if (!x.value) return null;
          const a1 = a0, a2 = a0 + (x.value / total) * Math.PI * 2 - (rows.filter((y) => y.value).length > 1 ? 0.03 : 0);
          a0 += (x.value / total) * Math.PI * 2;
          return <path key={x.id} d={arc(a1, Math.max(a1 + 0.01, a2))} style={{ fill: SERIES[i % SERIES.length] }} opacity={active && active !== x.id ? 0.35 : hover == null || hover === i ? 1 : 0.6}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={onPick ? () => onPick(x.id) : undefined} className={onPick ? 'is-link' : ''} />;
        })}
        <text x={C} y={C - 2} textAnchor="middle" className="sit-donut__total">{shown ? shown.value : total}</text>
        <text x={C} y={C + 16} textAnchor="middle" className="sit-donut__label">{shown ? `${total ? Math.round((shown.value / total) * 100) : 0}%` : unit || 'усього'}</text>
      </svg>
      <div className="sit-donut__legend">
        {rows.map((x, i) => (
          <button type="button" key={x.id} className={`sit-donut__row ${active === x.id ? 'is-active' : ''}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={onPick ? () => onPick(x.id) : undefined} disabled={!onPick}>
            <i style={{ background: SERIES[i % SERIES.length] }} /><span>{x.label}</span><b className="vx-num">{x.value}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Weekday × hour: how much happened when. `cells[d][h]` counts, d 0 = Monday. */
export function Heat({ cells, unit = '' }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  const L = 26, T = 4, gap = 2;
  const cw = Math.max(6, (w - L) / 24 - gap);
  const ch = 16;
  const max = Math.max(1, ...cells.flat());
  const step = (v) => (v ? Math.min(5, Math.ceil((v / max) * 5)) : 0);
  return (
    <div className="vx-chart" ref={ref}>
      <svg height={T + 7 * (ch + gap) + 18} role="img" aria-label="Теплова карта активності">
        {days.map((d, i) => <text key={d} x={0} y={T + i * (ch + gap) + 12} className="sit-heat__day">{d}</text>)}
        {cells.map((row, d) => row.map((v, h) => (
          <rect key={`${d}-${h}`} x={L + h * (cw + gap)} y={T + d * (ch + gap)} width={cw} height={ch} rx="2" className={`sit-heat__cell s${step(v)}`}
            onMouseEnter={() => setHover({ d, h, v })} onMouseLeave={() => setHover(null)} />
        )))}
        {[0, 6, 12, 18, 23].map((h) => <text key={h} x={L + h * (cw + gap) + cw / 2} y={T + 7 * (ch + gap) + 12} textAnchor="middle" className="sit-heat__day">{h}</text>)}
      </svg>
      {hover && <div className="vx-tip sit-tip" style={{ left: L + hover.h * (cw + gap), top: T + hover.d * (ch + gap) }}><b>{days[hover.d]}, {hover.h}:00</b><span>{hover.v} {unit}</span></div>}
    </div>
  );
}

/** A share against its target, as a half-circle gauge with the status colour of its band. */
export function Gauge({ value, good = 80, warn = 50, label = '' }) {
  const v = Math.max(0, Math.min(100, value));
  const R = 64, C = 76, r0 = 48;
  const a = (p) => Math.PI + (p / 100) * Math.PI;
  const pt = (ang, rad) => `${(C + rad * Math.cos(ang)).toFixed(2)},${(C + rad * Math.sin(ang)).toFixed(2)}`;
  const band = (p1, p2) => `M${pt(a(p1), R)}A${R},${R} 0 0 1 ${pt(a(p2), R)}L${pt(a(p2), r0)}A${r0},${r0} 0 0 0 ${pt(a(p1), r0)}Z`;
  const status = v >= good ? 'good' : v >= warn ? 'warning' : 'critical';
  return (
    <div className="sit-gauge">
      <svg width={C * 2} height={C + 14} role="img" aria-label={`${label}: ${Math.round(v)}%`}>
        <path d={band(0, 100)} className="sit-gauge__track" />
        {v > 0 && <path d={band(0, Math.max(0.5, v))} className={`sit-gauge__fill is-${status}`} />}
        <text x={C} y={C - 4} textAnchor="middle" className="sit-donut__total">{Math.round(v)}%</text>
      </svg>
      <div className={`sit-gauge__state is-${status}`}>{status === 'good' ? '● у нормі' : status === 'warning' ? '▲ нижче цілі' : '■ критично'} · ціль {good}%</div>
    </div>
  );
}

/** Records and their links (the «звідки ми це знаємо» chain), laid out by force; a node opens its record. */
export function Graph({ nodes, edges, open, colorOf, height = 340 }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    let live = true;
    import('d3-force').then(({ forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide }) => {
      const ns = nodes.map((n) => ({ ...n }));
      const ls = edges.map((e) => ({ source: e.a, target: e.b }));
      const sim = forceSimulation(ns).force('link', forceLink(ls).id((d) => d.id).distance(60)).force('charge', forceManyBody().strength(-160))
        .force('center', forceCenter(w / 2, height / 2)).force('collide', forceCollide(16)).stop();
      for (let i = 0; i < 220; i++) sim.tick();
      const fit = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      if (live) setPos(new Map(ns.map((n) => [n.id, { x: fit(n.x, 14, w - 14), y: fit(n.y, 14, height - 14) }])));
    });
    return () => { live = false; };
  }, [nodes, edges, w, height]);
  const deg = new Map();
  for (const e of edges) { deg.set(e.a, (deg.get(e.a) || 0) + 1); deg.set(e.b, (deg.get(e.b) || 0) + 1); }
  const near = hover ? new Set([hover, ...edges.filter((e) => e.a === hover || e.b === hover).flatMap((e) => [e.a, e.b])]) : null;
  return (
    <div className="vx-chart" ref={ref}>
      <svg height={height} role="img" aria-label="Граф зв'язків">
        {pos && edges.map((e, i) => { const a = pos.get(e.a), b = pos.get(e.b); return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`sit-edge ${near && !(near.has(e.a) && near.has(e.b)) ? 'is-dim' : ''}`} /> : null; })}
        {pos && nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const r = 5 + Math.min(7, (deg.get(n.id) || 0) * 1.5);
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} className={`sit-node ${near && !near.has(n.id) ? 'is-dim' : ''}`} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => open(n.to)}>
              <circle r={r} style={{ fill: colorOf(n) }} />
              {(deg.get(n.id) || 0) >= 3 || hover === n.id ? <text y={-r - 4} textAnchor="middle">{n.label.slice(0, 28)}</text> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
