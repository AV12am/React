// «Зв'язки»: the ownership graph of the companies register (src/lib/orggraph.js).
// Owners are rhombs (burgundy for the state), companies are dots. Click an owner to light up
// everything it holds; click a company to open its card. Drag to pan, wheel or buttons to zoom.
import { useEffect, useMemo, useRef, useState } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';
import { useStore } from '../store.jsx';
import { Icon } from '../components/Icon.jsx';
import { buildGraph } from '../lib/orggraph.js';

const W = 1000, H = 680;

function layout(graph) {
  const nodes = graph.nodes.map((n) => ({ ...n }));
  const links = graph.links.map((l) => ({ ...l }));
  const deg = new Map();
  for (const l of links) { deg.set(l.source, (deg.get(l.source) || 0) + 1); deg.set(l.target, (deg.get(l.target) || 0) + 1); }
  for (const n of nodes) n.deg = deg.get(n.id) || 0;
  const sim = forceSimulation(nodes)
    .force('link', forceLink(links).id((d) => d.id).distance((l) => (l.kind === 'body' ? 80 : 60)).strength(0.7))
    .force('charge', forceManyBody().strength((d) => (d.kind === 'company' ? -60 : -260)))
    .force('collide', forceCollide().radius((d) => (d.kind === 'company' ? 14 : 26)))
    .force('center', forceCenter(W / 2, H / 2))
    .force('x', forceX(W / 2).strength(0.04))
    .force('y', forceY(H / 2).strength(0.06))
    .stop();
  for (let i = 0; i < 320; i++) sim.tick();
  return { nodes, links };
}

