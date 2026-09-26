import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { StoreProvider, useStore } from './store.jsx';
import { Wordmark, Mark, Loader } from './brand/Mark.jsx';
import { Icon } from './components/Icon.jsx';
import { Avatar, Toasts, Modal, ClassBadge } from './components/ui.jsx';
import { Splash, Login, Lock } from './views/Entry.jsx';
import { Dashboard } from './views/Dashboard.jsx';
import { Divisions } from './views/Divisions.jsx';
import { Access } from './views/Access.jsx';
import { Vault } from './views/Vault.jsx';
import { Audit } from './views/Audit.jsx';
import { Settings } from './views/Settings.jsx';
import { ROLES, CLEARANCE } from './data/seed.js';
import { TRACKS } from './data/geo.js';
import { canSeeFile, fmtAgo } from './store.jsx';

// The map ships its own geography (~1 MB), so it loads only when opened.
const MapView = lazy(() => import('./views/Map.jsx').then((m) => ({ default: m.MapView })));

const NAV = [
  { id: 'overview', label: 'Огляд', icon: 'overview' },
  { id: 'divisions', label: 'Напрями', icon: 'divisions' },
  { id: 'access', label: 'Доступи', icon: 'access' },
  { id: 'vault', label: 'Сховище', icon: 'vault' },
  { id: 'map', label: 'Карта', icon: 'map' },
  { id: 'audit', label: 'Журнал аудиту', icon: 'audit' },
  { id: 'settings', label: 'Налаштування', icon: 'settings', always: true },
];

export default function App() {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}

function Root() {
  const { state, me, toasts } = useStore();
  const [booted, setBooted] = useState(false);
  const done = useCallback(() => setBooted(true), []);

  useEffect(() => {
    document.body.style.background = state.settings.theme === 'paper' ? '#ffffff' : '#0a0a0a';
  }, [state.settings.theme]);

  return (
    <div data-theme={state.settings.theme} className={`vx-root vx-grain app-root ${state.settings.sensitive ? '' : 'vx-sensitive-off'}`}>
      {!booted ? <Splash onDone={done} /> : me ? <Shell /> : <Login />}
      <Toasts items={toasts} />
    </div>
  );
}

const readHash = () => {
  const [view = 'overview', sub = null, id = null] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { view: view || 'overview', sub, id };
};

