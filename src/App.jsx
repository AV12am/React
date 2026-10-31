import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StoreProvider, useStore } from './store.jsx';
import { Wordmark, Mark, Loader } from './brand/Mark.jsx';
import { Icon } from './components/Icon.jsx';
import { Avatar, Toasts, Modal, ClassBadge } from './components/ui.jsx';
import { Splash, Login, Lock } from './views/Entry.jsx';
import { PasskeyStep } from './views/Passkey.jsx';
import { status as passkeyStatus } from './lib/passkey.js';
import { supabaseOn, signOut } from './lib/supabase.js';
import { Dashboard } from './views/Dashboard.jsx';
import { COURSES } from './data/academy/meta.js';
import { ROLES, VISIBLE_DIVISIONS } from './data/seed.js';
import { DialogHost } from './components/Dialog.jsx';
import { Assistant } from './components/Assistant.jsx';
import { NewVersion } from './components/NewVersion.jsx';
import { TRACKS } from './data/geo.js';
import { canSeeFile, fmtAgo, requestLabel } from './store.jsx';
import { useSwipe, useHidden, isTouch, buzz } from './lib/mobile.js';
import { registerOf } from './data/workspaces.js';
import { titleOfRecord } from './lib/brief.js';
import { snippet } from './lib/textract.js';
import { LOCALE } from './lib/locale.js';

// The map ships its own geography (~1 MB), so it loads only when opened.
// Every section but the overview loads when first opened: the first screen comes up faster, on phones especially.
const LOADERS = [];
// After a new version goes live the files of the old one are gone: a page opened before that cannot load a
// section it has not opened yet (the map stays black). Then the page reloads itself once, onto the new version.
const fresh = (load) => () => load().catch((e) => {
  // At most one such reload a minute, so a file that is really missing never loops the page.
  let last = 0;
  try { last = +sessionStorage.getItem('reaction-chunk-reload') || 0; } catch { /* private mode */ }
  if (Date.now() - last > 60000) {
    try { sessionStorage.setItem('reaction-chunk-reload', String(Date.now())); } catch { /* private mode */ }
    location.reload();
    return new Promise(() => {});
  }
  throw e;
});
const section = (load, name) => { const l = fresh(load); LOADERS.push(l); return lazy(() => l().then((m) => ({ default: m[name] }))); };
const MapView = section(() => import('./views/Map.jsx'), 'MapView');
const Divisions = section(() => import('./views/Divisions.jsx'), 'Divisions');
const Access = section(() => import('./views/Access.jsx'), 'Access');
const Vault = section(() => import('./views/Vault.jsx'), 'Vault');
const Audit = section(() => import('./views/Audit.jsx'), 'Audit');
const Settings = section(() => import('./views/Settings.jsx'), 'Settings');
const Learn = section(() => import('./views/Academy.jsx'), 'Learn');
const Info = section(() => import('./views/Info.jsx'), 'Info');
const News = section(() => import('./views/News.jsx'), 'News');
// v0 sandbox — dev server only; dropped from production builds.
const V0Sandbox = import.meta.env.DEV ? lazy(() => import('./v0/Sandbox.jsx')) : null;

// `side: false` — a section that has its own address (and is in search) but no item in the side menu:
// «Доступи» and «Журнал аудиту» sit under «Адміністрування»; «Навчання» opens from the Academy.
const NAV = [
  { id: 'overview', label: 'Огляд', icon: 'overview' },
  { id: 'divisions', label: 'Напрями', icon: 'divisions' },
  { id: 'vault', label: 'Сховище', icon: 'vault' },
  { id: 'map', label: 'Карта', icon: 'map' },
  { id: 'access', label: 'Доступи', icon: 'access', side: false, admin: true },
  { id: 'audit', label: 'Журнал аудиту', icon: 'audit', side: false, admin: true },
  { id: 'learn', label: 'Навчання', icon: 'book', always: true, side: false },
  { id: 'info', label: 'Інформація', icon: 'info', always: true },
  // CONTEXT News: opened by its link only (#/news) — no menu item, not offered in search.
  { id: 'news', label: 'CONTEXT News', icon: 'globe', always: true, side: false, link: true },
  { id: 'settings', label: 'Налаштування', icon: 'settings', always: true },
];
const ADMIN = ['access', 'audit'];
// Phone: the bottom bar holds the four most used sections; everything else is under «Ще».
const TABS = ['overview', 'divisions', 'vault', 'map'];
const SHORT = { overview: 'Огляд', divisions: 'Напрями', vault: 'Сховище', map: 'Карта' };

