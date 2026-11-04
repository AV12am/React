// SITUATION — the platform's dashboards: a grid of widgets the analyst arranges, from templates the popular platforms
// ship (an executive overview, projects and tasks, the situation). Every number is counted from what the person may
// see (src/lib/situation.js); a bar filters the whole dashboard, a row opens its record.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, fmtAgo } from '../store.jsx';
import { Panel, Trend, Avatar, Drawer, InfoTip, ClassBadge } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { Pulse } from '../components/Pulse.jsx';
import { ask } from '../components/Dialog.jsx';
import { LEVELS } from '../data/clearance.js';
import { VISIBLE_DIVISIONS } from '../data/seed.js';
import { METRICS, TEMPLATES, PERIODS, newBoard, boardsFor, scope, compute, addWidget, moveWidget, placeWidget, resizeWidget, removeWidget } from '../lib/situation.js';

const KIND_LABEL = { kpi: 'Показник', line: 'Динаміка', bars: 'Порівняння', table: 'Таблиця', feed: 'Стрічка', pulse: 'Індекс', news: 'Новини' };

function Kpi({ v }) {
  return (
    <div className="sit-kpi">
      <div className={`sit-kpi__value vx-num ${v.bad && v.value ? 'is-bad' : ''}`}>{v.value}</div>
      {v.delta != null && <div className={`sit-kpi__delta vx-num ${v.delta > 0 ? 'is-up' : v.delta < 0 ? 'is-down' : ''}`}>{v.delta > 0 ? '+' : ''}{v.delta} до попереднього періоду</div>}
      {v.note && <div className="vx-hint">{v.note}</div>}
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
          <span className="sit-bar__track"><span style={{ width: `${(r.value / max) * 100}%` }} /></span>
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
            <tr key={r.id} className={`${r.to ? 'is-link' : ''} ${r.late ? 'is-late' : ''}`} onClick={r.to ? () => open(r.to) : undefined}>
              {r.cells.map((c, i) => <td key={i}>{c}</td>)}
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

function Widget({ wg, data, edit, filters, setFilter, open, go, board, save, drag, setDrag }) {
  const m = METRICS[wg.metric];
  if (!m) return null;
  const v = data;
  const controls = edit && (
    <div className="sit-widget__tools">
      <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" title="Раніше" aria-label="Перемістити раніше" onClick={() => save(moveWidget(board, wg.id, -1))}><Icon name="chevron" size={14} /></button>
      <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" title="Пізніше" aria-label="Перемістити пізніше" onClick={() => save(moveWidget(board, wg.id, 1))}><Icon name="chevron" size={14} /></button>
      <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm vx-num" title="Ширина" onClick={() => save(resizeWidget(board, wg.id))}>{wg.w}/12</button>
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
  const body = m.kind === 'kpi' ? <Kpi v={v} />
    : m.kind === 'line' ? <Trend data={v.data} labels={v.labels} height={180} />
      : m.kind === 'bars' ? <Bars v={v} active={m.filters === 'div' ? filters.div : null} onPick={m.filters === 'div' ? (id) => setFilter({ div: filters.div === id ? '' : id }) : null} />
        : m.kind === 'table' ? <Table v={v} open={open} />
          : m.kind === 'feed' ? <Feed v={v} />
            : m.kind === 'news' ? <News /> : null;
  return (
    <div className={cls} {...dnd}>
      <Panel title={wg.title || m.label} info={m.about} action={controls} className="sit-panel">{body}</Panel>
    </div>
  );
}

function TemplatePicker({ onPick, onClose }) {
  return (
    <Drawer title="Новий дашборд" onClose={onClose}>
      <div className="stack">
        <p className="vx-hint">Оберіть шаблон. Віджети можна буде додати, прибрати, переставити й змінити ширину.</p>
        {TEMPLATES.map((t) => (
          <button type="button" key={t.id} className="sit-template" onClick={() => onPick(t.id)}>
            <b>{t.name}</b><span className="vx-hint">{t.about}</span>
          </button>
        ))}
      </div>
    </Drawer>
  );
}

function WidgetPicker({ onPick, onClose }) {
  const groups = Object.entries(METRICS).reduce((m, [id, x]) => { (m[x.kind] ||= []).push([id, x]); return m; }, {});
  return (
    <Drawer title="Додати віджет" onClose={onClose}>
      <div className="stack">
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

export function Situation({ focus, go }) {
  const { state, me, dispatch, toast } = useStore();
  const boards = useMemo(() => boardsFor(state.boards, me), [state.boards, me]);
  const board = boards.find((b) => b.id === focus) || boards[0] || null;
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState(false);
  const [drag, setDrag] = useState(null);
  const [filters, setFilters] = useState({ days: 30, div: '' });
  const box = useRef(null);
  useEffect(() => { if (board) setFilters({ days: board.filters?.days || 30, div: board.filters?.div || '' }); }, [board?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = board && board.owner === me.id;
  const save = (next) => dispatch({ type: 'board/update', id: next.id, patch: { widgets: next.widgets } });
  const patch = (p) => board && dispatch({ type: 'board/update', id: board.id, patch: p });
  const setFilter = (p) => setFilters((f) => ({ ...f, ...p }));
  const create = (tpl) => {
    const b = newBoard(tpl, me);
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
  const data = useMemo(() => Object.fromEntries((board?.widgets || []).map((wg) => [wg.id, compute(wg.metric, s)])), [board?.widgets, s]);

  if (!board) {
    return (
      <div className="page">
        <header className="page__head"><div><div className="vx-eyebrow">SITUATION · дашборди</div><h1 className="vx-h1">Дашборди</h1></div></header>
        <div className="sit-start">
          <p className="vx-hint">Дашборд — сітка віджетів із даних платформи: показники, динаміка, порівняння, таблиці, стрічки. Почніть із шаблону.</p>
          <div className="sit-start__grid">
            {TEMPLATES.map((t) => (
              <button type="button" key={t.id} className="sit-template" onClick={() => create(t.id)}><b>{t.name}</b><span className="vx-hint">{t.about}</span></button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page sit" ref={box}>
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">SITUATION · дашборди</div>
          {edit && mine
            ? <input className="vx-input sit-name" value={board.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Назва дашборда" />
            : <h1 className="vx-h1">{board.name}</h1>}
        </div>
        <div className="toolbar">
          {mine && <button type="button" className={`vx-btn ${edit ? 'vx-btn--primary' : 'vx-btn--ghost'} vx-btn--sm`} onClick={() => setEdit(!edit)}><Icon name={edit ? 'check' : 'settings'} size={14} /> {edit ? 'Готово' : 'Редагувати'}</button>}
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
        <select className="vx-select sit-select" value={filters.div} onChange={(e) => setFilter({ div: e.target.value })} aria-label="Напрям">
          <option value="">Усі напрями</option>
          {VISIBLE_DIVISIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {filters.div && <button type="button" className="vx-tag sit-chip" onClick={() => setFilter({ div: '' })}>{VISIBLE_DIVISIONS.find((d) => d.id === filters.div)?.name} <Icon name="close" size={12} /></button>}
        <span className="grow" />
        {edit && mine && <>
          <label className="vx-check sit-share"><input type="checkbox" checked={!!board.shared} onChange={(e) => patch({ shared: e.target.checked })} /> Поділитися з командою</label>
          <select className="vx-select sit-select" value={board.clearance ?? 0} onChange={(e) => patch({ clearance: +e.target.value })} aria-label="Гриф дашборда">
            {LEVELS.filter((l) => l.id <= me.clearance).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => patch({ filters })}>Зберегти фільтри</button>
          <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Віджет</button>
          <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={remove}><Icon name="trash" size={14} /> Видалити</button>
        </>}
        {!edit && <span className="vx-hint">{board.shared ? 'Спільний' : 'Особистий'} · <ClassBadge level={board.clearance ?? 0} /> <InfoTip end>Числа пораховано з даних, які ви бачите за своїм допуском. Натисніть стовпчик напряму — увесь дашборд відфільтрується.</InfoTip></span>}
      </div>

      {!board.widgets.length && <div className="vx-empty"><Icon name="overview" /><div>Віджетів ще немає</div>{mine && <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => { setEdit(true); setAdding(true); }}><Icon name="plus" size={14} /> Додати віджет</button>}</div>}
      <div className="sit-grid">
        {board.widgets.map((wg) => (
          <Widget key={wg.id} wg={wg} data={data[wg.id]} edit={edit && mine} filters={filters} setFilter={setFilter} open={openRecord} go={go} board={board} save={save} drag={drag} setDrag={setDrag} />
        ))}
      </div>

      {picking && <TemplatePicker onPick={create} onClose={() => setPicking(false)} />}
      {adding && <WidgetPicker onPick={(id) => { save(addWidget(board, id)); setAdding(false); }} onClose={() => setAdding(false)} />}
    </div>
  );
}
