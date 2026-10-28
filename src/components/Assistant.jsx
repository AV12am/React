// «Помічник» — the AI assistant docked on the right. It answers questions about the platform, takes the
// person to sections and records, and proposes actions (a task, a working entry, a new record) that run
// only after «Підтвердити». What it may see and do is decided in src/lib/assistant.js.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { Icon } from './Icon.jsx';
import { Loader } from '../brand/Mark.jsx';
import { ClassBadge } from './ui.jsx';
import { supabaseOn, callApi } from '../lib/supabase.js';
import { GUIDE, buildContext, parseReply, checkAction, recordRoute, openRecord } from '../lib/assistant.js';
import { DIVISIONS } from '../data/seed.js';
import { registerOf } from '../data/workspaces.js';

const START = ['Що можна зробити на цій сторінці?', 'Як додати файли до проєкту?', 'Створи завдання перевірити джерела до п’ятниці', 'Знайди дослідження'];

function ActionCard({ a, onDone }) {
  const { state, me, dispatch, toast } = useStore();
  const [status, setStatus] = useState('');
  const run = () => {
    if (a.kind === 'task') dispatch({ type: 'task/add', task: a.task });
    if (a.kind === 'entry') {
      const reg = registerOf(a.record.div, a.record.col);
      const d = DIVISIONS.find((x) => x.id === a.record.div);
      const rec = (state.records || []).find((r) => r.id === a.record.id) || a.record;
      const entry = { id: `e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: new Date().toISOString(), author: me.id, ...a.entry };
      dispatch({ type: 'record/update', id: rec.id, patch: { entries: [entry, ...(rec.entries || [])] }, where: `${d?.name} · ${reg?.name}`, label: rec[reg?.title] || '', note: 'новий запис (через помічника)' });
    }
    if (a.kind === 'record') {
      const id = `w-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      dispatch({ type: 'record/add', record: { id, ...a.record }, where: `${a.d.name} · ${a.reg.name}`, label: a.record[a.reg.title] });
      onDone(['divisions', a.d.id, `${a.reg.id}:${id}`]);
    }
    setStatus('done');
    toast('Готово');
  };
  if (a.error) return <div className="ai-act ai-act--err vx-hint"><Icon name="warn" size={14} /> {a.error}</div>;
  return (
    <div className="ai-act">
      <div className="ai-act__label">{a.label}</div>
      {status === 'done' ? <div className="vx-hint"><Icon name="check" size={14} /> Виконано</div>
        : status === 'no' ? <div className="vx-hint">Скасовано</div>
        : <div className="toolbar"><button className="vx-btn vx-btn--primary vx-btn--sm" onClick={run}><Icon name="check" /> Підтвердити</button><button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setStatus('no')}>Скасувати</button></div>}
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

export function Assistant({ onClose, go, route, allowed }) {
  const ctx = useStore();
  const { state, me, perms } = ctx;
  const [msgs, setMsgs] = useState([]); // { role, content, actions? }
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(null);
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !document.querySelector('.vx-drawer, .vx-modal')) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

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
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      });
      const { reply, actions } = parseReply(r.reply);
      const checked = actions.map((a) => checkAction(a, { state, me, perms, route, allowed }));
      // Going somewhere, or opening the one record found, happens at once; changes wait for confirmation.
      const nav = checked.find((a) => a.kind === 'go') || checked.find((a) => a.kind === 'results' && a.auto);
      if (nav) go(...(nav.kind === 'go' ? nav.route : recordRoute(nav.found[0])));
      setMsgs([...history, { role: 'assistant', content: reply || (checked.length ? '' : 'Не маю відповіді.'), actions: checked }]);
      if (r.limit) setLeft(Math.max(0, r.limit - r.used));
    } catch (e) {
      setMsgs([...history, { role: 'assistant', content: e.message || 'Помічник недоступний', error: true }]);
    } finally { setBusy(false); }
  };

  const rec = openRecord(state, route);
  return (
    <aside className="ai-panel" aria-label="Помічник">
      <header className="ai-panel__head">
        <Icon name="spark" /> <b>Помічник</b>
        <span className="grow" />
        {msgs.length > 0 && <button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setMsgs([])}>Нова розмова</button>}
        <button className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" onClick={onClose} aria-label="Закрити помічника"><Icon name="close" /></button>
      </header>
      <div className="ai-panel__body">
        {!supabaseOn && <div className="vx-hint">Помічник працює на сайті із сервером (Vercel + Supabase).</div>}
        {!msgs.length && (
          <div className="stack">
            <div className="vx-hint">Питайте про платформу, просіть перейти до розділу, знайти запис, створити завдання чи запис. Зміни — лише після вашого «Підтвердити».</div>
            <div className="vx-hint ai-panel__note"><Icon name="shield" size={12} /> Помічник бачить лише відомості з грифом LUMEN{rec && rec.clearance > 0 ? '; вміст цього запису йому недоступний' : ''}.</div>
            <div className="ai-chips">{START.map((s) => <button key={s} className="vx-tag ai-chip" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg--${m.role} ${m.error ? 'ai-msg--err' : ''}`}>
            {m.content && <div className="ai-msg__text" data-no-i18n={m.error ? undefined : ''}>{m.content}</div>}
            {(m.actions || []).map((a, j) => (a.kind === 'results' ? <Results key={j} a={a} go={go} />
              : a.kind === 'go' ? <div key={j} className="vx-hint"><Icon name="chevron" size={12} /> {a.label}</div>
              : <ActionCard key={j} a={a} onDone={(r) => go(...r)} />))}
          </div>
        ))}
        {busy && <div className="ai-msg ai-msg--assistant"><Loader size={20} label="Помічник думає" /></div>}
        <div ref={end} />
      </div>
      <form className="ai-panel__form" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea className="vx-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Запитайте або попросіть…" aria-label="Повідомлення помічнику"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="vx-btn vx-btn--primary vx-btn--icon" disabled={busy || !text.trim()} aria-label="Надіслати"><Icon name="chevron" /></button>
      </form>
      {left != null && <div className="vx-hint ai-panel__left">{`Сьогодні лишилось запитів: ${left}`}</div>}
    </aside>
  );
}
