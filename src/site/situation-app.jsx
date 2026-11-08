// The one SITUATION, on the public site (reactioncore.uk/situation): the workspace's dashboards — countries, companies,
// sectors, topics; the World Bank, GDELT, Prozorro, the register of leading companies, CONTEXT News, the risk index;
// one's own tables — for approved people outside the team. No data of the platform: the store below holds only the
// person's own dashboards and tables (Supabase site_boards, theirs alone), and the view is told it is public
// (me.public), so no record, task, project or audit source or widget is offered.
import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import '@fontsource-variable/inter/wght.css';
import '@fontsource/cormorant-garamond/cyrillic-500.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/jetbrains-mono/cyrillic-500.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '../styles/tokens.css';
import '../styles/components.css';
import '../styles/app.css';
import '../styles/v0-bridge.css';
import '../styles/refresh.css';
import './site.css';
import './area.css';
import './chrome.js';
import { StoreContext } from '../store.jsx';
import { Toasts } from '../components/ui.jsx';
import { DialogHost } from '../components/Dialog.jsx';
import { setTokenSource } from '../lib/supabase.js';
import { Situation } from '../views/Situation.jsx';
import { guard, rest, session } from './auth.js';

setTokenSource(async () => (await session())?.access_token || '');

// Boards and tables as rows of site_boards: { id: 'b:…' | 'd:…', doc }.
const load = async () => {
  const rows = (await rest('site_boards?select=id,doc&order=updated_at.asc').catch(() => [])) || [];
  return {
    boards: rows.filter((r) => r.id.startsWith('b:')).map((r) => r.doc),
    datasets: rows.filter((r) => r.id.startsWith('d:')).map((r) => r.doc),
  };
};
const put = (uid, key, doc) => rest('site_boards?on_conflict=user_id,id', { method: 'POST', body: { user_id: uid, id: key, doc, updated_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
const drop = (key) => rest(`site_boards?id=eq.${encodeURIComponent(key)}`, { method: 'DELETE', prefer: 'return=minimal' });

function reduce(state, a) {
  const now = new Date().toISOString();
  switch (a.type) {
    case 'loaded': return { ...state, ...a.data };
    case 'board/add': return { ...state, boards: [...state.boards, a.board] };
    case 'board/update': return { ...state, boards: state.boards.map((b) => (b.id === a.id ? { ...b, ...a.patch, updated: now } : b)) };
    case 'board/delete': return { ...state, boards: state.boards.filter((b) => b.id !== a.id) };
    case 'dataset/add': return { ...state, datasets: [...state.datasets, a.dataset] };
    case 'dataset/update': return { ...state, datasets: state.datasets.map((d) => (d.id === a.id ? { ...d, ...a.patch, updated: now } : d)) };
    case 'dataset/delete': return { ...state, datasets: state.datasets.filter((d) => d.id !== a.id) };
    default: return state;
  }
}

function App({ me }) {
  const [state, base] = useReducer(reduce, { boards: [], datasets: [], records: [], tasks: [], audit: [], users: [me], settings: { theme: 'matte', lang: 'uk' } });
  const [toasts, setToasts] = useState([]);
  const [focus, setFocus] = useState(() => new URLSearchParams(location.search).get('b') || null);
  useEffect(() => { load().then((data) => base({ type: 'loaded', data })); }, []);
  // Every change is saved as it is made: the person's row in site_boards (row-level security keeps it theirs).
  const dispatch = useCallback((a) => {
    base(a);
    const save = (key, doc) => put(me.id, key, doc).catch(() => setToasts((t) => [...t, { id: Date.now(), text: 'Не збережено — перевірте з’єднання', kind: 'danger' }]));
    if (a.type === 'board/add') save(`b:${a.board.id}`, a.board);
    if (a.type === 'dataset/add') save(`d:${a.dataset.id}`, a.dataset);
    if (a.type === 'board/delete') drop(`b:${a.id}`).catch(() => {});
    if (a.type === 'dataset/delete') drop(`d:${a.id}`).catch(() => {});
  }, [me.id]);
  // Updates are saved from the state they produce.
  useEffect(() => {
    const t = setTimeout(() => {
      state.boards.forEach((b) => b.updated && put(me.id, `b:${b.id}`, b).catch(() => {}));
      state.datasets.forEach((d) => d.updated && put(me.id, `d:${d.id}`, d).catch(() => {}));
    }, 800);
    return () => clearTimeout(t);
  }, [state.boards, state.datasets, me.id]);
  const toast = useCallback((text, kind = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const go = (section, id) => {
    if (section !== 'situation') return; // nothing else of the workspace exists here
    setFocus(id || null);
    const u = new URL(location.href);
    if (id) u.searchParams.set('b', id); else u.searchParams.delete('b');
    history.replaceState(null, '', u);
  };
  const value = useMemo(() => ({ state, me, dispatch, toast, userById: (id) => (id === me.id ? me : null) }), [state, me, dispatch, toast]);
  return (
    <StoreContext.Provider value={value}>
      <div className="sit-public" data-theme="matte">
        <Situation key={focus || 'board'} focus={focus} go={go} />
      </div>
      <Toasts items={toasts} />
      <DialogHost />
    </StoreContext.Provider>
  );
}

guard(document.getElementById('gate'), 'SITUATION', ({ user }) => {
  const box = document.getElementById('situation-root');
  box.hidden = false;
  const me = { id: user.id, name: user.name || user.email || 'Ви', email: user.email, role: 'user', clearance: 0, public: true, status: 'active' };
  createRoot(box).render(<App me={me} />);
});
