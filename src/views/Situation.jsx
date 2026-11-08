// SITUATION — the platform's dashboards: a grid of widgets the analyst arranges, from templates the popular platforms
// ship (an executive overview, projects and tasks, the situation). Every number is counted from what the person may
// see (src/lib/situation.js); a bar filters the whole dashboard, a row opens its record.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, fmtAgo } from '../store.jsx';
import { Panel, Trend, Avatar, Drawer, InfoTip, ClassBadge, Modal } from '../components/ui.jsx';
import { saveFile } from '../lib/io.js';
import { supabaseOn, authHeaders } from '../lib/supabase.js';
import { Icon } from '../components/Icon.jsx';
import { Pulse } from '../components/Pulse.jsx';
import { Spark, Columns, Lines, Donut, Heat, Gauge, Graph, SERIES } from '../components/charts.jsx';
import { readTable } from '../lib/importer.js';
import { VISUALS, MEASURES, WB_INDICATORS, WB_COUNTRIES, EXTERNAL, extKey, resolveCfg, sourcesOf, fieldsOf, defaultCfg, computeCustom, datasetFrom, drillRows, toCsv } from '../lib/situation-custom.js';
import { ask } from '../components/Dialog.jsx';
import { LEVELS } from '../data/clearance.js';
import { VISIBLE_DIVISIONS } from '../data/seed.js';
import { ORGS_UA, ORG_SECTORS } from '../data/orgs-ua.js';
import { METRICS, TEMPLATES, SUBJECTS, PUBLIC_METRICS, publicSafe, subjectBoard, subjectTitle, PERIODS, newBoard, boardsFor, scope, compute, addWidget, addCustom, setCustom, moveWidget, placeWidget, resizeWidget, removeWidget } from '../lib/situation.js';

const SitMap = lazy(() => import('../components/SitMap.jsx').then((m) => ({ default: m.SitMap })));

const KIND_LABEL = { map: 'Карта', graph: 'Граф зв\'язків', kpi: 'Показник', columns: 'Стовпчики', lines: 'Лінії', line: 'Динаміка', donut: 'Частки', gauge: 'Шкала', heat: 'Теплова карта', bars: 'Порівняння', table: 'Таблиця', feed: 'Стрічка', pulse: 'Індекс', news: 'Новини' };

// A KPI card as the BI platforms draw it: the number, its change with an arrow, the last twelve weeks.
function Kpi({ v }) {
  const bad = v.bad && v.value;
  return (
    <div className="sit-kpi">
      <div className="sit-kpi__row">
        <div className={`sit-kpi__value vx-num ${bad ? 'is-bad' : ''}`}>{v.value}</div>
        {v.delta != null && <span className={`sit-delta vx-num ${v.delta > 0 ? 'is-up' : v.delta < 0 ? 'is-down' : ''}`}>{v.delta > 0 ? '▲' : v.delta < 0 ? '▼' : '■'} {v.delta > 0 ? '+' : ''}{v.delta}</span>}
        {bad ? <span className="sit-delta is-bad">▲ потребує уваги</span> : null}
      </div>
      {v.spark && <Spark data={v.spark} color={bad ? 'var(--sit-critical)' : 'var(--sit-c1)'} />}
      <div className="vx-hint sit-kpi__note">{v.note || (v.delta != null ? 'до попереднього періоду' : '12 тижнів')}</div>
    </div>
  );
}

function Bars({ v, active, onPick }) {
  const max = Math.max(1, ...v.rows.map((r) => r.value));
  if (!v.rows.length) return <div className="vx-hint">Даних за період немає.</div>;
  return (
    <div className="sit-bars">
      {v.rows.map((r) => (
        <button type="button" key={r.id} className={`sit-bar ${active === r.id ? 'is-active' : ''}`} onClick={onPick ? () => onPick(r.id) : undefined} disabled={!onPick}>
          <span className="sit-bar__label">{r.label}</span>
          <span className="sit-bar__track"><span style={{ width: `${(r.value / max) * 100}%`, background: r.color || 'var(--sit-c1)' }} /></span>
          <span className="sit-bar__value vx-num">{r.value}</span>
        </button>
      ))}
    </div>
  );
}

