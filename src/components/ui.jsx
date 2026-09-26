import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { CLEARANCE } from '../data/seed.js';
import { initials } from '../store.jsx';

export function ClassBadge({ level }) {
  return <span className={`vx-class vx-class--${level}`} title={CLEARANCE[level].full}>{CLEARANCE[level].short}</span>;
}

const STATUS_ICON = { ok: 'ok', warn: 'warn', danger: 'danger', info: 'info', idle: 'idle' };
export function Status({ kind = 'ok', children }) {
  return (
    <span className={`vx-status vx-status--${kind}`}>
      <Icon name={STATUS_ICON[kind]} />
      {children}
    </span>
  );
}

export function Panel({ title, action, children, className = '', bodyClass = 'vx-panel__body', ...rest }) {
  return (
    <section className={`vx-panel ${className}`} {...rest}>
      {(title || action) && (
        <header className="vx-panel__head">
          <h2 className="vx-panel__title">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, unit, delta, meter, meterBrass, sensitive = true }) {
  return (
    <div className="vx-panel vx-stat">
      <div className="vx-stat__label">{label}</div>
      <div className={`vx-stat__value ${sensitive ? 'vx-sensitive' : ''}`}>
        {value}{unit && <small>{unit}</small>}
      </div>
      {meter != null && (
        <div className={`vx-meter ${meterBrass ? 'vx-meter--brass' : ''}`} aria-hidden="true">
          <span style={{ width: `${Math.min(100, meter)}%` }} />
        </div>
      )}
      {delta && <div className="vx-stat__delta">{delta}</div>}
    </div>
  );
}

export function Avatar({ name, lg }) {
  return <span className={`vx-avatar ${lg ? 'vx-avatar--lg' : ''}`} aria-hidden="true">{initials(name)}</span>;
}

export function Drawer({ title, onClose, children, footer }) {
  useEsc(onClose);
  return (
    <>
      <div className="vx-scrim" onClick={onClose} />
      <aside className="vx-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="vx-drawer__head">
          <h2 className="vx-h2">{title}</h2>
          <button className="vx-btn vx-btn--ghost vx-btn--icon" onClick={onClose} aria-label="Закрити"><Icon name="close" /></button>
        </header>
        <div className="vx-drawer__body">{children}</div>
        {footer && <footer className="vx-drawer__foot">{footer}</footer>}
      </aside>
    </>
  );
}

export function Modal({ onClose, children, label }) {
  useEsc(onClose);
  return (
    <>
      <div className="vx-scrim" onClick={onClose} />
      <div className="vx-modal" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </>
  );
}

export function useEsc(fn) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && fn();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fn]);
}

export function Switch({ checked, onChange, label }) {
  return (
    <label className="vx-switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="vx-switch__track" />
      <span>{label}</span>
    </label>
  );
}

export function Toasts({ items }) {
  return (
    <div className="vx-toasts" aria-live="polite">
      {items.map((t) => (
        <div className="vx-toast" key={t.id}><Icon name="check" /><span>{t.text}</span></div>
      ))}
    </div>
  );
}

/* ---------- Charts (single series, monochrome; brass marks the one value to notice) ---------- */

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Horizontal bars, sorted by value, labelled directly — for ranking categories.
export function BarList({ data, unit = '', highlight }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const row = 30, labelW = 84, valueW = 44;
  const max = Math.max(...data.map((d) => d.value));
  const plotW = Math.max(40, w - labelW - valueW);
  const h = data.length * row;
  return (
    <div className="vx-chart" ref={ref}>
      <svg height={h} role="img" aria-label="Гістограма">
        {data.map((d, i) => {
          const bw = Math.max(2, (d.value / max) * plotW);
          const y = i * row;
          return (
            <g key={d.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x="0" y={y} width={w} height={row} fill="transparent" />
              <text className="label" x="0" y={y + row / 2 + 4}>{d.id}</text>
              <rect
                className={`bar ${d.id === highlight ? 'is-hi' : ''} ${hover === i && d.id !== highlight ? 'is-hover' : ''}`}
                x={labelW} y={y + 8} width={bw} height={row - 16} rx="2"
              />
              <text className="value" x={labelW + bw + 8} y={y + row / 2 + 4}>{d.value}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="vx-tip" style={{ left: labelW + ((data[hover].value / max) * plotW) / 2, top: hover * row + 8 }}>
          <span>{data[hover].id} · </span><b>{data[hover].value}</b> {unit}
        </div>
      )}
    </div>
  );
}

// Line + faint area with crosshair tooltip — for change over time.
export function Trend({ data, labels, unit = '', height = 200 }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 32, r: 12, t: 12, b: 26 };
  const max = Math.ceil(Math.max(...data) / 20) * 20;
  const x = (i) => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  const area = `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, max / 2, max];
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / (w - pad.l - pad.r)) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };
  return (
    <div className="vx-chart" ref={ref}>
      <svg height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Графік динаміки">
        <g className="grid">{ticks.map((t) => <line key={t} x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={pad.l - 8} y={y(t) + 4} textAnchor="end">{t}</text>)}
          {labels.map((l, i) => (i % 2 === 0 || i === labels.length - 1) && (
            <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{l}</text>
          ))}
        </g>
        <path className="area" d={area} />
        <path className="line" d={line} />
        <circle className="dot" cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="4" />
        {hover != null && (
          <>
            <line className="cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} />
            <circle className="dot" cx={x(hover)} cy={y(data[hover])} r="5" />
          </>
        )}
      </svg>
      {hover != null && (
        <div className="vx-tip" style={{ left: x(hover), top: y(data[hover]) }}>
          <span>{labels[hover]} · </span><b>{data[hover]}</b> {unit}
        </div>
      )}
    </div>
  );
}