export default function App() {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}

// Supabase: a signed-in session must also be confirmed with a passkey. After a reload the confirmation
// may have expired (24 h) — ask the server, and show the passkey step again when needed.
function PasskeyGate() {
  const { dispatch } = useStore();
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    passkeyStatus().then((x) => { if (x.verified) dispatch({ type: 'session/verified', value: true }); else setSt(x); })
      .catch((e) => setErr(e.message));
  }, [dispatch]);
  const leave = async () => { await signOut(); dispatch({ type: 'logout' }); };
  return (
    <div className="lock">
      <Loader size={72} still={!!st} label="Підтвердження входу" />
      <div className="vx-eyebrow">Підтвердження входу</div>
      {st ? <div className="lock__form lock__form--wide"><PasskeyStep st={st} onDone={() => dispatch({ type: 'session/verified', value: true })} onCancel={leave} /></div>
        : err ? <><div className="vx-error">{err}</div><button className="vx-btn vx-btn--ghost" onClick={leave}>Вийти</button></> : null}
    </div>
  );
}

function Root() {
  const { state, me, toasts, dispatch } = useStore();
  const [booted, setBooted] = useState(false);
  const done = useCallback(() => setBooted(true), []);

  useEffect(() => {
    const bg = state.settings.theme === 'paper' ? '#ffffff' : '#000000';
    document.body.style.background = bg;
    // The phone's status bar takes the page's colour (a dark bar over a light page reads as a curtain).
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  }, [state.settings.theme]);

  // A remembered confirmation is re-checked with the server once per load.
  const remembered = supabaseOn && !!state.session?.verified;
  useEffect(() => {
    if (!remembered) return;
    passkeyStatus().then((x) => { if (!x.verified) dispatch({ type: 'session/verified', value: false }); }).catch(() => {});
  }, [remembered]); // eslint-disable-line react-hooks/exhaustive-deps

  const gate = supabaseOn && me && !state.session?.verified;
  return (
    <div data-theme={state.settings.theme} className={`vx-root app-root ${state.settings.sensitive ? '' : 'vx-sensitive-off'}`}>
      {!booted ? <Splash onDone={done} /> : gate ? <PasskeyGate /> : me ? <Shell /> : <Login />}
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
  const [ai, setAi] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const locked = !!state.session?.locked;

  const allowed = NAV.filter((n) => n.always || perms[n.id] > 0);
  const adminTabs = allowed.filter((n) => n.admin);
  // «Адміністрування» opens its first section the person may see.
  const asked = view === 'admin' ? adminTabs[0]?.id : view;
  const current = V0Sandbox && asked === 'v0' ? 'v0' : allowed.find((n) => n.id === asked) ? asked : allowed[0].id;
  const side = [
    ...allowed.filter((n) => n.side !== false && n.id !== 'settings' && n.id !== 'info'),
    ...(adminTabs.length ? [{ id: 'admin', label: 'Адміністрування', icon: 'access', to: adminTabs[0].id }] : []),
    ...allowed.filter((n) => n.id === 'settings'),
    ...allowed.filter((n) => n.id === 'info'), // the last item: documents and rules
  ];
  const isActive = (n) => (n.id === 'admin' ? ADMIN.includes(current) : current === n.id);
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
      if (e.key.toLowerCase() === 'j') { e.preventDefault(); setAi((x) => !x); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lock]);

  // Auto-lock after inactivity.
  useEffect(() => {
    if (locked || !(state.settings.lockMinutes > 0)) return undefined;
    let t;
    const reset = () => { clearTimeout(t); t = setTimeout(lock, state.settings.lockMinutes * 60000); };
    const ev = ['mousemove', 'keydown', 'pointerdown', 'scroll'];
    ev.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(t); ev.forEach((e) => window.removeEventListener(e, reset)); };
  }, [locked, lock, state.settings.lockMinutes]);

  // Phone: hide the screen in the app switcher, and lock when the app has been away too long.
  const [veiled, setVeiled] = useState(false);
  const hideLock = state.settings.hideLock ?? -1; // seconds; -1 — never (default)
  const onHide = useCallback(() => { if (isTouch()) setVeiled(true); if (isTouch() && hideLock === 0) lock(); }, [hideLock, lock]);
  const onShow = useCallback((ms) => { setVeiled(false); if (isTouch() && hideLock >= 0 && ms >= hideLock * 1000) lock(); }, [hideLock, lock]);
  useHidden(onHide, onShow);

  // Swipe from the left edge opens the menu; swipe left on it closes it.
  const sideRef = useRef(null);
  const openMenu = useCallback(() => setMenu(true), []);
  const closeMenu = useCallback(() => setMenu(false), []);
  useSwipe(useRef(null), { onRight: openMenu, edge: 24 });
  useSwipe(sideRef, { onLeft: closeMenu });

  // Once the first screen is up, the other sections load quietly in the background.
  useEffect(() => {
    const warm = () => LOADERS.forEach((load) => load().catch(() => {}));
    const t = 'requestIdleCallback' in window ? window.requestIdleCallback(warm, { timeout: 4000 }) : setTimeout(warm, 2500);
    return () => ('cancelIdleCallback' in window ? window.cancelIdleCallback(t) : clearTimeout(t));
  }, []);

  if (locked) return <Lock onUnlock={() => {}} />;

  const page = {
    overview: <Dashboard go={go} />,
    divisions: <Divisions key={sub || 'all'} focus={sub} tab={id} go={go} />,
    access: <><AdminTabs tabs={adminTabs} current={current} go={go} /><Access tab={sub || 'people'} setTab={(t) => go('access', t)} focus={id} setFocus={(u) => go('access', 'people', u)} /></>,
    vault: <Vault focus={sub} setFocus={(f) => go('vault', f)} />,
    map: <MapView key={sub || 'map'} focus={sub} go={go} />,
    audit: <><AdminTabs tabs={adminTabs} current={current} go={go} /><Audit /></>,
    learn: <Learn key={sub || 'all'} focus={sub} go={go} />,
    info: <Info />,
    news: <News />,
    settings: <Settings go={go} />,
    v0: V0Sandbox && <Suspense fallback={null}><V0Sandbox /></Suspense>,
  }[current];

  return (
    <div className={`shell ${ai ? 'has-ai' : ''} ${current === 'map' ? 'on-map' : ''}`}>
      <aside className={`sidebar ${menu ? 'is-open' : ''}`} ref={sideRef}>
        <div className="sidebar__brand"><Wordmark /></div>
        <div className="sidebar__product vx-eyebrow">Core · внутрішня платформа</div>
        <nav className="sidebar__nav" aria-label="Головне меню">
          {side.map((n) => (
            <button key={n.id} className={`vx-nav-item ${isActive(n) ? 'is-active' : ''}`} onClick={() => go(n.to || n.id)} aria-current={isActive(n) ? 'page' : undefined}>
              <Icon name={n.icon} /> {n.label}
              {n.id === 'admin' && pending > 0 && perms.access >= 2 && <span className="vx-nav-item__count">{pending}</span>}
            </button>
          ))}
        </nav>
        {/* The assistant: the mark in the free middle of the side panel, in the same place on every page. */}
        <div className="sidebar__ai">
          <button className={`ai-mark ${ai ? 'is-active' : ''} ${aiBusy ? 'is-thinking' : 'is-idle'}`} onClick={() => { setMenu(false); setAi(!ai); }} aria-expanded={ai}
            aria-label="CONTEXT — AI-асистент: чим можу допомогти? (Ctrl+J)" data-tip="Чим можу допомогти?"><span className="mark-spin"><Mark size={72} title="" /></span></button>
        </div>
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
          <span className="topbar__brand" aria-hidden="true"><Mark size={22} title="" /><span className="topbar__word">REACTION</span></span>
          <button className="topbar__search" onClick={() => setPalette(true)} aria-label="Пошук">
            <Icon name="search" size={16} /> <span className="topbar__search-long">Пошук і команди</span> <kbd>Ctrl K</kbd>
          </button>
          <span className="grow" />
          <Bell open={bell} setOpen={setBell} go={go} />
          <Clock />
          <span className="topbar__secure vx-hint"><Icon name="shield" size={14} /> Захищено</span>
        </header>
        <main className={`content ${current === 'map' ? 'content--map' : ''}`} id="main">
          <Suspense fallback={<div className="vx-empty page-loading"><Loader size={56} label="Завантаження" /></div>}>{page}</Suspense>
        </main>
      </div>

      <nav className="tabbar" aria-label="Розділи">
        {allowed.filter((n) => TABS.includes(n.id)).map((n) => (
          <button key={n.id} className={`tabbar__item ${current === n.id ? 'is-active' : ''}`} aria-current={current === n.id ? 'page' : undefined}
            onClick={() => { buzz(); if (current === n.id) window.scrollTo({ top: 0, behavior: 'smooth' }); else go(n.id); }}>
            <Icon name={n.icon} /><span>{SHORT[n.id]}</span>
          </button>
        ))}
        <button className={`tabbar__item ${!TABS.includes(current) || menu ? 'is-active' : ''}`} onClick={() => { buzz(); setMenu(true); }} aria-label="Ще: інші розділи">
          <Icon name="menu" /><span>Ще</span>
          {pending > 0 && perms.access >= 2 && <span className="tabbar__dot" aria-hidden="true" />}
        </button>
      </nav>

      {palette && <Palette onClose={() => setPalette(false)} go={go} allowed={allowed} lock={lock} />}
      {/* The assistant: the mark on the right edge of the screen — it turns slowly, faster while thinking,
          and says what it is on hover. */}
      {!ai && <button className={`ai-fab ${aiBusy ? 'is-thinking' : 'is-idle'}`} onClick={() => setAi(true)} aria-label="CONTEXT — AI-асистент: чим можу допомогти? (Ctrl+J)" data-tip="Чим можу допомогти?"><span className="mark-spin"><Mark size={26} title="" /></span></button>}
      {ai && <Assistant onClose={() => { setAi(false); setAiBusy(false); }} onBusy={setAiBusy} go={go} route={{ view: current, sub, id }} allowed={allowed.map((n) => n.id)} />}
      <DialogHost />
      <NewVersion />
      {veiled && <div className="veil" aria-hidden="true"><Mark size={64} /></div>}
    </div>
  );
}

