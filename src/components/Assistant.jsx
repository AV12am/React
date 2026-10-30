// «Помічник» — the AI assistant docked on the right. It answers questions about the platform, takes the
// person to sections and records, and proposes actions (a task, a working entry, a new record) that run
// only after «Підтвердити». What it may see and do is decided in src/lib/assistant.js.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { Icon } from './Icon.jsx';
import { Loader, Mark } from '../brand/Mark.jsx';
import { ClassBadge } from './ui.jsx';
import { supabaseOn, callApi } from '../lib/supabase.js';
import { GUIDE, buildContext, parseReply, checkAction, recordRoute, openRecord, honestyNote } from '../lib/assistant.js';
import { DIVISIONS } from '../data/seed.js';
import { registerOf } from '../data/workspaces.js';

// Quick actions: some ask at once, some start the sentence for the person to finish.
const QUICK = [
  { icon: 'search', label: 'Знайти запис', fill: 'Знайди ' },
  { icon: 'check', label: 'Нове завдання', fill: 'Створи завдання ' },
  { icon: 'chevron', label: 'Відкрити розділ', fill: 'Відкрий розділ ' },
  { icon: 'info', label: 'Що тут можна зробити', ask: 'Що можна зробити на цій сторінці?' },
];

const newId = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Runs a confirmed action, then checks that it really landed in the data before saying so.
function ActionCard({ a, onDone, onOutcome }) {
  const { state, me, dispatch, toast } = useStore();
  const [status, setStatus] = useState('');
  const [made, setMade] = useState(null); // { list, id } — what to look for
  const settle = (s) => { setStatus(s); onOutcome?.(s === 'done' ? `виконано: ${a.label}` : s === 'no' ? `скасовано людиною: ${a.label}` : `НЕ виконано (помилка): ${a.label}`); };
  useEffect(() => {
    if (!made) return undefined;
    const there = made.list === 'tasks' ? (state.tasks || []).some((t) => t.id === made.id)
      : (state.records || []).some((r) => r.id === made.id && (!made.entry || (r.entries || []).some((e) => e.id === made.entry)));
    if (there) { setMade(null); settle('done'); toast('Готово'); return undefined; }
    const t = setTimeout(() => { setMade(null); settle('failed'); }, 3000);
    return () => clearTimeout(t);
  }, [made, state.tasks, state.records]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = () => {
    setStatus('busy');
    if (a.kind === 'task') { const id = newId('tk'); dispatch({ type: 'task/add', task: { id, ...a.task } }); setMade({ list: 'tasks', id }); }
    if (a.kind === 'entry') {
      const reg = registerOf(a.record.div, a.record.col);
      const d = DIVISIONS.find((x) => x.id === a.record.div);
      const rec = (state.records || []).find((r) => r.id === a.record.id) || a.record;
      const entry = { id: newId('e'), at: new Date().toISOString(), author: me.id, ...a.entry };
      dispatch({ type: 'record/update', id: rec.id, patch: { entries: [entry, ...(rec.entries || [])] }, where: `${d?.name} · ${reg?.name}`, label: rec[reg?.title] || '', note: 'новий запис (через помічника)' });
      setMade({ list: 'records', id: rec.id, entry: entry.id });
    }
    if (a.kind === 'record') {
      const id = newId('w');
      dispatch({ type: 'record/add', record: { id, ...a.record }, where: `${a.d.name} · ${a.reg.name}`, label: a.record[a.reg.title] });
      setMade({ list: 'records', id });
      onDone(['divisions', a.d.id, `${a.reg.id}:${id}`]);
    }
  };
  if (a.error) return <div className="ai-act ai-act--err vx-hint"><Icon name="warn" size={14} /> {a.error}</div>;
  return (
    <div className="ai-act">
      <div className="ai-act__label">{a.label}</div>
      {status === 'done' ? <div className="vx-hint"><Icon name="check" size={14} /> Виконано й перевірено</div>
        : status === 'failed' ? <div className="vx-error"><Icon name="warn" size={14} /> Не вдалося — зміну не знайдено в даних. Спробуйте вручну.</div>
        : status === 'busy' ? <div className="vx-hint"><Loader size={14} label="Виконую" /></div>
        : status === 'no' ? <div className="vx-hint">Скасовано</div>
        : <div className="toolbar"><button className="vx-btn vx-btn--primary vx-btn--sm" onClick={run}><Icon name="check" /> Підтвердити</button><button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => settle('no')}>Скасувати</button></div>}
    </div>
  );
}

