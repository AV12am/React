import { useMemo, useState } from 'react';
import { useStore, fmtDate, fmtAgo, canSeeFile } from '../store.jsx';
import { Panel, Drawer, ClassBadge, Avatar } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { DIVISIONS, ROLES, CLEARANCE } from '../data/seed.js';
import { WORKSPACES, registersOf, registerOf, viewsOf } from '../data/workspaces.js';
import { needsReview } from '../lib/provenance.js';
import { wordFor } from '../lib/forecast.js';
import { RecordExtras, ReviewView, ForecastsView, reviewCount } from './Analysis.jsx';
import { WatchView } from './Watch.jsx';
import { CompaniesView } from './Companies.jsx';
import { BUILTIN as ACAD_BUILTIN, BUILTIN_NOTE as ACAD_NOTE, builtinCount } from './AcademyRegisters.jsx';
import { OrgDirectory } from './Orgs.jsx';

const BUILTIN = { ...ACAD_BUILTIN, 'int:orgs': OrgDirectory };
const BUILTIN_NOTE = { ...ACAD_NOTE, 'int:orgs': 'Реєстр організацій' };
import { parseCoords, fmtDD, fmtMGRS, distanceKm, fmtKm } from '../map/coords.js';

/* ---------- access ---------- */

// Members of the division and admins work in it; everyone else with access to Divisions may look.
// Records above a person's clearance stay masked, as in the Vault.
export function workspaceAccess(me, perms, d) {
  const member = me.division === d.id;
  const canEdit = me.role === 'admin' || (member && me.role !== 'guest' && perms.divisions >= 1) || (me.role === 'lead' && d.lead === me.id);
  const canManage = me.role === 'admin' || (me.role === 'lead' && member);
  return { member, canEdit, canManage };
}

const titleOf = (reg, r) => {
  const v = r[reg.title];
  return v == null || v === '' ? 'Без назви' : String(v);
};

/* ---------- values ---------- */

function useLookups(divId) {
  const { state, me } = useStore();
  return useMemo(() => ({
    me,
    user: (id) => state.users.find((u) => u.id === id),
    file: (id) => state.files.find((f) => f.id === id),
    record: (id) => (state.records || []).find((r) => r.id === id && r.div === divId),
    any: (id) => (state.records || []).find((r) => r.id === id),
    visibleIn: (div, col) => (state.records || []).filter((r) => r.div === div && r.col === col && r.clearance <= me.clearance),
    visibleFiles: state.files.filter((f) => canSeeFile(me, f)),
    recordsOf: (col) => (state.records || []).filter((r) => r.div === divId && r.col === col && r.clearance <= me.clearance),
  }), [state.users, state.files, state.records, me, divId]);
}

const short = (v) => String(v).split(' — ')[0];

function FieldValue({ field, value, look, go, compact = false }) {
  if (value == null || value === '') return <span className="vx-hint">—</span>;
  switch (field.type) {
    case 'user': return <span>{look.user(value)?.name ?? '—'}</span>;
    case 'date': return <span className="vx-num">{fmtDate(value, false)}</span>;
    case 'percent': if (field.id === 'probability') return <span className="vx-num">{value}% <span className="vx-hint">{wordFor(value)}</span></span>;
      return <span className="ws-pct"><span className="vx-meter"><span style={{ width: `${Math.min(100, +value)}%` }} /></span><span className="vx-num">{value}%</span></span>;
    case 'url': return <a href={value} target="_blank" rel="noopener noreferrer" className="ws-link" onClick={(e) => e.stopPropagation()}>{compact ? new URL(value, location.href).host : value}</a>;
    case 'select': return <span>{compact ? short(value) : value}</span>;
    case 'file': {
      const f = look.file(value);
      if (!f) return <span className="vx-hint">файл видалено</span>;
      return <button type="button" className="ws-link" onClick={(e) => { e.stopPropagation(); go('vault', f.id); }}><Icon name="file" size={14} /> {f.number ? `${f.number} ` : ''}{f.name}</button>;
    }
    case 'ref': {
      const r = look.record(value);
      if (!r) return <span className="vx-hint">—</span>;
      // A linked record above the reader's clearance stays masked, even inside a lower-level record.
      if (r.clearance > look.me.clearance) return <span title="Гриф вище вашого допуску"><span className="vx-redacted">{'█'.repeat(8)}</span></span>;
      return <span>{titleOf(registerOf(r.div, r.col), r)}</span>;
    }
    case 'links': {
      if (!Array.isArray(value) || !value.length) return <span className="vx-hint">—</span>;
      if (compact) return <span className="vx-num">{value.length} підст.</span>;
      return (
        <span className="ws-links">
          {value.map((id) => {
            const r = look.any(id);
            if (!r) return <span key={id} className="vx-tag vx-hint">видалено</span>;
            if (r.clearance > look.me.clearance) return <span key={id} className="vx-tag"><span className="vx-redacted">{'█'.repeat(6)}</span></span>;
            return <button type="button" key={id} className="vx-tag ws-chip" onClick={() => go('divisions', r.div, `${r.col}:${r.id}`)}>{titleOf(registerOf(r.div, r.col), r)}</button>;
          })}
        </span>
      );
    }
    case 'coords': {
      const c = parseCoords(value);
      if (!c) return <span>{value}</span>;
      return (
        <span className="ws-coords">
          <span className="vx-mono">{fmtDD(c.lat, c.lon)}</span>
          {!compact && <span className="vx-mono vx-hint">{fmtMGRS(c.lat, c.lon)}</span>}
          {!compact && <button type="button" className="ws-link" onClick={() => go('map', `@${c.lat},${c.lon}`)}><Icon name="map" size={14} /> На карті</button>}
        </span>
      );
    }
    case 'longtext': return <span className="ws-long">{value}</span>;
    default: return <span>{String(value)}</span>;
  }
}