// What needs this person's attention: requests they can decide, and decisions on their own requests.
function useNotices() {
  const { state, me, perms } = useStore();
  const seen = state.seen?.[me.id] || '';
  const toDecide = perms.access >= 2
    ? state.requests.filter((r) => r.status === 'pending' && r.user !== me.id
      && (me.role === 'admin' || me.role === 'lead'))
    : [];
  const mine = state.requests.filter((r) => r.user === me.id && r.status !== 'pending');
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const mentions = (state.comments || []).filter((c) => (c.mentions || []).includes(me.id) && c.author !== me.id && c.at > weekAgo);
  const given = (state.tasks || []).filter((t) => t.assignee === me.id && t.author !== me.id && t.status !== 'done' && t.at > weekAgo);
  const items = [
    ...toDecide.map((r) => ({ id: r.id, at: r.at, kind: 'decide', r })),
    ...mine.map((r) => ({ id: r.id, at: r.at, kind: 'mine', r })),
    ...mentions.map((c) => ({ id: c.id, at: c.at, kind: 'mention', c })),
    ...given.map((t) => ({ id: t.id, at: t.at, kind: 'task', t })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const unread = toDecide.length + mine.filter((x) => (x.resolvedAt || x.at) > seen).length
    + mentions.filter((c) => c.at > seen).length + given.filter((t) => t.at > seen).length;
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
              if (n.kind === 'mention' || n.kind === 'task') {
                const rec = (state.records || []).find((r) => r.id === (n.c?.target || n.t?.target));
                const open = () => (rec ? go('divisions', rec.div, rec.col === 'orgs' ? `companies:${rec.id}` : `${rec.col}:${rec.id}`) : go('overview'));
                return (
                  <button key={n.id} className="list__row list__row--btn list__row--top" onClick={open}>
                    <Icon name={n.kind === 'mention' ? 'users' : 'check'} size={16} />
                    <span className="list__text">
                      <span>{n.kind === 'mention' ? `${userById(n.c.author)?.name || 'Колега'} згадав(-ла) вас` : `Завдання: ${n.t.title}`}</span>
                      <span className="vx-hint">{n.kind === 'mention' ? n.c.text.slice(0, 90) : `від ${userById(n.t.author)?.name || '—'}${n.t.due ? ` · до ${n.t.due}` : ''}`} · {fmtAgo(n.at)}</span>
                    </span>
                  </button>
                );
              }
              const u = userById(n.r.user);
              const what = requestLabel(state, n.r);
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
      {now.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })} · Київ
    </span>
  );
}