function Results({ a, go }) {
  return (
    <div className="ai-act">
      <div className="ai-act__label">{a.label}</div>
      <div className="list">
        {a.found.map((r) => (
          <button key={r.id} className="list__row list__row--btn" onClick={() => go(...recordRoute(r))}>
            <ClassBadge level={r.clearance} /> <span className="list__text">{r.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Assistant({ onClose, onBusy, go, route, allowed }) {
  const ctx = useStore();
  const { state, me, perms } = ctx;
  const [msgs, setMsgs] = useState([]); // { role, content, actions? }
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(null);
  const end = useRef(null);
  const input = useRef(null);
  useEffect(() => { onBusy?.(busy); }, [busy, onBusy]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !document.querySelector('.vx-drawer, .vx-modal')) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  // What the answer is based on: the open record (if LUMEN) or the section on screen.
  const sourceOf = () => {
    const r = openRecord(state, route);
    if (r && !(+r.clearance > 0)) return `запис «${String(r[registerOf(r.div, r.col)?.title] || r.title || '').slice(0, 60)}»`;
    const d = DIVISIONS.find((x) => x.id === route?.sub);
    return d ? `напрям «${d.name}»` : 'загальні відомості про платформу';
  };

  const send = async (q) => {
    const question = String(q ?? text).trim();
    if (!question || busy) return;
    setText('');
    const history = [...msgs, { role: 'user', content: question }];
    setMsgs(history);
    setBusy(true);
    try {
      const r = await callApi('assistant', {
        guide: GUIDE,
        context: buildContext({ state, me, route }),
        // What really happened to earlier proposals goes back with the reply, so the model never assumes.
        messages: history.map((m) => ({ role: m.role, content: [m.content, ...(m.outcomes || []).map((o) => `[Система: ${o}]`)].filter(Boolean).join('\n') })),
      });
      const { reply, actions } = parseReply(r.reply);
      const checked = actions.map((a) => checkAction(a, { state, me, perms, route, allowed }));
      // Going somewhere, or opening the one record found, happens at once; changes wait for confirmation.
      const nav = checked.find((a) => a.kind === 'go') || checked.find((a) => a.kind === 'results' && a.auto);
      if (nav) go(...(nav.kind === 'go' ? nav.route : recordRoute(nav.found[0])));
      setMsgs([...history, { role: 'assistant', content: reply || (checked.length ? '' : 'Не маю відповіді.'), actions: checked, note: honestyNote(reply, checked), source: sourceOf() }]);
      if (r.limit) setLeft(Math.max(0, r.limit - r.used));
    } catch (e) {
      setMsgs([...history, { role: 'assistant', content: e.message || 'Помічник недоступний', error: true }]);
    } finally { setBusy(false); }
  };

  const rec = openRecord(state, route);
  const outcome = (i) => (o) => setMsgs((list) => list.map((m, k) => (k === i ? { ...m, outcomes: [...(m.outcomes || []), o] } : m)));
  return (
    <aside className="ai-panel" aria-label="Помічник">
      <header className="ai-panel__head">
        <span className={`ai-panel__mark ${busy ? 'is-thinking' : ''}`}><Mark size={22} title="" /></span>
        <div className="ai-panel__title"><b>Помічник</b>{busy && <span className="vx-hint">думаю…</span>}</div>
        <span className="grow" />
        {msgs.length > 0 && <button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setMsgs([])}>Нова розмова</button>}
        <button className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" onClick={onClose} aria-label="Закрити помічника"><Icon name="close" /></button>
      </header>
      <div className="ai-panel__body">
        {!supabaseOn && <div className="vx-hint">Помічник працює на сайті із сервером (Vercel + Supabase).</div>}
        {!msgs.length && (
          <div className="stack">
            <div className="ai-quick">
              {QUICK.map((q) => (
                <button key={q.label} className="ai-quick__btn" onClick={() => { if (q.ask) send(q.ask); else { setText(q.fill); input.current?.focus(); } }}>
                  <Icon name={q.icon} size={15} /> {q.label}
                </button>
              ))}
            </div>
            <div className="vx-hint ai-panel__note"><Icon name="shield" size={12} /> Бачить лише LUMEN{rec && rec.clearance > 0 ? ' — цей запис йому недоступний' : ''}. Зміни — лише після вашого «Підтвердити».</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg--${m.role} ${m.error ? 'ai-msg--err' : ''}`}>
            {m.content && <div className="ai-msg__text" data-no-i18n={m.error ? undefined : ''}>{m.content}</div>}
            {(m.actions || []).map((a, j) => (a.kind === 'results' ? <Results key={j} a={a} go={go} />
              : a.kind === 'go' ? <div key={j} className="vx-hint"><Icon name="chevron" size={12} /> {a.label}</div>
              : <ActionCard key={j} a={a} onDone={(r) => go(...r)} onOutcome={outcome(i)} />))}
            {m.note && <div className={m.note.startsWith('Увага') ? 'vx-error ai-msg__note' : 'vx-hint ai-msg__note'}>{m.note}</div>}
            {m.role === 'assistant' && !m.error && m.source && <div className="ai-msg__src">Джерело: {m.source}</div>}
          </div>
        ))}
        {busy && <div className="ai-msg ai-msg--assistant ai-msg__thinking"><span className="is-thinking"><Mark size={16} title="" /></span> Думаю…</div>}
        <div ref={end} />
      </div>
      <form className="ai-panel__form" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea ref={input} className="vx-input" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Запитайте або попросіть…" aria-label="Повідомлення помічнику"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="vx-btn vx-btn--primary vx-btn--icon" disabled={busy || !text.trim()} aria-label="Надіслати"><Icon name="chevron" /></button>
      </form>
      {left != null && <div className="vx-hint ai-panel__left">{`Сьогодні лишилось запитів: ${left}`}</div>}
    </aside>
  );
}
