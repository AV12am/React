// Командна робота: обговорення на записі з @згадками і завдання з термінами.
// A comment and a task take the grif of the record they belong to, so they are seen only by those
// who may see the record; mentioning someone without that clearance is refused at the point of writing.
import { useMemo, useRef, useState } from 'react';
import { useStore, fmtAgo, fmtDate } from '../store.jsx';
import { Avatar } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { notify } from '../lib/notify.js';

const today = () => new Date().toISOString().slice(0, 10);
export const isMine = (t, me) => t.assignee === me.id && t.status !== 'done';
export const overdue = (t) => t.status !== 'done' && t.due && t.due < today();

export { notify };

/** Text with @Name replaced by highlighted spans. */
function Rich({ text, users }) {
  const names = users.map((u) => u.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const re = new RegExp(`@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    parts.push(text.slice(last, m.index), <b key={m.index} className="mention">@{m[1]}</b>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

export function Discussion({ target, label, level = 0, link }) {
  const { state, me, dispatch } = useStore();
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(null); // { q, at }
  const area = useRef(null);
  const people = state.users.filter((u) => u.status !== 'suspended' && u.id !== me.id);
  const list = (state.comments || []).filter((c) => c.target === target && (c.clearance ?? 0) <= me.clearance);
  const author = (id) => state.users.find((u) => u.id === id);
  const options = picker ? people.filter((u) => u.name.toLowerCase().includes(picker.q.toLowerCase())).slice(0, 6) : [];

  const onChange = (e) => {
    const v = e.target.value;
    setText(v);
    const pos = e.target.selectionStart;
    const m = /@([\p{L}'’-]*)$/u.exec(v.slice(0, pos));
    setPicker(m ? { q: m[1], at: pos - m[0].length } : null);
  };
  const choose = (u) => {
    const before = text.slice(0, picker.at);
    const after = text.slice(picker.at + 1 + picker.q.length);
    const v = `${before}@${u.name} ${after}`;
    setText(v); setPicker(null);
    requestAnimationFrame(() => { area.current?.focus(); const p = before.length + u.name.length + 2; area.current?.setSelectionRange(p, p); });
  };
  const mentioned = people.filter((u) => text.includes(`@${u.name}`));
  const blocked = mentioned.filter((u) => (u.clearance ?? 0) < level);
  const post = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || blocked.length) return;
    const ids = mentioned.map((u) => u.id);
    dispatch({ type: 'comment/add', label, comment: { target, text: t, mentions: ids, clearance: level } });
    notify(ids, `${me.name} згадав(-ла) вас`, `«${label}»: ${t.slice(0, 120)}`, link);
    setText('');
  };
  return (
    <div className="stack discussion">
      <div className="vx-eyebrow">Обговорення · {list.length}</div>
      {list.map((c) => {
        const u = author(c.author);
        return (
          <div key={c.id} className="comment">
            <Avatar name={u?.name || '?'} />
            <div className="comment__body">
              <div className="comment__head"><b>{u?.name || 'Невідомий'}</b> <span className="vx-hint">{fmtAgo(c.at)}</span>
                {(c.author === me.id || me.role === 'admin') && <button className="ws-link comment__del" onClick={() => dispatch({ type: 'comment/delete', id: c.id, label })} aria-label="Видалити коментар">видалити</button>}
              </div>
              <div className="comment__text"><Rich text={c.text} users={state.users} /></div>
            </div>
          </div>
        );
      })}
      <form className="comment__form" onSubmit={post}>
        <div className="comment__input">
          <textarea ref={area} className="vx-input ws-textarea" rows={2} value={text} onChange={onChange} placeholder="Коментар… @ — згадати колегу" aria-label="Коментар"
            onKeyDown={(e) => {
              if (picker && options.length && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); choose(options[0]); }
              else if (e.key === 'Escape') setPicker(null);
              else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) post(e);
            }} />
          {picker && options.length > 0 && (
            <div className="mention-menu vx-panel" role="listbox">
              {options.map((u) => (
                <button type="button" key={u.id} role="option" className="list__row list__row--btn" onMouseDown={(e) => { e.preventDefault(); choose(u); }}>
                  <span>{u.name}</span><span className="vx-hint">{u.title || ''}{(u.clearance ?? 0) < level ? ' · без допуску' : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {blocked.length > 0 && <div className="vx-error">{blocked.map((u) => u.name).join(', ')} — без допуску до цього запису: згадку не буде надіслано.</div>}
        <div className="toolbar">
          <button className="vx-btn vx-btn--sm vx-btn--primary" disabled={!text.trim() || blocked.length > 0}>Надіслати</button>
          <span className="vx-hint">Ctrl + Enter</span>
        </div>
      </form>
    </div>
  );
}

/** A task line: tick, title, who, when. */
export function TaskRow({ t, go }) {
  const { state, me, dispatch } = useStore();
  const who = state.users.find((u) => u.id === t.assignee);
  const target = t.target && (state.records || []).find((r) => r.id === t.target);
  const canTick = t.assignee === me.id || t.author === me.id || ['admin', 'lead'].includes(me.role);
  return (
    <div className={`task ${t.status === 'done' ? 'is-done' : ''} ${overdue(t) ? 'is-late' : ''}`}>
      <input type="checkbox" checked={t.status === 'done'} disabled={!canTick} aria-label={`Виконано: ${t.title}`}
        onChange={(e) => dispatch({ type: 'task/update', id: t.id, patch: { status: e.target.checked ? 'done' : 'open', doneAt: e.target.checked ? new Date().toISOString() : null }, note: e.target.checked ? 'виконано' : 'знову відкрито' })} />
      <div className="task__body">
        <div className="task__title">{t.title}</div>
        <div className="vx-hint">
          {who?.name || '—'}{t.due ? ` · ${overdue(t) ? 'прострочено ' : 'до '}${fmtDate(t.due, false)}` : ''}
          {target && go && <> · <button className="ws-link" onClick={() => go('divisions', target.div, `${target.col}:${target.id}`)}>{target.title || target.name || target.statement}</button></>}
        </div>
      </div>
      {(t.author === me.id || me.role === 'admin') && <button className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" onClick={() => dispatch({ type: 'task/delete', id: t.id })} aria-label="Видалити завдання"><Icon name="trash" /></button>}
    </div>
  );
}

export function TaskForm({ target, label, level = 0, link, onDone }) {
  const { state, me, dispatch } = useStore();
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState(me.id);
  const [due, setDue] = useState('');
  const people = useMemo(() => state.users.filter((u) => u.status !== 'suspended' && (u.clearance ?? 0) >= level), [state.users, level]);
  const add = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    dispatch({ type: 'task/add', task: { title: title.trim(), assignee, due: due || null, target: target || null, clearance: level } });
    if (assignee !== me.id) notify([assignee], `Нове завдання від ${me.name}`, `${title.trim()}${due ? ` · до ${due}` : ''}${label ? ` · «${label}»` : ''}`, link);
    setTitle(''); setDue('');
    onDone?.();
  };
  return (
    <form className="task-form" onSubmit={add}>
      <input className="vx-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Що зробити" aria-label="Завдання" />
      <select className="vx-select" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Виконавець">
        {people.map((u) => <option key={u.id} value={u.id}>{u.id === me.id ? `${u.name} (я)` : u.name}</option>)}
      </select>
      <input className="vx-input" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Термін" />
      <button className="vx-btn vx-btn--sm" disabled={!title.trim()}><Icon name="plus" /> Завдання</button>
    </form>
  );
}

/** Tasks tied to one record, with a quick form. */
export function RecordTasks({ target, label, level, link, go }) {
  const { state, me } = useStore();
  const list = (state.tasks || []).filter((t) => t.target === target && (t.clearance ?? 0) <= me.clearance);
  return (
    <div className="stack">
      <div className="vx-eyebrow">Завдання · {list.filter((t) => t.status !== 'done').length}</div>
      {list.map((t) => <TaskRow key={t.id} t={t} go={go} />)}
      <TaskForm target={target} label={label} level={level} link={link} />
    </div>
  );
}

/** Overview panel: my tasks, the ones I gave, and (for leads) all open ones. */
export function TasksPanel({ go }) {
  const { state, me } = useStore();
  const [tab, setTab] = useState('mine');
  const all = (state.tasks || []).filter((t) => (t.clearance ?? 0) <= me.clearance);
  const sets = {
    mine: all.filter((t) => t.assignee === me.id && t.status !== 'done'),
    given: all.filter((t) => t.author === me.id && t.assignee !== me.id && t.status !== 'done'),
    done: all.filter((t) => (t.assignee === me.id || t.author === me.id) && t.status === 'done').slice(0, 10),
  };
  const shown = [...sets[tab]].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  return (
    <div className="vx-panel tasks-panel">
      <header className="vx-panel__head">
        <h2 className="vx-panel__title">Завдання</h2>
        <span className="segmented">
          {[['mine', `Мої · ${sets.mine.length}`], ['given', `Доручені · ${sets.given.length}`], ['done', 'Виконані']].map(([id, l]) => (
            <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{l}</button>
          ))}
        </span>
      </header>
      <div className="vx-panel__body stack">
        {shown.map((t) => <TaskRow key={t.id} t={t} go={go} />)}
        {!shown.length && <div className="vx-hint">{tab === 'mine' ? 'Відкритих завдань немає.' : tab === 'given' ? 'Ви нікому не доручали завдань.' : 'Ще нічого не виконано.'}</div>}
        <TaskForm />
      </div>
    </div>
  );
}