/** «Адміністрування»: one section with «Доступи» and «Журнал аудиту» as its tabs. */
function AdminTabs({ tabs, current, go }) {
  if (tabs.length < 2) return null;
  return (
    <div className="admin-tabs">
      <div className="vx-eyebrow">Адміністрування</div>
      <nav className="vx-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={current === t.id} className={`vx-tab ${current === t.id ? 'is-active' : ''}`} onClick={() => go(t.id)}>
            <Icon name={t.icon} size={16} /> {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Palette({ onClose, go, allowed, lock }) {
  const { state, me, dispatch } = useStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const items = useMemo(() => {
    const nav = allowed.filter((n) => !n.link).map((n) => ({ id: `nav-${n.id}`, icon: n.icon, label: `Перейти: ${n.label}`, run: () => go(n.id) }));
    const people = allowed.some((n) => n.id === 'access')
      ? state.users.map((u) => ({ id: u.id, icon: 'user', label: u.name, hint: u.code, run: () => go('access', 'people', u.id) })) : [];
    const files = allowed.some((n) => n.id === 'vault')
      ? state.files.filter((f) => canSeeFile(me, f)).map((f) => ({ id: f.id, icon: 'file', label: f.name, hint: 'Сховище', text: f.sealed ? '' : f.text || '', run: () => go('vault', f.id) })) : [];
    const places = allowed.some((n) => n.id === 'map')
      ? [...state.points.filter((p) => p.clearance <= me.clearance).map((p) => ({ id: p.id, icon: 'map', label: p.name, hint: 'Позначка', run: () => go('map', p.id) })),
        ...TRACKS.filter((t) => t.clearance <= me.clearance).map((t) => ({ id: t.id, icon: 'target', label: t.name, hint: 'Об\u2019єкт', run: () => go('map', t.id) }))] : [];
    // Records of every division (all their fields) and the text inside files.
    const regName = (r) => registerOf(r.div, r.col)?.one || 'запис';
    const records = allowed.some((n) => n.id === 'divisions')
      ? (state.records || []).filter((r) => r.clearance <= me.clearance && VISIBLE_DIVISIONS.some((d) => d.id === r.div)).map((r) => ({
        id: `r-${r.id}`, icon: 'layers', label: titleOfRecord(r), hint: regName(r),
        text: Object.entries(r).filter(([k, v]) => typeof v === 'string' && !['id', 'div', 'col', 'owner', 'at', 'updated', 'fingerprint', 'logo'].includes(k)).map(([, v]) => v).join(' \n '),
        run: () => go('divisions', r.div, `${r.col}:${r.id}`),
      })) : [];
    const courses = COURSES.map((c) => ({ id: `c-${c.id}`, icon: 'book', label: c.title, hint: 'Курс', run: () => go('learn', c.id) }));
    const actions = [
      { id: 'lock', icon: 'lock', label: 'Заблокувати сесію', hint: 'Ctrl L', run: lock },
      { id: 'theme', icon: 'eye', label: state.settings.theme === 'matte' ? 'Тема: Папір' : 'Тема: Матова чорна', run: () => { dispatch({ type: 'settings', patch: { theme: state.settings.theme === 'matte' ? 'paper' : 'matte' } }); onClose(); } },
      { id: 'logout', icon: 'logout', label: 'Вийти', run: () => dispatch({ type: 'logout' }) },
    ];
    const all = [...nav, ...actions, ...people, ...files, ...records, ...places, ...courses];
    const t = q.trim().toLowerCase();
    if (!t) return [...nav, ...actions].slice(0, 9);
    // Names first, then matches inside the content (with the place they occur).
    const byName = all.filter((i) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(t));
    const inside = t.length < 3 ? [] : all.filter((i) => !byName.includes(i) && i.text && i.text.toLowerCase().includes(t))
      .map((i) => ({ ...i, hint: `${i.hint} · у тексті`, excerpt: snippet(i.text, q.trim()) }));
    return [...byName.slice(0, 8), ...inside.slice(0, 8)].slice(0, 14);
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
          <input className="vx-input" autoFocus placeholder="Записи, компанії, файли й текст у них, люди, дії…" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey} aria-label="Пошук" />
        </div>
        <div className="palette__list" role="listbox">
          {items.map((i, n) => (
            <button key={i.id} role="option" aria-selected={n === sel} className={`palette__item ${n === sel ? 'is-active' : ''}`} onMouseEnter={() => setSel(n)} onClick={i.run}>
              <Icon name={i.icon} size={16} /> <span className="palette__text"><span>{i.label}</span>{i.excerpt && <span className="vx-hint palette__excerpt">{i.excerpt}</span>}</span> {i.hint && <span className="vx-hint palette__hint">{i.hint}</span>}
            </button>
          ))}
          {!items.length && <div className="vx-empty">Нічого не знайдено</div>}
        </div>
      </div>
    </Modal>
  );
}