function Shell() {
  const { state, me, perms, dispatch } = useStore();
  const [{ view, sub, id }, setRoute] = useState(readHash);
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [bell, setBell] = useState(false);
  const locked = !!state.session?.locked;

  const allowed = NAV.filter((n) => n.always || perms[n.id] > 0);
  const current = allowed.find((n) => n.id === view) ? view : allowed[0].id;
  const pending = state.requests.filter((r) => r.status === 'pending').length;

  const go = useCallback((v, s = null, i = null) => {
    location.hash = `/${v}${s ? `/${encodeURIComponent(s)}` : ''}${i ? `/${encodeURIComponent(i)}` : ''}`;
    setRoute({ view: v, sub: s, id: i });
    setMenu(false);
    setPalette(false);
    setBell(false);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const h = () => setRoute(readHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  const lock = useCallback(() => { dispatch({ type: 'lock' }); setPalette(false); setBell(false); }, [dispatch]);

  // Keyboard: Ctrl/Cmd+K palette, Ctrl/Cmd+L lock.
  useEffect(() => {
    const h = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
      if (e.key.toLowerCase() === 'l') { e.preventDefault(); lock(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lock]);

  // Auto-lock after inactivity.
  useEffect(() => {
    if (locked) return;
    let t;
    const reset = () => { clearTimeout(t); t = setTimeout(lock, state.settings.lockMinutes * 60000); };
    const ev = ['mousemove', 'keydown', 'pointerdown', 'scroll'];
    ev.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(t); ev.forEach((e) => window.removeEventListener(e, reset)); };
  }, [locked, lock, state.settings.lockMinutes]);

  if (locked) return <Lock onUnlock={() => {}} />;

  const page = {
    overview: <Dashboard go={go} />,
    divisions: <Divisions focus={sub} setFocus={(id) => go('divisions', id)} go={go} />,
    access: <Access tab={sub || 'people'} setTab={(t) => go('access', t)} focus={id} setFocus={(u) => go('access', 'people', u)} />,
    vault: <Vault focus={sub} setFocus={(f) => go('vault', f)} />,
    map: <MapView key={sub || 'map'} focus={sub} go={go} />,
    audit: <Audit />,
    settings: <Settings />,
  }[current];

  return (
    <div className="shell">
      <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
        <div className="sidebar__brand"><Wordmark /></div>
        <div className="sidebar__product vx-eyebrow">Core · внутрішня платформа</div>
        <nav className="sidebar__nav" aria-label="Головне меню">
          {allowed.map((n) => (
            <button key={n.id} className={`vx-nav-item ${current === n.id ? 'is-active' : ''}`} onClick={() => go(n.id)} aria-current={current === n.id ? 'page' : undefined}>
              <Icon name={n.icon} /> {n.label}
              {n.id === 'access' && pending > 0 && perms.access >= 2 && <span className="vx-nav-item__count">{pending}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar__foot">
          <div className="sidebar__me">
            <Avatar name={me.name} />
            <div className="sidebar__me-text">
              <div className="sidebar__me-name">{me.name}</div>
              <div className="vx-hint">{ROLES.find((r) => r.id === me.role).name}</div>
            </div>
          </div>
          <div className="sidebar__actions">
            <ClassBadge level={me.clearance} />
            <span className="grow" />
            <button className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" onClick={lock} title="Заблокувати (Ctrl+L)" aria-label="Заблокувати"><Icon name="lock" /></button>
            <button className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" onClick={() => dispatch({ type: 'logout' })} title="Вийти" aria-label="Вийти"><Icon name="logout" /></button>
          </div>
        </div>
      </aside>
      {menu && <div className="vx-scrim sidebar-scrim" onClick={() => setMenu(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="vx-btn vx-btn--ghost vx-btn--icon topbar__menu" onClick={() => setMenu(true)} aria-label="Меню"><Icon name="menu" /></button>
          <span className="topbar__mark"><Mark size={22} /></span>
          <button className="topbar__search" onClick={() => setPalette(true)}>
            <Icon name="search" size={16} /> <span className="topbar__search-long">Пошук і команди</span><span className="topbar__search-short">Пошук</span> <kbd>Ctrl K</kbd>
          </button>
          <span className="grow" />
          <Bell open={bell} setOpen={setBell} go={go} />
          <Clock />
          <span className="topbar__secure vx-hint"><Icon name="shield" size={14} /> Захищено</span>
        </header>
        <main className="content" id="main">
          <Suspense fallback={<div className="vx-empty page-loading"><Loader size={56} label="Завантаження карти" /><div className="vx-mono">Завантаження карти…</div></div>}>{page}</Suspense>
        </main>
      </div>

      {palette && <Palette onClose={() => setPalette(false)} go={go} allowed={allowed} lock={lock} />}
    </div>
  );
}

// What needs this person's attention: requests they can decide, and decisions on their own requests.
function useNotices() {
  const { state, me, perms } = useStore();
  const seen = state.seen?.[me.id] || '';
  const toDecide = perms.access >= 2
    ? state.requests.filter((r) => r.status === 'pending' && r.user !== me.id
      && (me.role === 'admin' || state.users.find((u) => u.id === r.user)?.division === me.division))
    : [];
  const mine = state.requests.filter((r) => r.user === me.id && r.status !== 'pending');
  const items = [
    ...toDecide.map((r) => ({ id: r.id, at: r.at, kind: 'decide', r })),
    ...mine.map((r) => ({ id: r.id, at: r.at, kind: 'mine', r })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const unread = toDecide.length + mine.filter((x) => (x.resolvedAt || x.at) > seen).length;
  return { items, unread };
}

function Bell({ open, setOpen, go }) {
  const { state, dispatch, userById } = useStore();
  const { items, unread } = useNotices();
  const toggle = () => { if (!open) dispatch({ type: 'seen' }); setOpen(!open); };
  return (
    <div className="bell">
      <button className="vx-btn vx-btn--ghost vx-btn--icon" onClick={toggle} aria-label={`Сповіщення: ${unread}`} aria-expanded={open}>
        <Icon name="bell" />{unread > 0 && <span className="bell__dot">{unread}</span>}
      </button>
      {open && (
        <div className="bell__menu vx-panel" role="dialog" aria-label="Сповіщення">
          <div className="vx-panel__head"><h2 className="vx-panel__title">Сповіщення</h2></div>
          <div className="list">
            {items.slice(0, 8).map((n) => {
              const u = userById(n.r.user);
              const what = n.r.kind === 'clearance' ? `допуск «${CLEARANCE[n.r.to].short}»` : `доступ до папки «${state.folders.find((f) => f.id === n.r.folder)?.name}»`;
              return n.kind === 'decide' ? (
                <button key={n.id} className="list__row list__row--btn list__row--top" onClick={() => go('access', 'requests')}>
                  <Icon name="key" size={16} />
                  <span className="list__text"><span>{u?.name} просить {what}</span><span className="vx-hint">Потрібне ваше рішення · {fmtAgo(n.at)}</span></span>
                </button>
              ) : (
                <div key={n.id} className="list__row list__row--top">
                  <Icon name={n.r.status === 'approved' ? 'ok' : 'danger'} size={16} />
                  <span className="list__text"><span>Ваш запит на {what} {n.r.status === 'approved' ? 'схвалено' : 'відхилено'}</span><span className="vx-hint">{fmtAgo(n.r.resolvedAt || n.at)}</span></span>
                </div>
              );
            })}
            {!items.length && <div className="vx-empty">Нових сповіщень немає</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  return (
    <span className="topbar__clock vx-mono">
      {now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })} · Київ
    </span>
  );
}

function Palette({ onClose, go, allowed, lock }) {
  const { state, me, dispatch } = useStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const items = useMemo(() => {
    const nav = allowed.map((n) => ({ id: `nav-${n.id}`, icon: n.icon, label: `Перейти: ${n.label}`, run: () => go(n.id) }));
    const people = allowed.some((n) => n.id === 'access')
      ? state.users.map((u) => ({ id: u.id, icon: 'user', label: u.name, hint: u.code, run: () => go('access', 'people', u.id) })) : [];
    const files = allowed.some((n) => n.id === 'vault')
      ? state.files.filter((f) => canSeeFile(me, f)).map((f) => ({ id: f.id, icon: 'file', label: f.name, hint: 'Сховище', run: () => go('vault', f.id) })) : [];
    const places = allowed.some((n) => n.id === 'map')
      ? [...state.points.filter((p) => p.clearance <= me.clearance).map((p) => ({ id: p.id, icon: 'map', label: p.name, hint: 'Позначка', run: () => go('map', p.id) })),
        ...TRACKS.filter((t) => t.clearance <= me.clearance).map((t) => ({ id: t.id, icon: 'target', label: t.name, hint: 'Об\u2019єкт', run: () => go('map', t.id) }))] : [];
    const actions = [
      { id: 'lock', icon: 'lock', label: 'Заблокувати сесію', hint: 'Ctrl L', run: lock },
      { id: 'theme', icon: 'eye', label: state.settings.theme === 'matte' ? 'Тема: Папір' : 'Тема: Матова чорна', run: () => { dispatch({ type: 'settings', patch: { theme: state.settings.theme === 'matte' ? 'paper' : 'matte' } }); onClose(); } },
      { id: 'logout', icon: 'logout', label: 'Вийти', run: () => dispatch({ type: 'logout' }) },
    ];
    const all = [...nav, ...actions, ...people, ...files, ...places];
    const t = q.trim().toLowerCase();
    return (t ? all.filter((i) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(t)) : [...nav, ...actions]).slice(0, 9);
  }, [q, allowed, state, me, go, lock, dispatch, onClose]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    if (e.key === 'Enter' && items[sel]) items[sel].run();
  };

  return (
    <Modal onClose={onClose} label="Командний рядок">
      <div className="palette">
        <div className="vx-search palette__input">
          <Icon name="search" />
          <input className="vx-input" autoFocus placeholder="Люди, файли, розділи, дії…" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey} aria-label="Пошук" />
        </div>
        <div className="palette__list" role="listbox">
          {items.map((i, n) => (
            <button key={i.id} role="option" aria-selected={n === sel} className={`palette__item ${n === sel ? 'is-active' : ''}`} onMouseEnter={() => setSel(n)} onClick={i.run}>
              <Icon name={i.icon} size={16} /> <span>{i.label}</span> {i.hint && <span className="vx-hint palette__hint">{i.hint}</span>}
            </button>
          ))}
          {!items.length && <div className="vx-empty">Нічого не знайдено</div>}
        </div>
      </div>
    </Modal>
  );
}