function Table({ v, open }) {
  if (!v.rows.length) return <div className="vx-hint">Записів немає.</div>;
  return (
    <div className="vx-table-wrap">
      <table className="vx-table sit-table">
        <thead><tr>{v.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {v.rows.map((r) => (
            <tr key={r.id} className={`${r.to || r.href ? 'is-link' : ''} ${r.late ? 'is-late' : ''}`} onClick={r.to ? () => open(r.to) : r.href ? () => window.open(r.href, '_blank', 'noopener,noreferrer') : undefined}>
              {r.cells.map((c, i) => <td key={i}>{v.bars === i && typeof c === 'number' ? <span className="sit-databar"><span style={{ width: `${(c / Math.max(1, ...v.rows.map((x) => x.cells[i]))) * 100}%` }} /><b className="vx-num">{c}</b></span> : c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Feed({ v }) {
  const { userById } = useStore();
  if (!v.rows.length) return <div className="vx-hint">Подій ще немає.</div>;
  return (
    <div className="list">
      {v.rows.map((e) => {
        const u = userById(e.actor);
        return (
          <div className="list__row list__row--top" key={e.id}>
            {u ? <Avatar name={u.name} /> : <span className="vx-avatar"><Icon name="cpu" size={14} /></span>}
            <div className="list__text"><div>{e.text}</div><div className="vx-hint">{u?.name || 'Система'} · {fmtAgo(e.at)}</div></div>
          </div>
        );
      })}
    </div>
  );
}

// The first section of today's CONTEXT News; refreshed every half hour.
function News() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => fetch(new URL('api/pulse?news=1', document.baseURI)).then((r) => r.json()).then((j) => {
      if (!live) return;
      const key = (j.sections || []).find((s) => s.id === 'key');
      setItems(key?.items || []);
    }).catch(() => live && setErr('Випуск зараз недоступний.'));
    load();
    const t = setInterval(load, 30 * 60000);
    return () => { live = false; clearInterval(t); };
  }, []);
  if (err) return <div className="vx-hint">{err}</div>;
  if (!items) return <div className="vx-hint">Завантаження…</div>;
  if (!items.length) return <div className="vx-hint">Випуск ще не готовий.</div>;
  return (
    <div className="sit-news">
      {items.map((x) => (
        <a key={x.url} className="sit-news__item" href={x.url} target="_blank" rel="noopener noreferrer">
          {x.image && <img src={x.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
          <span>{x.summary}</span>
        </a>
      ))}
    </div>
  );
}

// ── Outside data, fetched when a widget asks for it and kept for the session ─────────────────────────────────────
// Dashboard themes, as in BI tools: the series colours and, for «Світла», a light page (src/styles/app.css).
const THEMES = [['graphite', 'Графіт'], ['ocean', 'Океан'], ['ember', 'Жар'], ['forest', 'Ліс'], ['mono', 'Моно'], ['paper', 'Світла']];
const EXT_CACHE = new Map(); // key → Promise<rows>
let gdeltChain = Promise.resolve();
const gdeltTurn = (fn) => { const p = gdeltChain.then(fn); gdeltChain = p.then(() => new Promise((r) => setTimeout(r, 5500)), () => new Promise((r) => setTimeout(r, 5500))); return p; };
// The three company sources share one answer of the server.
const COMPANY = new Map();
const companyOf = (code) => {
  if (!COMPANY.has(code)) {
    COMPANY.set(code, (async () => {
      const res = await fetch(new URL(`api/pulse?company=${code}`, document.baseURI), { headers: supabaseOn ? await authHeaders() : {} });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || `HTTP ${res.status}`);
      return j;
    })().catch((e) => { COMPANY.delete(code); throw e; }));
  }
  return COMPANY.get(code);
};
async function fetchExt(cfg) {
  const key = extKey(cfg);
  if (!EXT_CACHE.has(key)) {
    EXT_CACHE.set(key, (async () => {
      if (cfg.source === 'ext:news') {
        const j = await (await fetch(new URL('api/pulse?news=1', document.baseURI))).json();
        return (j.sections || []).flatMap((sec) => (sec.items || []).map((x, i) => ({ id: `${sec.id}-${i}`, section: sec.title || sec.part, domain: x.domain, title: x.summary || x.title, at: x.at, url: x.url })));
      }
      if (cfg.source === 'ext:gpr') {
        const j = await (await fetch(new URL('api/pulse', document.baseURI), { headers: supabaseOn ? await authHeaders() : {} })).json();
        return (j.index || []).map((p) => ({ id: p.date, date: p.date, value: Math.round(p.value * 10) / 10 }));
      }
      if (cfg.source.startsWith('ext:gdelt-')) {
        if (!cfg.q) return [];
        const kind = cfg.source.slice(10);
        // GDELT answers one question per five seconds: the page's questions go one after another, and a
        // «wait» is asked again a little later (three times at most).
        for (let i = 0; i < 7; i++) {
          const res = await gdeltTurn(async () => fetch(new URL(`api/pulse?gdelt=${kind}&q=${encodeURIComponent(cfg.q)}`, document.baseURI), { headers: supabaseOn ? await authHeaders() : {} }));
          const j = await res.json().catch(() => ({}));
          if (res.ok) return (j.rows || []).map((r, k) => ({ id: `${kind}-${k}`, ...r }));
          if (res.status !== 429) throw new Error(j.message || `HTTP ${res.status}`);
          await new Promise((r) => setTimeout(r, 6000 + i * 2000));
        }
        throw new Error('GDELT зайнятий — спробуйте за хвилину');
      }
      if (cfg.source === 'ext:prozorro') {
        if (!/^\d{8}$/.test(cfg.code || '')) throw new Error('вкажіть ЄДРПОУ компанії («Змінити об’єкт»)');
        const res = await fetch(new URL(`api/pulse?prozorro=${cfg.code}`, document.baseURI), { headers: supabaseOn ? await authHeaders() : {} });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.message || `HTTP ${res.status}`);
        return j.rows || [];
      }
      if (cfg.source.startsWith('ext:company')) {
        if (!/^\d{8}$/.test(cfg.code || '')) throw new Error('вкажіть ЄДРПОУ компанії («Змінити об’єкт»)');
        const j = await companyOf(cfg.code);
        if (cfg.source === 'ext:company') return j.card?.name ? [{ id: cfg.code, ...j.card, url: j.sources?.[0]?.url || '', notes: j.notes, sources: j.sources }] : [];
        const list = cfg.source === 'ext:company-people' ? j.people : j.tree;
        return (list || []).map((r, i) => ({ id: `${cfg.code}-${i}`, ...r }));
      }
      if (cfg.source === 'ext:wb') {
        const [ind, countries] = [cfg.ind || WB_INDICATORS[0][0], (cfg.countries || ['UKR']).join(';')];
        const j = await (await fetch(`https://api.worldbank.org/v2/country/${countries}/indicator/${ind}?format=json&per_page=2000&date=2000:2030`)).json();
        const name = (code, fallback) => WB_COUNTRIES.find((c) => c[0] === code)?.[1] || fallback;
        return (j?.[1] || []).filter((r) => r.value != null).map((r) => ({ id: `${r.countryiso3code}-${r.date}`, country: name(r.countryiso3code, r.country?.value), date: `${r.date}-07-01`, value: r.value }));
      }
      return [];
    })().catch((e) => { EXT_CACHE.delete(key); throw e; }));
  }
  return EXT_CACHE.get(key);
}
/** The outside rows the given widget settings need: { key → rows }, filled in as they arrive. */
function useExt(cfgs) {
  const [ext, setExt] = useState({});
  const [errs, setErrs] = useState({});
  const want = cfgs.filter((c) => c && EXTERNAL[c.source] && c.source !== 'ext:orgs');
  const keys = want.map(extKey).join('|');
  useEffect(() => {
    let live = true;
    for (const c of want) {
      const k = extKey(c);
      fetchExt(c).then((rows) => live && setExt((x) => (x[k] ? x : { ...x, [k]: rows })))
        .catch((e) => live && setErrs((x) => ({ ...x, [k]: e.message || 'не відповідає' })));
    }
    return () => { live = false; };
  }, [keys]); // eslint-disable-line react-hooks/exhaustive-deps
  return [ext, errs];
}

const divColor = (rows) => rows.map((r) => ({ ...r, color: SERIES[VISIBLE_DIVISIONS.findIndex((d) => d.id === r.id)] }));
const nodeColor = (n) => SERIES[Math.max(0, VISIBLE_DIVISIONS.findIndex((d) => d.id === n.div)) % 5];

/** One visual from its numbers — the same for the built-in widgets and the ones made in the editor. */
function Slicer({ v, sel, onPick }) {
  if (!v.rows?.length) return <div className="vx-hint">Оберіть поле в «Групувати за».</div>;
  return (
    <div className="sit-slicer">
      {v.rows.map((r) => {
        const on = sel?.some((x) => x.field === v.field && String(x.value) === String(r.id));
        return <button type="button" key={r.id} className={`sit-slicer__item ${on ? 'is-active' : ''}`} onClick={() => onPick(r.id, r.label)}><span>{r.label}</span><b className="vx-num">{r.value}</b></button>;
      })}
    </div>
  );
}

function Visual({ kind, v, label = '', filters = {}, setFilter, divFilter = false, open, onPick }) {
  if (kind === 'news') return <News />;
  if (!v) return <div className="vx-hint">Немає даних.</div>;
  if (v.empty && v.note) return <div className="vx-hint">{v.note}</div>;
  if (v.note && ((kind === 'columns' || kind === 'lines') && !v.series?.length)) return <div className="vx-hint">{v.note}</div>;
  switch (kind) {
    case 'kpi': return <Kpi v={v} />;
    case 'line': return <Trend data={v.data} labels={v.labels} height={180} />;
    case 'columns': return <Columns labels={v.labels} series={v.series} />;
    case 'lines': return <Lines labels={v.labels} series={v.series} />;
    case 'donut': return <Donut rows={v.rows} onPick={onPick ? (id) => onPick(id, v.rows.find((r) => r.id === id)?.label) : undefined} />;
    case 'slicer': return <Slicer v={v} sel={filters.sel} onPick={onPick || (() => {})} />;
    case 'card': return v.items?.length ? (
      <dl className="sit-card">{v.outside && <div className="sit-card__note vx-hint">{v.note}</div>}{v.items.map((x) => <div key={x.label}><dt>{x.label}</dt><dd>{/^https?:\/\//.test(x.value) ? <a href={x.value} target="_blank" rel="noopener noreferrer">{x.value.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a> : x.value}</dd></div>)}
        {v.sources?.length > 0 && <div><dt>Джерела</dt><dd>{v.sources.map((x, i) => <span key={x.name}>{i > 0 && ' · '}<a href={x.url} target="_blank" rel="noopener noreferrer">{x.name}</a></span>)}</dd></div>}
        {v.notes?.length > 0 && <div className="sit-card__note vx-hint">{v.notes.join(' ')}</div>}
        {v.url && <div><dt>{v.outside ? 'Реєстр' : 'Джерело'}</dt><dd><a href={v.url} target="_blank" rel="noopener noreferrer">{v.outside ? 'відкрити в Opendatabot' : 'реєстр (Opendatabot)'}</a></dd></div>}</dl>
    ) : <div className="vx-hint">{v.note || 'Немає даних.'}</div>;
    case 'gauge': return v.empty ? <div className="vx-hint">Завдань із терміном у періоді немає.</div> : <><Gauge value={v.value} label={label} /><div className="vx-hint sit-center">{v.note}</div></>;
    case 'heat': return <Heat cells={v.cells} unit="дій" />;
    case 'bars': return <Bars v={divFilter ? { rows: divColor(v.rows) } : v} active={divFilter ? filters.div : null} onPick={divFilter ? (id) => setFilter({ div: filters.div === id ? '' : id }) : onPick ? (id) => onPick(id, v.rows.find((r) => r.id === id)?.label) : null} />;
    case 'table': return <Table v={v} open={open} />;
    case 'feed': return <Feed v={v} />;
    case 'news': return <News />;
    case 'map': return v.points?.length ? <Suspense fallback={<div className="sit-map" />}><SitMap points={v.points} open={open} /></Suspense> : <div className="vx-hint">{v.note}</div>;
    case 'graph': return v.nodes?.length ? <Graph nodes={v.nodes} edges={v.edges} open={open} colorOf={nodeColor} /> : <div className="vx-hint">{v.note}</div>;
    default: return null;
  }
}

function Widget({ wg, data, edit, filters, setFilter, open, go, board, save, drag, setDrag, onEdit, onPick, onDrill, onFocus, error }) {
  const custom = wg.metric === 'custom';
  const m = custom ? { kind: wg.cfg?.visual, label: wg.title || 'Віджет', about: 'Віджет із конструктора: джерело, поле групування й значення обрано в «Налаштувати».' } : METRICS[wg.metric];
  if (!m) return null;
  const v = data;
  const viewTools = !edit && (
    <div className="sit-widget__tools sit-widget__tools--view">
      {custom && <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" title="Показати дані" aria-label="Показати дані" onClick={() => onDrill(wg)}><Icon name="file" size={14} /></button>}
      <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" title="Розгорнути" aria-label="Розгорнути віджет" onClick={() => onFocus(wg)}><Icon name="expand" size={14} /></button>
    </div>
  );
  const controls = edit && (
    <div className="sit-widget__tools">
      <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" title="Раніше" aria-label="Перемістити раніше" onClick={() => save(moveWidget(board, wg.id, -1))}><Icon name="chevron" size={14} /></button>
      <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" title="Пізніше" aria-label="Перемістити пізніше" onClick={() => save(moveWidget(board, wg.id, 1))}><Icon name="chevron" size={14} /></button>
      <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm vx-num" title="Ширина" onClick={() => save(resizeWidget(board, wg.id))}>{wg.w}/12</button>
      {custom && <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" title="Налаштувати" aria-label="Налаштувати віджет" onClick={() => onEdit(wg)}><Icon name="settings" size={14} /></button>}
      <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" title="Прибрати" aria-label="Прибрати віджет" onClick={() => save(removeWidget(board, wg.id))}><Icon name="trash" size={14} /></button>
    </div>
  );
  const dnd = edit ? {
    draggable: true,
    onDragStart: () => setDrag(wg.id),
    onDragEnd: () => setDrag(null),
    onDragOver: (e) => { if (drag && drag !== wg.id) e.preventDefault(); },
    onDrop: (e) => { e.preventDefault(); if (drag && drag !== wg.id) save(placeWidget(board, drag, wg.id)); setDrag(null); },
  } : {};
  const cls = `sit-widget sit-w${wg.w} ${edit ? 'is-edit' : ''} ${drag === wg.id ? 'is-drag' : ''}`;
  if (m.kind === 'pulse') return <div className={cls} {...dnd}>{controls}<Pulse go={go} /></div>;
  const pickable = custom && wg.cfg?.group && ['bars', 'donut', 'slicer'].includes(wg.cfg.visual);
  const pick = pickable ? (id, lab) => onPick(wg, id, lab) : undefined;
  const body = error ? <div className="vx-hint">Джерело не відповідає: {error}</div> : <Visual kind={m.kind} v={v} label={m.label} filters={filters} setFilter={setFilter} divFilter={m.filters === 'div'} open={open} onPick={pick} />;
  return (
    <div className={cls} {...dnd}>
      <Panel title={wg.title || m.label} info={m.about} action={controls || viewTools} className="sit-panel">{body}</Panel>
    </div>
  );
}

function SubjectCards({ onPick }) {
  return (
    <div className="sit-start__grid">
      {SUBJECTS.map((x) => (
        <button type="button" key={x.kind} className="sit-template sit-template--main" onClick={() => onPick(x.kind)}>
          <span className="vx-eyebrow">{x.what}</span><b>{x.name}</b><span className="vx-hint">{x.about}</span>
        </button>
      ))}
    </div>
  );
}

function TemplatePicker({ onPick, onSubject, onClose }) {
  const { me } = useStore();
  return (
    <Drawer title="Новий дашборд" onClose={onClose}>
      <div className="stack">
        <div className="vx-eyebrow">Що аналізуємо</div>
        {SUBJECTS.map((x) => (
          <button type="button" key={x.kind} className="sit-template sit-template--main" onClick={() => onSubject(x.kind)}><b>{x.name}</b><span className="vx-hint">{x.about}</span></button>
        ))}
        <div className="vx-eyebrow">Інші шаблони</div>
        {TEMPLATES.filter((t) => !me?.public || !t.internal).map((t) => (
          <button type="button" key={t.id} className="sit-template" onClick={() => onPick(t.id)}>
            <b>{t.name}</b><span className="vx-hint">{t.about}</span>
          </button>
        ))}
      </div>
    </Drawer>
  );
}

function WidgetPicker({ onPick, onBuild, onClose }) {
  const { me } = useStore();
  const groups = Object.entries(METRICS).filter(([id]) => !me?.public || PUBLIC_METRICS.includes(id)).reduce((m, [id, x]) => { (m[x.kind] ||= []).push([id, x]); return m; }, {});
  return (
    <Drawer title="Додати віджет" onClose={onClose}>
      <div className="stack">
        <button type="button" className="sit-template sit-template--main" onClick={onBuild}><b>Конструктор віджета</b><span className="vx-hint">Самі оберіть джерело ({me?.public ? 'відкриті дані або ваші таблиці' : 'реєстр, завдання, журнал або ваші дані'}), вид — показник, стовпчики, лінії, смуги, кільце, таблиця, карта чи граф, — поле групування й значення.</span></button>
        <div className="vx-eyebrow">Готові віджети</div>
        {Object.entries(groups).map(([kind, list]) => (
          <div key={kind} className="stack">
            <div className="vx-eyebrow">{KIND_LABEL[kind]}</div>
            {list.map(([id, x]) => (
              <button type="button" key={id} className="sit-template" onClick={() => onPick(id)}><b>{x.label}</b><span className="vx-hint">{x.about}</span></button>
            ))}
          </div>
        ))}
      </div>
    </Drawer>
  );
}

/** The widget editor, as in Power BI: source, visual, fields; the widget is drawn live as it is set. */
function WidgetEditor({ initial, onSave, onClose, filters, open, subject }) {
  const { state: base, me } = useStore();
  const [cfg, setCfg] = useState(initial?.cfg || defaultCfg(me.public ? 'ext:wb' : 'records', base));
  const live = resolveCfg(cfg, subject);
  const [ext, errs] = useExt([live]);
  const state = useMemo(() => ({ ...base, ext }), [base, ext]);
  const [title, setTitle] = useState(initial?.title || '');
  const sources = sourcesOf(state, me);
  const fields = fieldsOf(cfg.source, state);
  const set = (p) => setCfg((c) => ({ ...c, ...p }));
  const v = useMemo(() => computeCustom(live, state, me, filters), [live, state, me, filters]);
  const groupable = fields.filter((f) => ['select', 'user', 'text'].includes(f.type));
  const numbers = fields.filter((f) => f.type === 'number');
  const dates = fields.filter((f) => f.type === 'date');
  const needs = { group: ['columns', 'lines', 'bars', 'donut', 'table', 'map', 'slicer'].includes(cfg.visual), time: ['kpi', 'columns', 'lines', 'bars', 'donut', 'table', 'map', 'slicer'].includes(cfg.visual), measure: ['kpi', 'columns', 'lines', 'bars', 'donut', 'table'].includes(cfg.visual) };
  const sourceLabel = sources.find((x) => x.id === cfg.source)?.label || '';
  const auto = `${VISUALS.find((x) => x[0] === cfg.visual)?.[1]} · ${sourceLabel}${cfg.group && needs.group ? ` за «${fields.find((f) => f.id === cfg.group)?.label}»` : ''}`;
  return (
    <Drawer title={initial ? 'Налаштувати віджет' : 'Конструктор віджета'} onClose={onClose}
      footer={<><button type="button" className="vx-btn vx-btn--ghost" onClick={onClose}>Скасувати</button><button type="button" className="vx-btn vx-btn--primary" onClick={() => onSave(cfg, title.trim() || auto)}>{initial ? 'Зберегти' : 'Додати на дашборд'}</button></>}>
      <div className="stack sit-editor">
        <label className="vx-field"><span className="vx-label">Назва</span><input className="vx-input" value={title} placeholder={auto} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="vx-field"><span className="vx-label">Джерело даних</span>
          <select className="vx-select" value={cfg.source} onChange={(e) => setCfg({ ...defaultCfg(e.target.value, state), visual: cfg.visual, ...(e.target.value.startsWith('ext:gdelt-') ? { q: subject ? '$q' : '', time: 'date', measure: e.target.value === 'ext:gdelt-arts' ? 'count' : 'avg', field: e.target.value === 'ext:gdelt-arts' ? '' : 'value', span: 'all' } : {}) })}>{sources.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        <div className="vx-field"><span className="vx-label">Вид</span>
          <div className="sit-visuals">{VISUALS.map(([id, l]) => <button type="button" key={id} className={`vx-tag ${cfg.visual === id ? 'is-active' : ''}`} onClick={() => set({ visual: id })}>{l}</button>)}</div></div>
        {needs.group && <label className="vx-field"><span className="vx-label">{cfg.visual === 'columns' || cfg.visual === 'lines' ? 'Розбити за (серії)' : cfg.visual === 'map' ? 'Колір точок за' : 'Групувати за'}</span>
          <select className="vx-select" value={cfg.group} onChange={(e) => set({ group: e.target.value })}><option value="">{cfg.visual === 'columns' || cfg.visual === 'lines' || cfg.visual === 'map' ? '— одна серія —' : '— без групування —'}</option>{groupable.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>}
        {needs.measure && <div className="sit-editor__row">
          <label className="vx-field"><span className="vx-label">Значення</span>
            <select className="vx-select" value={cfg.measure} onChange={(e) => set({ measure: e.target.value, field: e.target.value === 'count' ? '' : cfg.field || numbers[0]?.id || '' })}>{MEASURES.filter((m) => m[0] === 'count' || numbers.length).map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
          {cfg.measure !== 'count' && <label className="vx-field"><span className="vx-label">Поле</span>
            <select className="vx-select" value={cfg.field} onChange={(e) => set({ field: e.target.value })}>{numbers.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>}
        </div>}
        {cfg.source === 'ext:wb' && <>
          <label className="vx-field"><span className="vx-label">Показник Світового банку</span>
            <select className="vx-select" value={cfg.ind} onChange={(e) => set({ ind: e.target.value })}>{WB_INDICATORS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
          <div className="vx-field"><span className="vx-label">Країни (до 5 на графіку)</span>
            <div className="sit-visuals">{WB_COUNTRIES.map(([id, l]) => { const on = (cfg.countries || []).includes(id); return <button type="button" key={id} className={`vx-tag ${on ? 'is-active' : ''}`} onClick={() => set({ countries: on ? cfg.countries.filter((x) => x !== id) : [...(cfg.countries || []), id] })}>{l}</button>; })}</div></div>
        </>}
        {needs.time && <label className="vx-field"><span className="vx-label">Поле дати</span>
          <select className="vx-select" value={cfg.time} onChange={(e) => set({ time: e.target.value })}><option value="">— без дати: усі рядки —</option>{dates.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>}
        {needs.time && cfg.time && <div className="sit-editor__row">
          <label className="vx-field"><span className="vx-label">Крок часу</span>
            <select className="vx-select" value={cfg.grain || 'week'} onChange={(e) => set({ grain: e.target.value })}><option value="week">Тижні (12)</option><option value="month">Місяці (12)</option><option value="year">Роки</option></select></label>
          <label className="vx-field"><span className="vx-label">Які рядки</span>
            <select className="vx-select" value={cfg.span || 'board'} onChange={(e) => set({ span: e.target.value })}><option value="board">За період дашборда</option><option value="all">Усі дані</option></select></label>
        </div>}
        {cfg.source.startsWith('ext:gdelt-') && <label className="vx-field"><span className="vx-label">Запит для світових медіа (англійською або латиницею){subject ? ' · $q — запит об’єкта дашборда' : ''}</span>
          <input className="vx-input" value={cfg.q || ''} placeholder={subject ? '$q' : '"Ukraine" AND drones'} onChange={(e) => set({ q: e.target.value })} /></label>}
        {errs[extKey(live)] && <div className="vx-error">Джерело не відповідає: {errs[extKey(live)]}</div>}
        <div className="vx-eyebrow">Попередній перегляд</div>
        <div className="sit sit-preview"><Panel title={title || auto} className="sit-panel"><Visual kind={cfg.visual} v={v} label={title || auto} open={open} /></Panel></div>
      </div>
    </Drawer>
  );
}

// «Дані», as «Отримати дані» in Power BI: a table of one's own from a CSV / Excel file or a Google Sheet.
const sheetCsv = (url) => {
  const m = /docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(url);
  if (!m) return /^https:\/\//.test(url) ? url : '';
  const gid = /[#&?]gid=(\d+)/.exec(url)?.[1] || '0';
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
};
function DataDrawer({ onClose }) {
  const { state, me, dispatch, toast } = useStore();
  const mine = (state.datasets || []).filter((d) => (d.clearance ?? 0) <= me.clearance && (d.owner === me.id || d.shared));
  const input = useRef(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const keep = (name, head, rows, extra = {}) => {
    const d = { ...datasetFrom(name, head, rows, me), ...extra };
    if (JSON.stringify(d).length > 900000) throw new Error('Таблиця завелика: до ~900 КБ (близько 2000 рядків). Залиште потрібні стовпці.');
    return d;
  };
  const fromFile = async (f) => {
    if (!f) return;
    setBusy(true); setErr('');
    try { const { head, rows } = await readTable(f); dispatch({ type: 'dataset/add', dataset: keep(f.name.replace(/\.(csv|xlsx)$/i, ''), head, rows) }); toast(`Завантажено: ${rows.length} рядків`); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const fetchSheet = async (link) => {
    const csv = sheetCsv(link);
    if (!csv) throw new Error('Потрібне посилання на Google Таблицю (доступ «Усі, хто має посилання») або на CSV.');
    const res = await fetch(csv);
    if (!res.ok) throw new Error(`Таблиця не відкрилася (HTTP ${res.status}). Відкрийте доступ «Усі, хто має посилання».`);
    return readTable(new File([await res.text()], 'sheet.csv'));
  };
  const fromSheet = async () => {
    setBusy(true); setErr('');
    try { const { head, rows } = await fetchSheet(url); dispatch({ type: 'dataset/add', dataset: keep('Google Таблиця', head, rows, { url }) }); setUrl(''); toast(`Завантажено: ${rows.length} рядків`); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const refresh = async (d) => {
    setBusy(true); setErr('');
    try { const { head, rows } = await fetchSheet(d.url); const n = keep(d.name, head, rows); dispatch({ type: 'dataset/update', id: d.id, patch: { columns: n.columns, rows: n.rows } }); toast(`Оновлено: ${rows.length} рядків`); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Drawer title="Дані" onClose={onClose}>
      <div className="stack">
        <p className="vx-hint">Ваші таблиці для віджетів: фінанси, продажі, будь-які списки. Перший рядок — назви стовпців; типи (число, дата, категорія) визначаються самі. Стовпці lat і lon дають точки на карті.</p>
        <input ref={input} type="file" accept=".csv,.xlsx,text/csv" hidden onChange={(e) => { fromFile(e.target.files[0]); e.target.value = ''; }} />
        <button type="button" className="vx-btn" disabled={busy} onClick={() => input.current.click()}><Icon name="upload" size={14} /> CSV або Excel</button>
        <div className="sit-editor__row">
          <input className="vx-input" placeholder="Посилання на Google Таблицю" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="button" className="vx-btn" disabled={busy || !url.trim()} onClick={fromSheet}>Підключити</button>
        </div>
        {err && <div className="vx-error">{err}</div>}
        {mine.map((d) => (
          <div key={d.id} className="sit-dataset">
            <div><b>{d.name}</b><div className="vx-hint">{d.rows.length} рядків · {d.columns.map((c) => c.label).slice(0, 5).join(', ')}{d.columns.length > 5 ? '…' : ''}</div></div>
            {d.owner === me.id && <div className="toolbar">
              <input className="vx-input sit-dataset__name" value={d.name} onChange={(e) => dispatch({ type: 'dataset/update', id: d.id, patch: { name: e.target.value } })} aria-label="Назва" />
              {d.url && <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" title="Оновити з таблиці" aria-label="Оновити" disabled={busy} onClick={() => refresh(d)}><Icon name="refresh" size={14} /></button>}
              <label className="vx-check"><input type="checkbox" checked={!!d.shared} onChange={(e) => dispatch({ type: 'dataset/update', id: d.id, patch: { shared: e.target.checked } })} /> спільні</label>
              <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" title="Видалити" aria-label="Видалити" onClick={async () => { if (await ask(`Віджети, що читають «${d.name}», стануть порожніми.`, { title: 'Видалити дані?', ok: 'Видалити', danger: true })) dispatch({ type: 'dataset/delete', id: d.id }); }}><Icon name="trash" size={14} /></button>
            </div>}
          </div>
        ))}
        {!mine.length && <div className="vx-hint">Ще немає жодної таблиці.</div>}
      </div>
    </Drawer>
  );
}

// The subject a dashboard analyses: a country, a company, a sector or a topic, and its query for the world's media.
const UA_LAT = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', '’': '', 'ʼ': '' };
const latin = (s) => String(s || '').replace(/[«»"]/g, '').split('').map((ch) => { const l = UA_LAT[ch.toLowerCase()]; return l == null ? ch : ch === ch.toLowerCase() ? l : l.charAt(0).toUpperCase() + l.slice(1); }).join('').trim();
const SECTOR_EN = { 'Енергетика': 'energy', 'Нафта й газ': 'oil gas', 'Транспорт і логістика': 'logistics', 'Металургія та гірництво': 'steel mining', 'Агро й харчова промисловість': 'agriculture grain', 'Роздрібна торгівля': 'retail', 'Телеком': 'telecom', 'IT': 'IT tech', 'Банки': 'banks banking', 'Фармацевтика': 'pharmaceutical', 'Машинобудування й оборонна промисловість': 'defense industry', 'Хімія': 'chemical', 'Страхування': 'insurance', 'Комунальні послуги': 'utilities', 'Охорона здоров’я': 'healthcare', 'Медіа': 'media' };
function SubjectForm({ kind: kind0, initial, onDone, onClose }) {
  const [kind, setKind] = useState(initial?.kind || kind0 || 'country');
  const [sub, setSub] = useState(initial || {});
  const set = (p) => setSub((x) => ({ ...x, ...p }));
  const pickCountry = (iso3) => { const c = WB_COUNTRIES.find((x) => x[0] === iso3); if (c) set({ iso3, label: c[1], q: `"${c[2]}"` }); };
  // The world's media write names in Latin letters: the Ukrainian name and its transliteration, both.
  const both = (name) => { const lat = latin(name); return lat && lat.toLowerCase() !== name.toLowerCase() ? `"${name}" OR "${lat}"` : `"${name}"`; };
  const pickCompany = (name) => { const o = ORGS_UA.find((x) => x.name === name); set(o ? { label: o.name, code: o.code, sector: o.sector, q: both(o.name) } : { label: name, code: '', q: name ? both(name) : '' }); };
  const pickSector = (sector) => set({ sector, label: sector, q: `Ukraine ${SECTOR_EN[sector] || sector}` });
  const ready = sub.label && (kind !== 'country' || sub.iso3) && sub.q;
  const tpl = SUBJECTS.find((x) => x.kind === kind);
  return (
    <Drawer title={initial ? 'Об’єкт аналізу' : 'Що аналізуємо?'} onClose={onClose}
      footer={<><button type="button" className="vx-btn vx-btn--ghost" onClick={onClose}>Скасувати</button><button type="button" className="vx-btn vx-btn--primary" disabled={!ready} onClick={() => onDone({ ...sub, kind })}>{initial ? 'Застосувати' : 'Створити дашборд'}</button></>}>
      <div className="stack sit-editor">
        {!initial && <div className="sit-visuals">{SUBJECTS.map((x) => <button type="button" key={x.kind} className={`vx-tag ${kind === x.kind ? 'is-active' : ''}`} onClick={() => { setKind(x.kind); setSub({}); }}>{x.what}</button>)}</div>}
        <p className="vx-hint">{tpl?.about}</p>
        {kind === 'country' && <label className="vx-field"><span className="vx-label">Країна</span>
          <select className="vx-select" value={sub.iso3 || ''} onChange={(e) => pickCountry(e.target.value)}><option value="">— оберіть —</option>{WB_COUNTRIES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>}
        {kind === 'company' && <>
          <label className="vx-field"><span className="vx-label">Компанія (з довідника 200 провідних або будь-яка)</span>
            <input className="vx-input" list="sit-orgs" value={sub.label || ''} onChange={(e) => pickCompany(e.target.value)} placeholder="Почніть вводити назву" />
            <datalist id="sit-orgs">{ORGS_UA.map((o) => <option key={o.code} value={o.name}>{o.sector}</option>)}</datalist></label>
          <div className="sit-editor__row">
            <label className="vx-field"><span className="vx-label">ЄДРПОУ</span><input className="vx-input" value={sub.code || ''} onChange={(e) => set({ code: e.target.value.replace(/\D/g, '').slice(0, 8) })} /></label>
            <label className="vx-field"><span className="vx-label">Галузь</span><select className="vx-select" value={sub.sector || ''} onChange={(e) => set({ sector: e.target.value })}><option value="">—</option>{ORG_SECTORS.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
          </div>
        </>}
        {kind === 'sector' && <label className="vx-field"><span className="vx-label">Галузь</span>
          <select className="vx-select" value={sub.sector || ''} onChange={(e) => pickSector(e.target.value)}><option value="">— оберіть —</option>{ORG_SECTORS.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>}
        {kind === 'topic' && <label className="vx-field"><span className="vx-label">Тема</span>
          <input className="vx-input" value={sub.label || ''} onChange={(e) => set({ label: e.target.value })} placeholder="Напр. Чорноморський коридор" /></label>}
        <label className="vx-field"><span className="vx-label">Запит для світових медіа (GDELT; англійською або латиницею — так знайдеться більше)</span>
          <input className="vx-input" value={sub.q || ''} onChange={(e) => set({ q: e.target.value })} placeholder={kind === 'topic' ? '"Black Sea" AND (grain OR corridor)' : ''} />
          <span className="vx-hint">Лапки — точна фраза; AND, OR, дужки — як у пошуку. Напр. «"Ukrzaliznytsia" OR "Ukrainian Railways"».</span></label>
      </div>
    </Drawer>
  );
}

function DrillDrawer({ wg, state, me, filters, onClose }) {
  const d = useMemo(() => drillRows(wg.cfg, state, me, filters), [wg, state, me, filters]);
  const download = async () => { await saveFile(`${(wg.title || 'дані').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60)}.csv`, new Blob(['\uFEFF', toCsv(d)], { type: 'text/csv;charset=utf-8' })); };
  return (
    <Drawer title={wg.title || 'Дані віджета'} onClose={onClose} footer={<button type="button" className="vx-btn" onClick={download}><Icon name="download" size={14} /> CSV</button>}>
      <div className="stack">
        <div className="vx-hint">{d.total} рядків з урахуванням фільтрів дашборда{d.total > d.rows.length ? `; показано ${d.rows.length}` : ''}.</div>
        <div className="vx-table-wrap"><table className="vx-table sit-table"><thead><tr>{d.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{d.rows.slice(0, 300).map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody></table></div>
      </div>
    </Drawer>
  );
}

export function Situation({ focus, go }) {
  const { state, me, dispatch, toast } = useStore();
  const boards = useMemo(() => boardsFor(state.boards, me), [state.boards, me]);
  const board = boards.find((b) => b.id === focus) || boards[0] || null;
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState(false);
  const [drag, setDrag] = useState(null);
  const [editing, setEditing] = useState(null); // { wg } or { wg: null } for a new one
  const [dataOpen, setDataOpen] = useState(false);
  const [drill, setDrill] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [sel, setSel] = useState([]); // the cross-filter: [{ field, value, label }]
  const [subjectKind, setSubjectKind] = useState(null); // a new dashboard about a subject: the form is open
  const [subjectEdit, setSubjectEdit] = useState(false);
  const [filters, setFilters] = useState({ days: 30, div: '' });
  const box = useRef(null);
  useEffect(() => { if (board) setFilters({ days: board.filters?.days || 30, div: board.filters?.div || '' }); }, [board?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = board && board.owner === me.id;
  const save = (next) => dispatch({ type: 'board/update', id: next.id, patch: { widgets: next.widgets } });
  const patch = (p) => board && dispatch({ type: 'board/update', id: board.id, patch: p });
  const setFilter = (p) => setFilters((f) => ({ ...f, ...p }));
  const createSubject = (subject) => {
    const b = me.public ? publicSafe(subjectBoard(subject, me)) : subjectBoard(subject, me);
    dispatch({ type: 'board/add', board: b });
    setSubjectKind(null); setPicking(false);
    go('situation', b.id);
    toast(`Дашборд «${b.name}» створено`);
  };
  const create = (tpl) => {
    const b = me.public ? publicSafe(newBoard(tpl, me)) : newBoard(tpl, me);
    dispatch({ type: 'board/add', board: b });
    setPicking(false);
    go('situation', b.id);
    toast(`Дашборд «${b.name}» створено`);
  };
  const remove = async () => {
    const ok = await ask(`«${board.name}» зникне для всіх, з ким ним поділилися. Записи платформи не зміняться.`, { title: 'Видалити дашборд?', ok: 'Видалити', danger: true });
    if (!ok) return;
    dispatch({ type: 'board/delete', id: board.id });
    setEdit(false);
    go('situation');
  };
  const openRecord = (to) => go('divisions', to.div, to.id);
  const full = () => { const el = box.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.(); };

  const s = useMemo(() => scope(state, me, filters), [state, me, filters]);
  const cfgOf = (wg) => resolveCfg(wg.cfg || {}, board?.subject);
  const [ext, extErr] = useExt((board?.widgets || []).filter((wg) => wg.metric === 'custom').map(cfgOf));
  const full2 = useMemo(() => ({ ...state, ext }), [state, ext]);
  const f2 = useMemo(() => ({ ...filters, sel }), [filters, sel]);
  const data = useMemo(() => Object.fromEntries((board?.widgets || []).map((wg) => [wg.id, wg.metric === 'custom' ? computeCustom(resolveCfg(wg.cfg || {}, board?.subject), full2, me, f2) : compute(wg.metric, s)])), [board?.widgets, board?.subject, s, full2, me, f2]);
  const pick = (wg, value, label) => {
    if (value === '__other') return;
    const field = wg.cfg.group;
    const fl = fieldsOf(wg.cfg.source, full2).find((f) => f.id === field)?.label || field;
    setSel((x) => (x.some((y) => y.field === field && String(y.value) === String(value)) ? x.filter((y) => !(y.field === field && String(y.value) === String(value))) : [...x.filter((y) => y.field !== field), { field, value, label: `${fl}: ${label ?? value}` }]));
  };

  if (!board) {
    return (
      <div className="page">
        <header className="page__head"><div><div className="vx-eyebrow">SITUATION · аналітичні дашборди</div><h1 className="vx-h1">Що аналізуємо?</h1></div></header>
        <div className="sit-start">
          <p className="vx-hint">Оберіть об’єкт — країну, компанію, галузь чи тему. Дашборд збереться з відкритих джерел: Світовий банк, світові медіа (GDELT), реєстр провідних компаній, CONTEXT News, геополітичний ризик{me.public ? '' : ' — і ваших записів про нього'}.</p>
          <SubjectCards onPick={setSubjectKind} />
          <div className="vx-eyebrow">Інші шаблони</div>
          <div className="sit-start__grid">
            {TEMPLATES.filter((t) => !me.public || !t.internal).map((t) => (
              <button type="button" key={t.id} className="sit-template" onClick={() => create(t.id)}><b>{t.name}</b><span className="vx-hint">{t.about}</span></button>
            ))}
          </div>
        </div>
        {subjectKind && <SubjectForm kind={subjectKind} onClose={() => setSubjectKind(null)} onDone={createSubject} />}
      </div>
    );
  }

  return (
    <div className="page sit" ref={box} data-sit-theme={board.theme || 'graphite'} data-theme={board.theme === 'paper' ? 'paper' : undefined}>
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">SITUATION · дашборди · оновлено {new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</div>
          {edit && mine
            ? <input className="vx-input sit-name" value={board.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Назва дашборда" />
            : <h1 className="vx-h1">{board.name}</h1>}
          {board.subject && <div className="sit-subject">
            <span className="vx-tag">{SUBJECTS.find((x) => x.kind === board.subject.kind)?.what}: <b>{board.subject.label}</b></span>
            <span className="vx-hint vx-mono">медіа: {board.subject.q}</span>
            {mine && <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setSubjectEdit(true)}>Змінити об’єкт</button>}
          </div>}
        </div>
        <div className="toolbar">
          {mine && <button type="button" className={`vx-btn ${edit ? 'vx-btn--primary' : 'vx-btn--ghost'} vx-btn--sm`} onClick={() => setEdit(!edit)}><Icon name={edit ? 'check' : 'settings'} size={14} /> {edit ? 'Готово' : 'Редагувати'}</button>}
          {mine && <select className="vx-input vx-input--sm sit-theme" value={board.theme || 'graphite'} onChange={(e) => patch({ theme: e.target.value })} aria-label="Оформлення" title="Оформлення">
            {THEMES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>}
          <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setDataOpen(true)}><Icon name="file" size={14} /> Дані</button>
          <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" onClick={full} title="На весь екран" aria-label="На весь екран"><Icon name="expand" size={14} /></button>
          <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setPicking(true)}><Icon name="plus" size={14} /> Новий</button>
        </div>
      </header>

      {boards.length > 1 && (
        <div className="segmented sit-tabs" role="tablist" aria-label="Дашборди">
          {boards.map((b) => <button type="button" key={b.id} role="tab" aria-selected={b.id === board.id} className={b.id === board.id ? 'is-active' : ''} onClick={() => { setEdit(false); go('situation', b.id); }}>{b.name}</button>)}
        </div>
      )}

      <div className="sit-filters">
        <div className="segmented" role="group" aria-label="Період">
          {PERIODS.map(([d, l]) => <button type="button" key={d} className={filters.days === d ? 'is-active' : ''} onClick={() => setFilter({ days: d })}>{l}</button>)}
        </div>
        {!me.public && <select className="vx-select sit-select" value={filters.div} onChange={(e) => setFilter({ div: e.target.value })} aria-label="Напрям">
          <option value="">Усі напрями</option>
          {VISIBLE_DIVISIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>}
        {filters.div && <button type="button" className="vx-tag sit-chip" onClick={() => setFilter({ div: '' })}>{VISIBLE_DIVISIONS.find((d) => d.id === filters.div)?.name} <Icon name="close" size={12} /></button>}
        {sel.map((x) => <button type="button" key={`${x.field}=${x.value}`} className="vx-tag sit-chip is-sel" onClick={() => setSel((y) => y.filter((z) => z !== x))}>{x.label} <Icon name="close" size={12} /></button>)}
        {sel.length > 1 && <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setSel([])}>Скинути вибір</button>}
        <span className="grow" />
        {edit && mine && <>
          {!me.public && <>
            <label className="vx-check sit-share"><input type="checkbox" checked={!!board.shared} onChange={(e) => patch({ shared: e.target.checked })} /> Поділитися з командою</label>
            <select className="vx-select sit-select" value={board.clearance ?? 0} onChange={(e) => patch({ clearance: +e.target.value })} aria-label="Гриф дашборда">
              {LEVELS.filter((l) => l.id <= me.clearance).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </>}
          <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => patch({ filters })}>Зберегти фільтри</button>
          <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Віджет</button>
          {TEMPLATES.find((t) => t.id === board.template)?.widgets().length > 0 && <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={async () => { if (await ask('Віджети дашборда заміняться віджетами шаблону в його нинішньому вигляді.', { title: 'Оновити за шаблоном?', ok: 'Оновити' })) save({ ...board, widgets: TEMPLATES.find((t) => t.id === board.template).widgets() }); }}><Icon name="refresh" size={14} /> За шаблоном</button>}
          <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={remove}><Icon name="trash" size={14} /> Видалити</button>
        </>}
        {!edit && !me.public && <span className="vx-hint">{board.shared ? 'Спільний' : 'Особистий'} · <ClassBadge level={board.clearance ?? 0} /> <InfoTip end>Числа пораховано з даних, які ви бачите за своїм допуском. Натисніть стовпчик напряму — увесь дашборд відфільтрується.</InfoTip></span>}
      </div>

      {!board.widgets.length && <div className="vx-empty"><Icon name="overview" /><div>Віджетів ще немає</div>{mine && <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => { setEdit(true); setAdding(true); }}><Icon name="plus" size={14} /> Додати віджет</button>}</div>}
      <div className="sit-grid">
        {board.widgets.map((wg) => (
          <Widget key={wg.id} wg={wg} data={data[wg.id]} edit={edit && mine} filters={f2} setFilter={setFilter} open={openRecord} go={go} board={board} save={save} drag={drag} setDrag={setDrag} onEdit={(x) => setEditing({ wg: x })}
            onPick={pick} onDrill={(x) => setDrill({ ...x, cfg: cfgOf(x) })} onFocus={setZoom} error={wg.metric === 'custom' && wg.cfg ? extErr[extKey(cfgOf(wg))] : null} />
        ))}
      </div>

      {picking && <TemplatePicker onPick={create} onSubject={(k) => { setPicking(false); setSubjectKind(k); }} onClose={() => setPicking(false)} />}
      {subjectKind && <SubjectForm kind={subjectKind} onClose={() => setSubjectKind(null)} onDone={createSubject} />}
      {subjectEdit && <SubjectForm initial={board.subject} onClose={() => setSubjectEdit(false)} onDone={(sub) => { patch({ subject: sub, name: subjectTitle(sub) }); setSubjectEdit(false); }} />}
      {adding && <WidgetPicker onPick={(id) => { save(addWidget(board, id)); setAdding(false); }} onBuild={() => { setAdding(false); setEditing({ wg: null }); }} onClose={() => setAdding(false)} />}
      {editing && <WidgetEditor initial={editing.wg} filters={filters} open={openRecord} subject={board.subject} onClose={() => setEditing(null)}
        onSave={(cfg, title) => { save(editing.wg ? setCustom(board, editing.wg.id, cfg, title) : addCustom(board, cfg, title)); setEditing(null); }} />}
      {dataOpen && <DataDrawer onClose={() => setDataOpen(false)} />}
      {drill && <DrillDrawer wg={drill} state={full2} me={me} filters={f2} onClose={() => setDrill(null)} />}
      {zoom && <Modal onClose={() => setZoom(null)} label={zoom.title || METRICS[zoom.metric]?.label}>
        <div className="sit sit-zoom" data-sit-theme={board?.theme || 'graphite'} data-theme={board?.theme === 'paper' ? 'paper' : undefined}>
          <div className="sit-zoom__head"><b>{zoom.title || METRICS[zoom.metric]?.label}</b><button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" onClick={() => setZoom(null)} aria-label="Закрити"><Icon name="close" size={14} /></button></div>
          <Visual kind={zoom.metric === 'custom' ? cfgOf(zoom).visual : METRICS[zoom.metric]?.kind} v={data[zoom.id]} label={zoom.title} filters={{ ...filters, sel }} setFilter={setFilter} divFilter={METRICS[zoom.metric]?.filters === 'div'} open={(to) => { setZoom(null); openRecord(to); }}
            onPick={zoom.metric === 'custom' && zoom.cfg.group ? (id, lab) => pick(zoom, id, lab) : undefined} />
        </div>
      </Modal>}
    </div>
  );
}