// Admiralty grading for an intake item: source reliability letter + information credibility number (e.g. B2).
function grading(r, look) {
  const src = r.source && look.record(r.source);
  const a = src?.reliability && src.clearance <= look.me.clearance ? src.reliability[0] : null;
  const b = r.credibility ? r.credibility[0] : null;
  return a || b ? `${a || '?'}${b || '?'}` : null;
}

/* ---------- form ---------- */

// Several records from the registers in field.refs (any division) — the basis of a judgment or product.
function LinksInput({ field, value, set, look }) {
  const [q, setQ] = useState('');
  const chosen = Array.isArray(value) ? value : [];
  const options = field.refs.flatMap(([div, col]) => look.visibleIn(div, col).map((r) => ({ r, reg: registerOf(div, col) })));
  const shown = options.filter(({ r, reg }) => !q || titleOf(reg, r).toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  const toggle = (id) => set(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  return (
    <div className="ws-picker">
      <input id={`f-${field.id}`} className="vx-input" placeholder="Пошук надходжень і джерел" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="ws-picker__list">
        {shown.map(({ r, reg }) => (
          <label key={r.id} className="check">
            <input type="checkbox" checked={chosen.includes(r.id)} onChange={() => toggle(r.id)} />
            <span>{titleOf(reg, r)} <span className="vx-hint">· {reg.one}</span></span>
          </label>
        ))}
        {!shown.length && <div className="vx-hint">Немає доступних записів.</div>}
      </div>
      <div className="vx-hint">Обрано: {chosen.length}</div>
    </div>
  );
}

function FieldInput({ field, value, set, look, me }) {
  const id = `f-${field.id}`;
  const common = { id, className: 'vx-input', value: value ?? '', onChange: (e) => set(e.target.value) };
  switch (field.type) {
    case 'longtext': return <textarea {...common} className="vx-input ws-textarea" rows={4} />;
    case 'number': return <input {...common} type="number" onChange={(e) => set(e.target.value === '' ? '' : +e.target.value)} />;
    case 'percent': return (
      <div className="ws-range">
        <input id={id} type="range" min="0" max="100" step="5" value={value ?? (field.id === 'probability' ? 50 : 0)} onChange={(e) => set(+e.target.value)} />
        <span className="vx-num">{value ?? (field.id === 'probability' ? 50 : 0)}%{field.id === 'probability' ? ` · ${wordFor(value ?? 50)}` : ''}</span>
      </div>
    );
    case 'links': return <LinksInput field={field} value={value} set={set} look={look} />;
    case 'date': return <input {...common} type="date" />;
    case 'url': return <input {...common} type="url" placeholder="https://" />;
    case 'select': return (
      <select {...common} className="vx-select">
        <option value="">—</option>
        {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    case 'user': return (
      <select {...common} className="vx-select">
        <option value="">—</option>
        {look.users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === me.id ? ' (ви)' : ''}</option>)}
      </select>
    );
    case 'file': return (
      <select {...common} className="vx-select">
        <option value="">—</option>
        {look.visibleFiles.map((f) => <option key={f.id} value={f.id}>{f.number ? `${f.number} · ` : ''}{f.name}</option>)}
      </select>
    );
    case 'ref': return (
      <select {...common} className="vx-select">
        <option value="">—</option>
        {look.recordsOf(field.ref).map((r) => <option key={r.id} value={r.id}>{titleOf(registerOf(r.div, r.col), r)}</option>)}
      </select>
    );
    case 'coords': {
      const c = value ? parseCoords(value) : null;
      return (
        <>
          <input {...common} placeholder="50.4501, 30.5234 або 36U UA 24182 91607" />
          {value && <div className={`vx-hint ${c ? '' : 'ws-bad'}`}>{c ? `${fmtDD(c.lat, c.lon)} · ${fmtMGRS(c.lat, c.lon)}` : 'Не розпізнано: DD, DMS або MGRS'}</div>}
        </>
      );
    }
    default: return <input {...common} />;
  }
}

function RecordDrawer({ d, reg, record, access, onClose, go }) {
  const { state, me, dispatch, toast } = useStore();
  const base = useLookups(d.id);
  const look = { ...base, users: state.users.filter((u) => u.status !== 'suspended') };
  const isNew = !record;
  const [editing, setEditing] = useState(isNew);
  const [draft, setDraft] = useState(() => (record ? { ...record } : {
    stage: reg.stages?.[0] ?? null, clearance: Math.min(reg.level, me.clearance),
    ...(reg.id === 'judgments' ? { probability: 50, outcome: 'Відкрито', analyst: me.id } : {}),
    ...(reg.id === 'watchlists' ? { state: 'Активний', owner: me.id } : {}),
  }));
  const [armed, setArmed] = useState(false);
  const where = `${d.name} · ${reg.name}`;

  const set = (k) => (v) => setDraft((x) => {
    const next = { ...x, [k]: v };
    const want = reg.levelFor?.(next);
    if (want != null && isNew && want > next.clearance) next.clearance = Math.min(want, me.clearance);
    return next;
  });
  const missing = reg.fields.filter((f) => f.required && !f.hidden && (draft[f.id] == null || draft[f.id] === '' || (f.type === 'percent' && draft[f.id] == null)));
  const badCoords = reg.fields.some((f) => f.type === 'coords' && draft[f.id] && !parseCoords(draft[f.id]));
  const canDelete = access.canManage || record?.owner === me.id;

  const save = () => {
    if (missing.length || badCoords) return;
    const clean = Object.fromEntries(Object.entries(draft).filter(([k]) => !['id', 'div', 'col', 'owner', 'at', 'updated'].includes(k)));
    const label = titleOf(reg, draft);
    if (isNew) {
      dispatch({ type: 'record/add', record: { div: d.id, col: reg.id, ...clean }, where, label });
      toast(`Додано: ${label}`);
      onClose();
    } else {
      dispatch({ type: 'record/update', id: record.id, patch: clean, where, label });
      toast('Зміни збережено');
      setEditing(false);
    }
  };
  const remove = () => {
    if (!armed) { setArmed(true); return; }
    dispatch({ type: 'record/delete', id: record.id, where, label: titleOf(reg, record) });
    toast('Видалено');
    onClose();
  };

  const owner = record && look.user(record.owner);
  const src = record || draft;
  const from = reg.fields.find((f) => f.id === 'fromAt'), to = reg.fields.find((f) => f.id === 'toAt');
  const a = from && parseCoords(src.fromAt || ''), b = to && parseCoords(src.toAt || '');
  const grade = reg.id === 'intake' ? grading(src, look) : null;

  return (
    <Drawer title={isNew ? `Новий запис · ${reg.name}` : titleOf(reg, record)} onClose={onClose}
      footer={editing ? <>
        {!isNew && <button className="vx-btn vx-btn--ghost" onClick={() => { setDraft({ ...record }); setEditing(false); }}>Скасувати</button>}
        <button className="vx-btn vx-btn--primary" onClick={save} disabled={!!missing.length || badCoords}><Icon name="check" /> {isNew ? 'Додати' : 'Зберегти'}</button>
      </> : <>
        {canDelete && <button className="vx-btn vx-btn--danger" onClick={remove} onBlur={() => setArmed(false)}><Icon name="trash" /> {armed ? 'Точно видалити?' : 'Видалити'}</button>}
        {access.canEdit && <button className="vx-btn vx-btn--primary" onClick={() => setEditing(true)}>Редагувати</button>}
      </>}>
      {editing ? (
        <div className="stack">
          {reg.stages && (
            <div className="vx-field">
              <span className="vx-label">Етап</span>
              <div className="segmented ws-stages" role="group" aria-label="Етап">
                {reg.stages.map((s) => <button type="button" key={s} className={draft.stage === s ? 'is-active' : ''} onClick={() => set('stage')(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {reg.fields.filter((f) => !f.hidden).map((f) => (
            <div className="vx-field" key={f.id}>
              <label className="vx-label" htmlFor={`f-${f.id}`}>{f.label}{f.required && ' *'}</label>
              <FieldInput field={f} value={draft[f.id]} set={set(f.id)} look={look} me={me} />
              {f.hint && <div className="vx-hint">{f.hint}</div>}
            </div>
          ))}
          <div className="vx-field">
            <label className="vx-label" htmlFor="f-level">Гриф запису</label>
            <select id="f-level" className="vx-select" value={draft.clearance} onChange={(e) => set('clearance')(+e.target.value)}>
              {CLEARANCE.filter((c) => c.id <= me.clearance).map((c) => <option key={c.id} value={c.id}>{c.full}</option>)}
            </select>
            {reg.levelFor?.(draft) != null && <div className="vx-hint">Для цього класу джерел рекомендовано {CLEARANCE[reg.levelFor(draft)].short}.</div>}
          </div>
          {!!missing.length && <div className="vx-hint">Заповніть: {missing.map((f) => f.label).join(', ')}.</div>}
        </div>
      ) : (
        <>
          <div className="ws-head">
            <ClassBadge level={record.clearance} />
            {reg.stages && <span className="vx-tag">{record.stage}</span>}
            {grade && <span className="vx-tag vx-mono" title="Надійність джерела + достовірність інформації">{grade}</span>}
          </div>
          <dl className="meta">
            {reg.fields.filter((f) => !f.hidden).map((f) => <FieldRow key={f.id} f={f} record={record} look={look} go={go} />)}
            {a && b && <><dt>Відстань</dt><dd className="vx-num">{fmtKm(distanceKm(a, b))} по прямій</dd></>}
            <dt>Створив</dt><dd>{owner?.name ?? '—'} · {fmtDate(record.at)}</dd>
            <dt>Змінено</dt><dd>{fmtAgo(record.updated)}</dd>
          </dl>
          <RecordExtras reg={reg} record={record} canEdit={access.canEdit} go={go} />
        </>
      )}
    </Drawer>
  );
}

const FieldRow = ({ f, record, look, go }) => (
  <><dt>{f.label}</dt><dd><FieldValue field={f} value={record[f.id]} look={look} go={go} /></dd></>
);

/* ---------- register views ---------- */

function ReviewFlag({ reg, r }) {
  const { state, me } = useStore();
  if (!['judgments', 'products'].includes(reg.id) || !needsReview(r, state.records || [], me)) return null;
  return <span className="vx-tag ws-flag" title="У ланцюгу підстав щось змінилося — див. «Перегляд»">перегляд</span>;
}

function Card({ reg, r, look, locked, onOpen, draggable, go }) {
  const grade = reg.id === 'intake' && !locked ? grading(r, look) : null;
  return (
    <button className={`ws-card ${locked ? 'is-locked' : ''}`} onClick={() => !locked && onOpen(r)} draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; }}>
      <span className="ws-card__top">
        <ClassBadge level={r.clearance} />
        {grade && <span className="vx-tag vx-mono">{grade}</span>}
        {!locked && <ReviewFlag reg={reg} r={r} />}
      </span>
      <span className="ws-card__title">{locked ? <span className="vx-redacted">{'█'.repeat(14)}</span> : titleOf(reg, r)}</span>
      {!locked && (
        <span className="ws-card__meta">
          {reg.fields.filter((f) => f.list && f.id !== reg.title).slice(0, 3).map((f) => (r[f.id] != null && r[f.id] !== '') && (
            <span key={f.id} className="vx-hint"><FieldValue field={f} value={r[f.id]} look={look} go={go} compact /></span>
          ))}
        </span>
      )}
    </button>
  );
}

function RegisterView({ d, reg, access, go, openId }) {
  const { state, me, dispatch } = useStore();
  const look = useLookups(d.id);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => (openId ? { id: openId } : null)); // record | 'new'
  const [over, setOver] = useState(null);
  const all = (state.records || []).filter((r) => r.div === d.id && r.col === reg.id);
  const locked = (r) => r.clearance > me.clearance;
  const rows = all
    .filter((r) => !q || (!locked(r) && JSON.stringify(reg.fields.map((f) => r[f.id] ?? '')).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  const where = `${d.name} · ${reg.name}`;
  const move = (id, stage) => {
    const r = all.find((x) => x.id === id);
    if (!r || r.stage === stage || locked(r)) return;
    dispatch({ type: 'record/update', id, patch: { stage }, where, label: titleOf(reg, r), note: `етап → ${stage}` });
  };

  const Builtin = BUILTIN[`${d.id}:${reg.id}`];
  return (
    <div className="stack">
      {Builtin && <><Builtin go={go} /><h2 className="vx-h2 ws-own">{BUILTIN_NOTE[`${d.id}:${reg.id}`]}</h2></>}
      <div className="toolbar">
        <div className="vx-search toolbar__grow">
          <Icon name="search" />
          <input className="vx-input" placeholder={`Пошук: ${reg.name.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Пошук" />
        </div>
        {access.canEdit && <button className="vx-btn vx-btn--primary" onClick={() => setOpen('new')}><Icon name="plus" /> Додати {reg.one}</button>}
      </div>

      {reg.stages ? (
        <div className="ws-board">
          {reg.stages.map((s) => {
            const col = rows.filter((r) => (r.stage || reg.stages[0]) === s);
            return (
              <section key={s} className={`ws-col ${over === s ? 'is-over' : ''}`}
                onDragOver={(e) => { if (access.canEdit) { e.preventDefault(); setOver(s); } }}
                onDragLeave={() => setOver((o) => (o === s ? null : o))}
                onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), s); }}>
                <header className="ws-col__head"><span>{s}</span><span className="vx-hint vx-num">{col.length}</span></header>
                <div className="ws-col__body">
                  {col.map((r) => <Card key={r.id} reg={reg} r={r} look={look} locked={locked(r)} onOpen={setOpen} draggable={access.canEdit && !locked(r)} go={go} />)}
                  {!col.length && <div className="ws-col__empty vx-hint">—</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <Panel bodyClass="vx-table-wrap">
          <table className="vx-table">
            <thead><tr>
              <th>{reg.fields.find((f) => f.id === reg.title)?.label}</th>
              {reg.fields.filter((f) => f.list && f.id !== reg.title).map((f) => <th key={f.id}>{f.label}</th>)}
              <th>Гриф</th><th>Змінено</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={locked(r) ? 'is-locked' : 'is-clickable'} onClick={() => !locked(r) && setOpen(r)}>
                  <td>{locked(r) ? <span className="vx-redacted">{'█'.repeat(14)}</span> : <>{titleOf(reg, r)} <ReviewFlag reg={reg} r={r} /></>}</td>
                  {reg.fields.filter((f) => f.list && f.id !== reg.title).map((f) => (
                    <td key={f.id} className="vx-hint">{locked(r) ? '' : <FieldValue field={f} value={r[f.id]} look={look} go={go} compact />}</td>
                  ))}
                  <td><ClassBadge level={r.clearance} /></td>
                  <td className="vx-hint">{fmtAgo(r.updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="vx-empty"><Icon name={reg.icon} /><div>{q ? 'Нічого не знайдено' : `Ще немає записів у «${reg.name}»`}</div></div>}
        </Panel>
      )}

      {open && (open === 'new' || all.some((x) => x.id === open.id && x.clearance <= me.clearance)) && (
        <RecordDrawer key={open === 'new' ? 'new' : open.id} d={d} reg={reg} record={open === 'new' ? null : all.find((x) => x.id === open.id)}
          access={access} onClose={() => setOpen(null)} go={go} />
      )}
    </div>
  );
}

/* ---------- overview ---------- */

function Overview({ d, go, setTab }) {
  const { state, me } = useStore();
  const regs = registersOf(d.id);
  const members = state.users.filter((u) => u.division === d.id);
  const folders = state.folders.filter((f) => f.division === d.id);
  const recs = (state.records || []).filter((r) => r.div === d.id);
  return (
    <div className="stack">
      <div className="grid grid--3">
        {regs.map((reg) => {
          const rs = recs.filter((r) => r.col === reg.id);
          const built = builtinCount(d.id, reg.id, state.users);
          return (
            <button key={reg.id} className="vx-panel ws-reg" onClick={() => setTab(reg.id)}>
              <span className="ws-reg__head"><Icon name={reg.icon} /> <b>{reg.name}</b><span className="vx-num ws-reg__n">{rs.length + built}</span></span>
              {reg.stages ? (
                <span className="ws-reg__stages">
                  {reg.stages.map((s) => <span key={s}><span className="vx-hint">{s}</span> <b className="vx-num">{rs.filter((r) => (r.stage || reg.stages[0]) === s).length}</b></span>)}
                </span>
              ) : <span className="vx-hint">{rs.filter((r) => r.clearance <= me.clearance).length} доступних вам записів</span>}
            </button>
          );
        })}
      </div>
      <div className="grid grid--2">
        <Panel title="Люди" bodyClass="list">
          {members.map((u) => (
            <div className="list__row list__row--top" key={u.id}>
              <Avatar name={u.name} />
              <div className="list__text">
                <div>{u.name} {u.id === d.lead && <span className="vx-tag">керівник</span>}</div>
                <div className="vx-hint">{u.title} · {ROLES.find((r) => r.id === u.role)?.name} · {fmtAgo(u.lastSeen)}</div>
              </div>
            </div>
          ))}
          {!members.length && <div className="list__row vx-hint">У напрямі ще немає людей. Призначте їх у «Доступи».</div>}
        </Panel>
        <Panel title="Папки напряму" bodyClass="list" action={<button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => go('vault')}>Сховище <Icon name="chevron" /></button>}>
          {folders.map((f) => (
            <div className="list__row" key={f.id}>
              <span className="list__lead"><Icon name="folder" size={16} /> {f.name}</span>
              <span className="vx-hint vx-num">{state.files.filter((x) => x.folder === f.id).length} файлів</span>
              <ClassBadge level={f.clearance} />
            </div>
          ))}
          {!folders.length && <div className="list__row vx-hint">Папок напряму ще немає.</div>}
        </Panel>
      </div>
    </div>
  );
}

/* ---------- workspace ---------- */

const VIEWS = { review: ReviewView, forecasts: ForecastsView, watch: WatchView, companies: CompaniesView };

export function Workspace({ divId, tab, go }) {
  const { state, me, perms } = useStore();
  const d = DIVISIONS.find((x) => x.id === divId);
  const regs = registersOf(divId);
  const views = viewsOf(divId);
  // «intake:w-123» opens that record (links from the «звідки ми це знаємо» chain).
  const [tabId, openId] = (tab || '').split(':');
  const current = regs.find((r) => r.id === tabId) || views.find((v) => v.id === tabId) ? tabId : 'overview';
  const access = workspaceAccess(me, perms, d);
  const setTab = (t) => go('divisions', divId, t === 'overview' ? null : t);
  const reg = registerOf(divId, current);
  const View = VIEWS[current];
  const flagged = divId === 'ana' ? reviewCount(state.records || [], me) : 0;

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <button className="vx-eyebrow ws-back" onClick={() => go('divisions')}><Icon name="chevron" size={12} className="ws-back__icon" /> Напрями · {d.code}</button>
          <h1 className="vx-h1 ws-title"><Icon name={d.icon} size={28} /> {d.name}</h1>
          <div className="vx-muted">{WORKSPACES[divId]?.tagline}</div>
        </div>
        <span className="vx-hint">{access.canEdit ? (access.member ? 'Ваш напрям' : 'Повний доступ') : 'Лише перегляд'}</span>
      </header>
      <nav className="vx-tabs" role="tablist">
        <button role="tab" aria-selected={current === 'overview'} className={`vx-tab ${current === 'overview' ? 'is-active' : ''}`} onClick={() => setTab('overview')}>Огляд</button>
        {regs.map((r) => (
          <button key={r.id} role="tab" aria-selected={current === r.id} className={`vx-tab ${current === r.id ? 'is-active' : ''}`} onClick={() => setTab(r.id)}>{r.name}</button>
        ))}
        {views.map((v) => (
          <button key={v.id} role="tab" aria-selected={current === v.id} className={`vx-tab ${current === v.id ? 'is-active' : ''}`} onClick={() => setTab(v.id)}>
            {v.name}{v.id === 'review' && flagged > 0 && <span className="vx-nav-item__count">{flagged}</span>}
          </button>
        ))}
        {divId === 'acad' && <button role="tab" aria-selected="false" className="vx-tab" onClick={() => go('learn')}>Навчання й тести</button>}
      </nav>
      {reg ? <RegisterView key={`${reg.id}:${openId || ''}`} d={d} reg={reg} access={access} go={go} openId={openId} />
        : View ? <View d={d} access={access} go={go} openId={openId} /> : <Overview d={d} go={go} setTab={setTab} />}
    </div>
  );
}