export function CompanyGraph({ orgs, go }) {
  const { me } = useStore();
  const [hideState, setHideState] = useState(false);
  const [focus, setFocus] = useState(null); // node id
  const [hover, setHover] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef(null);
  const svg = useRef(null);
  const visible = orgs.filter((o) => (o.clearance ?? 0) <= me.clearance);
  const { nodes, links } = useMemo(() => layout(buildGraph(visible, { hideState })), [visible.length, hideState]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFocus(null); }, [hideState]);

  // What lights up: for an owner — everything it holds (through the state's bodies too) and their subsidiaries;
  // for a company — its owners, the companies they hold, its parent and subsidiaries.
  const near = useMemo(() => {
    const id = focus || hover;
    if (!id) return null;
    const out = (n) => links.filter((l) => l.source.id === n).map((l) => l.target);
    const into = (n) => links.filter((l) => l.target.id === n).map((l) => l.source);
    const s = new Set([id]);
    const hold = (n) => { for (const t of out(n)) { if (s.has(t.id)) continue; s.add(t.id); if (t.kind !== 'company' || links.some((l) => l.kind === 'parent' && l.source.id === t.id)) hold(t.id); } };
    const node = nodes.find((n) => n.id === id);
    if (!node) return null;
    if (node.kind !== 'company') hold(id);
    else {
      for (const o of into(id)) {
        s.add(o.id);
        if (o.kind !== 'company') for (const t of out(o.id)) s.add(t.id);
      }
      for (const t of out(id)) s.add(t.id);
    }
    return s;
  }, [focus, hover, links, nodes]);

  // Focusing zooms to what it lights up.
  useEffect(() => {
    if (!focus || !near) return;
    const pts = nodes.filter((n) => near.has(n.id));
    if (pts.length < 2) return;
    const xs = pts.map((n) => n.x), ys = pts.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.max(0.8, Math.min(3, 0.75 * Math.min(W / Math.max(60, x1 - x0), H / Math.max(60, y1 - y0))));
    setView({ k, x: W / 2 - (x0 + x1) / 2, y: H / 2 - (y0 + y1) / 2 });
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoom = (f) => setView((v) => ({ ...v, k: Math.min(4, Math.max(0.5, v.k * f)) }));
  const onWheel = (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); };
  useEffect(() => {
    const el = svg.current;
    el?.addEventListener('wheel', onWheel, { passive: false });
    return () => el?.removeEventListener('wheel', onWheel);
  });
  const toSvg = (dx, dy) => { const r = svg.current.getBoundingClientRect(); return [dx * (W / r.width) / view.k, dy * (H / r.height) / view.k]; };
  const down = (e) => { if (e.target.closest('.og-node')) return; drag.current = { x: e.clientX, y: e.clientY, v: view }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!drag.current) return; const [dx, dy] = toSvg(e.clientX - drag.current.x, e.clientY - drag.current.y); setView({ ...drag.current.v, x: drag.current.v.x + dx, y: drag.current.v.y + dy }); };
  const up = () => { drag.current = null; };

  const focused = nodes.find((n) => n.id === focus);
  const holding = focused ? nodes.filter((n) => n.kind === 'company' && near?.has(n.id) && n.id !== focus) : [];
  const owners = nodes.filter((n) => n.kind !== 'company').sort((a, b) => b.deg - a.deg);
  const tf = `translate(${W / 2} ${H / 2}) scale(${view.k}) translate(${-W / 2 + view.x} ${-H / 2 + view.y})`;
  const showLabel = (n) => (near ? near.has(n.id) : n.kind !== 'company' || view.k >= 1.8);
  // Text and marks keep their on-screen size while zooming.
  const fs = (n) => (n.kind === 'company' ? 11 : 12) / view.k;
  const scale = 1 / Math.sqrt(view.k);

  return (
    <div className="og">
      <div className="toolbar">
        <label className="check"><input type="checkbox" checked={hideState} onChange={(e) => setHideState(e.target.checked)} /> Без держави</label>
        <span className="vx-hint">{nodes.filter((n) => n.kind === 'company').length} компаній · {owners.length} власників</span>
        <span className="grow" />
        <button className="vx-btn vx-btn--icon vx-btn--sm" onClick={() => zoom(1.25)} aria-label="Наблизити"><Icon name="plus" /></button>
        <button className="vx-btn vx-btn--icon vx-btn--sm" onClick={() => zoom(0.8)} aria-label="Віддалити"><Icon name="minus" /></button>
        <button className="vx-btn vx-btn--sm vx-btn--ghost" onClick={() => { setView({ x: 0, y: 0, k: 1 }); setFocus(null); }}>Скинути</button>
      </div>
      <div className="og__body">
        <svg ref={svg} className="og__svg vx-panel" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Граф власності компаній"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={(e) => { if (!e.target.closest('.og-node')) setFocus(null); }}>
          <g transform={tf}>
            {links.map((l, i) => (
              <line key={i} className={`og-link og-link--${l.kind} ${near && !(near.has(l.source.id) && near.has(l.target.id)) ? 'is-dim' : ''}`}
                x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y} style={{ strokeWidth: 1 / view.k }} />
            ))}
            {nodes.map((n) => {
              const dim = near && !near.has(n.id);
              const r = (n.kind === 'company' ? 4 + Math.min(4, n.deg) : 8 + Math.min(10, n.deg * 0.7)) * scale;
              return (
                <g key={n.id} className={`og-node og-node--${n.kind} ${dim ? 'is-dim' : ''} ${focus === n.id ? 'is-focus' : ''}`} transform={`translate(${n.x} ${n.y})`}
                  onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}
                  onClick={() => (n.kind === 'company' && focus === n.id ? go('divisions', 'int', `companies:${n.id}`) : setFocus(n.id))}
                  tabIndex={0} role="button" aria-label={n.name}
                  onKeyDown={(e) => { if (e.key === 'Enter') setFocus(n.id); }}>
                  {n.kind === 'company' ? <circle r={r} /> : <rect x={-r / 1.4} y={-r / 1.4} width={r * 1.41} height={r * 1.41} transform="rotate(45)" />}
                  {showLabel(n) && <text y={-r - 4 / view.k} textAnchor="middle" style={{ fontSize: fs(n), strokeWidth: 3 / view.k }}>{n.name}</text>}
                </g>
              );
            })}
          </g>
        </svg>
        <aside className="og__side vx-panel">
          {focused ? (
            <div className="stack">
              <div className="vx-eyebrow">{focused.kind === 'company' ? 'Компанія' : 'Власник'}</div>
              <div className="vx-h2">{focused.name}</div>
              {focused.kind === 'company' && <button className="vx-btn vx-btn--sm" onClick={() => go('divisions', 'int', `companies:${focused.id}`)}>Відкрити картку <Icon name="chevron" /></button>}
              {focused.kind === 'company' && focused.org?.owners && <p className="vx-hint">{focused.org.owners}</p>}
              <div className="vx-eyebrow">{focused.kind === 'company' ? 'Пов’язані компанії' : 'Що належить'} · {holding.length}</div>
              <div className="list">
                {holding.map((n) => <button key={n.id} className="list__row list__row--btn" onClick={() => setFocus(n.id)}>{n.name}</button>)}
              </div>
            </div>
          ) : (
            <div className="stack">
              <div className="vx-eyebrow">Власники</div>
              <div className="vx-hint">Оберіть власника — граф підсвітить усе, що йому належить. Другий клік по компанії відкриває її картку.</div>
              <div className="list">
                {owners.map((n) => <button key={n.id} className="list__row list__row--btn" onClick={() => setFocus(n.id)}><span>{n.name}</span><span className="vx-hint vx-num">{n.deg}</span></button>)}
              </div>
            </div>
          )}
        </aside>
      </div>
      <div className="vx-hint">Зв’язки — з поля «Власники» кожної компанії (відкриті джерела, станом на дату перевірки). Змініть власників у картці — граф оновиться.</div>
    </div>
  );
}
