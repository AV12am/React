// «Індекс тривожності» on the overview: the world anxiety line (api/pulse.js, src/lib/pulse.js) for the last
// months, its trend continued for two weeks, and the platform's own forecasts on the same time line.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, fmtDate } from '../store.jsx';
import { Panel, Status } from './ui.jsx';
import { Icon } from './Icon.jsx';
import { Loader } from '../brand/Mark.jsx';
import { supabaseOn, authHeaders } from '../lib/supabase.js';
import { levelOf, project, foresight } from '../lib/pulse.js';
import { recordRoute } from '../lib/assistant.js';
import { LOCALE } from '../lib/locale.js';

const DAY = 86400000;
const AHEAD = 30;
const ts = (d) => Date.parse(`${d}T00:00:00Z`);
const today = () => new Date().toISOString().slice(0, 10);
const KIND = { risk: 'Відкритий прогноз', resolved: 'Прогноз перевірено', due: 'Термін продукту' };

function useWidth(ref) {
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function Chart({ index, ahead, marks, months, go }) {
  const box = useRef(null);
  const W = useWidth(box);
  const [hover, setHover] = useState(null);
  const H = 220, L = 34, R = 12, T = 12, B = 24, LANE = 26;
  const end = ts(today()) + AHEAD * DAY;
  const start = ts(today()) - months * 30 * DAY;
  const past = index.filter((p) => ts(p.date) >= start);
  const x = (d) => L + ((ts(d) - start) / (end - start)) * (W - L - R);
  const y = (v) => T + (1 - v / 100) * (H - T - B);
  const line = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const band = ahead.length ? `${ahead.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.hi).toFixed(1)}`).join('')}${[...ahead].reverse().map((p) => `L${x(p.date).toFixed(1)},${y(p.lo).toFixed(1)}`).join('')}Z` : '';
  const last = past.at(-1);
  const bridge = last && ahead.length ? [last, ...ahead] : ahead;
  // The first day of each month inside the range — one label each, kept off the y-axis labels.
  const ticks = [];
  const s0 = new Date(start);
  for (let d = new Date(Date.UTC(s0.getUTCFullYear(), s0.getUTCMonth() + 1, 1)); d.getTime() <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const iso = d.toISOString().slice(0, 10);
    if (x(iso) > L + 24 && x(iso) < W - R - 12) ticks.push(iso);
  }
  const shown = marks.filter((m) => ts(m.date) >= start && ts(m.date) <= end);
  const all = [...past, ...ahead];
  const onMove = (e) => {
    // Measured from the chart's own left edge (the hover area itself starts after the y-axis labels).
    const r = (e.currentTarget.ownerSVGElement || e.currentTarget).getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = null;
    for (const p of all) if (!best || Math.abs(x(p.date) - px) < Math.abs(x(best.date) - px)) best = p;
    if (best && Math.abs(x(best.date) - px) < 30) setHover(best); else setHover(null);
  };
  const near = hover ? shown.filter((m) => Math.abs(ts(m.date) - ts(hover.date)) <= 1.5 * DAY) : [];
  return (
    <div className="pulse__chart" ref={box}>
      <svg width={W} height={H + LANE} role="img" aria-label={`Геополітичний ризик: зараз ${last?.value ?? '—'} зі 100`}>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 50 ? 'pulse__mid' : 'pulse__grid'} />
            <text x={L - 6} y={y(v) + 4} className="pulse__tick" textAnchor="end">{v}</text>
          </g>
        ))}
        {W > 520 && <text x={W - R} y={y(50) - 5} className="pulse__tick" textAnchor="end">звичайний рівень</text>}
        {ticks.map((d) => <text key={d} x={x(d)} y={H - 6} className="pulse__tick" textAnchor="middle">{new Date(`${d}T00:00:00Z`).toLocaleDateString(LOCALE, { month: 'short' })}</text>)}
        <line x1={x(today())} x2={x(today())} y1={T} y2={H - B} className="pulse__today" />
        <text x={x(today()) + 4} y={T + 10} className="pulse__tick">сьогодні</text>
        {band && <path d={band} className="pulse__band" />}
        {bridge.length > 1 && <path d={line(bridge)} className="pulse__ahead" />}
        {past.length > 1 && <path d={line(past)} className="pulse__line" />}
        {last && <circle cx={x(last.date)} cy={y(last.value)} r={4.5} className="pulse__dot" />}
        {past.length < 7 && <text x={L + 8} y={T + 16} className="pulse__tick">{`Історія накопичується: днів ${past.length} із 7`}</text>}
        {/* the foresight lane: forecasts and products on the same dates */}
        <line x1={L} x2={W - R} y1={H + LANE / 2} y2={H + LANE / 2} className="pulse__grid" />
        {shown.map((m) => (
          <g key={m.id} className={`pulse__mark pulse__mark--${m.kind}`} transform={`translate(${x(m.date)},${H + LANE / 2})`}
            onClick={() => go(...recordRoute(m.rec))} role="button" tabIndex={0} aria-label={`${KIND[m.kind]}: ${m.title}`}
            onKeyDown={(e) => { if (e.key === 'Enter') go(...recordRoute(m.rec)); }}>
            <rect x={-9} y={-11} width={18} height={22} fill="transparent" />
            {m.kind === 'due' ? <rect x={-4.5} y={-4.5} width={9} height={9} transform="rotate(45)" /> : <circle r={5} />}
            <title>{`${KIND[m.kind]} · ${fmtDate(m.date, false)} · ${m.title}${m.p != null ? ` · ${m.p}%` : ''}${m.outcome ? ` · ${m.outcome}` : ''}`}</title>
          </g>
        ))}
        {hover && <line x1={x(hover.date)} x2={x(hover.date)} y1={T} y2={H - B} className="pulse__cross" />}
        <rect x={L} y={T} width={Math.max(0, W - L - R)} height={H - T - B} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover && (
        <div className="pulse__tip" style={x(hover.date) > W / 2 ? { right: W - x(hover.date) + 12, top: T } : { left: x(hover.date) + 12, top: T }}>
          <div className="vx-hint">{fmtDate(hover.date, false)}{hover.lo != null ? ' · продовження тренду' : ''}</div>
          <div><b className="vx-num">{Math.round(hover.value)}</b> · {levelOf(hover.value).label}</div>
          {hover.raw != null && <div className="vx-hint vx-num">{`GPR ${hover.raw} (100 — середнє 1985–2019)`}</div>}
          {hover.lo != null && <div className="vx-hint vx-num">{`межі: ${Math.round(hover.lo)}–${Math.round(hover.hi)}`}</div>}
          {near.map((m) => <div key={m.id} className="vx-hint">{KIND[m.kind]}: {m.title}{m.p != null ? ` · ${m.p}%` : ''}</div>)}
        </div>
      )}
      <div className="pulse__legend vx-hint">
        <span><i className="pulse__key pulse__key--line" /> індекс</span>
        <span><i className="pulse__key pulse__key--ahead" /> продовження тренду (не прогноз)</span>
        <span><i className="pulse__key pulse__key--risk" /> відкритий прогноз</span>
        <span><i className="pulse__key pulse__key--resolved" /> прогноз перевірено</span>
        <span><i className="pulse__key pulse__key--due" /> термін продукту</span>
      </div>
    </div>
  );
}

export function Pulse({ go }) {
  const { state, me } = useStore();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [months, setMonths] = useState(3);
  // The headlines under the chart fold away; the choice is remembered on this device.
  const [news, setNews] = useState(() => { try { return localStorage.getItem('pulse-news') !== 'hidden'; } catch { return true; } });
  const toggleNews = () => setNews((v) => { try { localStorage.setItem('pulse-news', v ? 'hidden' : 'shown'); } catch { /* private mode */ } return !v; });
  useEffect(() => {
    // (In development the request goes out anyway, so the chart can be tried against a stand-in server.)
    if (!supabaseOn && !import.meta.env.DEV) { setErr('Індекс працює на сайті із сервером (Vercel + Supabase).'); return undefined; }
    let live = true;
    const api = new URL('api/pulse', document.baseURI);
    const load = async () => {
      try {
        const res = await fetch(api, { headers: await authHeaders() });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.message || `HTTP ${res.status}`);
        if (!live) return;
        if (j.index?.length) { setData(j); setErr(''); } else setErr('Перше вимірювання ще збирається — спробуйте за хвилину.');
      } catch (e) { if (live) setErr(`Індекс недоступний: ${e.message}`); }
    };
    load();
    const t = setInterval(load, 30 * 60000);
    return () => { live = false; clearInterval(t); };
  }, []);
  const marks = useMemo(() => foresight(state.records, me), [state.records, me]);
  const index = data?.index || [];
  const ahead = useMemo(() => project(index, 14), [index]);
  const now = index.at(-1);
  const week = index.at(-8);
  const lvl = now ? levelOf(now.value) : null;
  const delta = now && week ? Math.round(now.value - week.value) : null;

  // What the index is and where it comes from — behind ⓘ beside the title.
  const about = !data ? null : `${data.source === 'gpr'
    ? 'Індекс геополітичного ризику (Geopolitical Risk Index, D. Caldara і M. Iacoviello, Федеральна резервна система США): частка газетних матеріалів про війни, загрози, теракти й напругу. 50 на шкалі — середній рівень 1985–2019 років, кожне подвоєння ризику — плюс 25. Ковзне середнє за 7 днів; дані оновлюються щопонеділка, тож останній тиждень може бути ще без значень.'
    : data.source === 'gdelt'
      ? 'Тон і частка світових новин про війни, конфлікти, кризи, атаки й санкції (GDELT Project, відкриті дані). 50 — звичайний рівень останніх трьох місяців.'
      : `Частка матеріалів про війни, конфлікти, кризи, атаки й санкції у стрічках світових редакцій (BBC, Al Jazeera, DW, The Guardian, NPR, France 24, Sky News, ООН) — власне вимірювання платформи, днів в історії: ${data.days}.${data.provisional ? ' Поки зібрано менше тижня, значення попереднє.' : ' 50 — звичайний рівень зібраної історії.'}`
  } Оновлюється щогодини. Пунктир — лише продовження тренду, а не прогноз; позначки внизу — прогнози платформи.`;
  return (
    <Panel className="pulse" title="Геополітичний ризик · GPR" info={about}
      action={<div className="toolbar">
        <div className="segmented" role="group" aria-label="Період">
          {[[1, '1 міс'], [3, '3 міс']].map(([m, l]) => <button key={m} className={months === m ? 'is-active' : ''} onClick={() => setMonths(m)}>{l}</button>)}
        </div>
      </div>}>
      {!data && !err && <div className="vx-empty"><Loader size={32} label="Індекс" /></div>}
      {!data && err && <div className="vx-hint">{err}</div>}
      {data && now && (
        <div className="stack">
          <div className="pulse__head">
            <div className="pulse__hero"><span className="vx-num pulse__value">{Math.round(now.value)}</span><span className="vx-hint">/ 100</span></div>
            <div className="stack pulse__state">
              <Status kind={lvl.status}>{lvl.label}</Status>
              <span className="vx-hint vx-num">{delta == null ? '' : `${delta > 0 ? '+' : ''}${delta} за тиждень`} · {fmtDate(now.date, false)}{data.stale ? ' · дані не оновлено' : ''}</span>
            </div>
          </div>
          <Chart index={index} ahead={ahead} marks={marks} months={months} go={go} />
          {!!data.headlines?.length && (
            <div className="stack">
              <button type="button" className="pulse__news-toggle" onClick={toggleNews} aria-expanded={news}>
                <span className="vx-eyebrow">Що формує сигнал за добу</span>
                <span className="vx-hint">{news ? 'Сховати' : `Показати · ${Math.min(5, data.headlines.length)}`}</span>
                <Icon name="chevron" size={12} className={`pulse__news-chev ${news ? 'is-open' : ''}`} />
              </button>
              {news && <div className="list">
                {data.headlines.slice(0, 5).map((h) => (
                  <a key={h.url} className="list__row pulse__news" href={h.url} target="_blank" rel="noopener noreferrer">
                    <Icon name="globe" size={14} />
                    <span className="list__text"><span data-no-i18n="">{h.title}</span><span className="vx-hint">{h.domain}{h.country ? ` · ${h.country}` : ''}</span></span>
                  </a>
                ))}
              </div>}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
