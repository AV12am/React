import { createContext, useContext, useEffect, useMemo, useReducer, useCallback, useRef, useState } from 'react';
import { USERS, REQUESTS, FILES, FOLDERS, SEED_AUDIT, PERMISSIONS, CLEARANCE } from './data/seed.js';
import { canSeeLevel, levelOf, remark, MAX_LEVEL, SEAL } from './data/clearance.js';
import { storage } from './lib/storage.js';
import { createSync } from './lib/sync.js';
import { supabaseOn, signedIn, onSession, signOut, currentEmail } from './lib/supabase.js';

// v3: LUMEN · UMBRA · NOX scale. v2 state (old four-step scale) is migrated on load.
const KEY = 'reaction-core/v3';
const PREV = 'reaction-core/v2';

const initial = () => ({
  users: USERS,
  requests: REQUESTS,
  folders: FOLDERS,
  files: FILES,
  points: [],
  records: [], // division workspaces (src/data/workspaces.js)
  seen: {},
  audit: SEED_AUDIT,
  settings: { theme: 'matte', sensitive: true, lockMinutes: 30, lockV: 2 },
  session: null,
});

// Old scale: 0 open · 1 service use · 2 secret · 3 top secret → LUMEN · UMBRA · UMBRA · NOX.
const OLD_TO_NEW = [0, 1, 1, 2];
const mapLevel = (n) => OLD_TO_NEW[n] ?? MAX_LEVEL;
function migrate(old) {
  const lv = (x) => (x && typeof x.clearance === 'number' ? { ...x, clearance: mapLevel(x.clearance) } : x);
  return {
    ...old,
    users: (old.users || []).map(lv),
    files: (old.files || []).map(lv),
    folders: (old.folders || []).map(lv),
    points: (old.points || []).map(lv),
    requests: (old.requests || []).map((r) => (r.kind === 'clearance' ? { ...r, from: mapLevel(r.from), to: mapLevel(r.to) } : r)),
  };
}

function restore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initial(), ...JSON.parse(raw) };
    const prev = localStorage.getItem(PREV);
    if (prev) return { ...initial(), ...migrate(JSON.parse(prev)) };
  } catch { /* storage unavailable: start fresh */ }
  return initial();
}

function load() {
  const st = restore();
  // Auto-lock default went from 5 to 30 minutes: raise earlier saved values once.
  if (st.settings && !st.settings.lockV) st.settings = { ...st.settings, lockMinutes: Math.max(st.settings.lockMinutes || 0, 30), lockV: 2 };
  // With Supabase a remembered session counts only if the server session belongs to the same person;
  // otherwise (e.g. one left over from the simulated sign-in) sign in again.
  if (supabaseOn && st.session) {
    const me = st.users.find((u) => u.id === st.session.userId);
    if (!signedIn() || !me?.email || me.email !== currentEmail()) {
      st.session = null;
      st.users = []; // the team's people come from the server after sign-in
      st.records = [];
      st.requests = [];
    }
  }
  return st;
}

let seq = 0;
const uid = (p) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

// `level`: the clearance of what the entry names. The entry is classified with it, so the
// audit log never shows a NOX title to someone without NOX (the server filters by it too).
function withAudit(state, actor, type, text, level = 0) {
  const entry = { id: uid('a'), at: new Date().toISOString(), actor, type, text };
  if (level > 0) entry.clearance = level;
  return { ...state, audit: [entry, ...state.audit].slice(0, 500) };
}

function reducer(state, a) {
  const me = state.session?.userId;
  switch (a.type) {
    case 'login': {
      const s = { ...state, session: { userId: a.userId, since: new Date().toISOString(), verified: !!a.verified } };
      return withAudit(s, a.userId, 'auth', a.via === 'supabase' ? 'Вхід у систему · пароль перевірено сервером' : 'Вхід у систему · MFA підтверджено');
    }
    case 'session/verified':
      return state.session ? { ...state, session: { ...state.session, verified: a.value } } : state;
    case 'logout':
      return { ...withAudit(state, me, 'auth', 'Вихід із системи'), session: null };
    case 'lock':
      if (state.session?.locked) return state;
      return withAudit({ ...state, session: { ...state.session, locked: true } }, me, 'auth', 'Сесію заблоковано');
    case 'unlock':
      return withAudit({ ...state, session: { ...state.session, locked: false } }, me, 'auth', 'Сесію розблоковано');
    case 'user/update': {
      const before = state.users.find((u) => u.id === a.id);
      const users = state.users.map((u) => (u.id === a.id ? { ...u, ...a.patch } : u));
      const changes = Object.keys(a.patch)
        .filter((k) => before[k] !== a.patch[k])
        .map((k) => {
          if (k === 'clearance') return `допуск → «${CLEARANCE[a.patch[k]].short}»`;
          if (k === 'status') return `статус → ${a.patch[k] === 'suspended' ? 'призупинено' : 'активний'}`;
          if (k === 'role') return `роль → ${a.patch[k]}`;
          if (k === 'division') return `напрям → ${a.patch[k]}`;
          if (k === 'mfa') return a.patch[k] ? 'MFA увімкнено' : 'MFA вимкнено';
          return k;
        });
      if (!changes.length) return state;
      return withAudit({ ...state, users }, me, 'access', `${before.code} ${before.name}: ${changes.join(', ')}`);
    }
    case 'training/result': {
      // A test attempt of the signed-in person: best score kept, a pass is valid for a year (see data/academy/meta.js).
      const u = state.users.find((x) => x.id === me);
      const prev = u?.training?.[a.course] || {};
      const pct = Math.round((a.score / a.total) * 100);
      const now = new Date().toISOString();
      const rec = {
        best: Math.max(prev.best || 0, pct), last: pct, attempts: (prev.attempts || 0) + 1,
        passed: a.passed || !!prev.passed, at: a.passed ? now : prev.at || null, tried: now,
      };
      const users = state.users.map((x) => (x.id === me ? { ...x, training: { ...(x.training || {}), [a.course]: rec } } : x));
      return withAudit({ ...state, users }, me, 'training', `Курс «${a.title}»: ${a.score}/${a.total} (${pct}%) — ${a.passed ? 'складено' : 'не складено'}`);
    }
    case 'user/invite': {
      const n = state.users.filter((u) => u.code.startsWith('V-')).length + 80;
      const user = { id: uid('u'), code: `V-${String(n).padStart(3, '0')}`, status: 'invited', mfa: false, lastSeen: null, ...a.user };
      if (user.email) user.email = user.email.trim().toLowerCase();
      return withAudit({ ...state, users: [...state.users, user] }, me, 'access', `Надіслано запрошення: ${user.name} (${user.code})`);
    }
    case 'request/resolve': {
      const r = state.requests.find((x) => x.id === a.id);
      let s = { ...state, requests: state.requests.map((x) => (x.id === a.id ? { ...x, status: a.approve ? 'approved' : 'denied', resolvedBy: me, resolvedAt: new Date().toISOString() } : x)) };
      const u = state.users.find((x) => x.id === r.user);
      if (a.approve && r.kind === 'clearance') {
        s = { ...s, users: s.users.map((x) => (x.id === r.user ? { ...x, clearance: r.to } : x)) };
      }
      if (a.approve && r.kind === 'folder') {
        s = { ...s, users: s.users.map((x) => (x.id === r.user ? { ...x, grants: [...new Set([...(x.grants || []), r.folder])] } : x)) };
      }
      if (a.approve && r.kind === 'basis') {
        s = { ...s, users: s.users.map((x) => (x.id === r.user ? { ...x, basis: [...new Set([...(x.basis || []), r.file])] } : x)) };
      }
      const what = requestLabel(state, r);
      const lvl = r.kind === 'basis' ? state.files.find((f) => f.id === r.file)?.clearance ?? 0 : r.kind === 'folder' ? state.folders.find((f) => f.id === r.folder)?.clearance ?? 0 : 0;
      return withAudit(s, me, 'access', `${a.approve ? 'Схвалено' : 'Відхилено'} запит ${u.code} ${u.name}: ${what}`, lvl);
    }
    case 'request/create': {
      const req = { id: uid('r'), at: new Date().toISOString(), status: 'pending', user: me, ...a.request };
      return withAudit({ ...state, requests: [req, ...state.requests] }, me, 'access', 'Створено запит на доступ');
    }
    case 'file/add':
      return withAudit({ ...state, files: [a.file, ...state.files.filter((x) => x.id !== a.file.id)] }, me, 'vault', `Завантажено «${a.file.name}»`, a.file.clearance);
    case 'file/delete': {
      const f = state.files.find((x) => x.id === a.id);
      return withAudit({ ...state, files: state.files.filter((x) => x.id !== a.id) }, me, 'vault', `Видалено «${f?.name ?? a.id}»`, f?.clearance);
    }
    case 'file/open': {
      const f = state.files.find((x) => x.id === a.id);
      const tag = f?.number ? ` ${f.number}` : '';
      return withAudit(state, me, 'vault', `${a.download ? 'Винесено з системи' : 'Переглянуто'}${tag} «${f?.name ?? a.id}»`, f?.clearance);
    }
    case 'file/act': {
      // NOX: opening is a separate, deliberate act with a stated purpose.
      const f = state.files.find((x) => x.id === a.id);
      return withAudit(state, me, 'security', `${a.sealed ? `${SEAL.short} · відкрито за підставою` : 'NOX · окрема дія'}: ${f?.number ?? ''} «${f?.name ?? a.id}» — мета: ${a.purpose}`, f?.clearance);
    }
    case 'record/add': {
      const r = { id: uid('w'), at: new Date().toISOString(), owner: me, ...a.record };
      r.updated = r.at;
      return withAudit({ ...state, records: [r, ...(state.records || [])] }, me, 'work', `${a.where}: додано «${a.label}»`, r.clearance);
    }
    case 'record/update': {
      const old = (state.records || []).find((r) => r.id === a.id);
      const records = (state.records || []).map((r) => (r.id === a.id ? { ...r, ...a.patch, updated: new Date().toISOString() } : r));
      const lvl = Math.max(old?.clearance ?? 0, a.patch.clearance ?? 0);
      return withAudit({ ...state, records }, me, 'work', `${a.where}: ${a.note || 'змінено'} «${a.label}»`, lvl);
    }
    case 'record/bulk': {
      // Many records at once (the watch conveyor): new ones added, `patches` applied, one audit entry.
      const have = new Set((state.records || []).map((r) => r.id));
      const now = new Date().toISOString();
      const added = a.records.filter((r) => !have.has(r.id)).map((r) => ({ at: now, owner: me, ...r, updated: now }));
      const patches = new Map((a.patches || []).map((p) => [p.id, p.patch]));
      const records = [...added, ...(state.records || []).map((r) => (patches.has(r.id) ? { ...r, ...patches.get(r.id), updated: now } : r))];
      const lvl = Math.max(0, ...added.map((r) => r.clearance || 0));
      return withAudit({ ...state, records }, me, 'work', `${a.where}: ${a.label}`, lvl);
    }
    case 'record/delete': {
      const old = (state.records || []).find((r) => r.id === a.id);
      return withAudit({ ...state, records: (state.records || []).filter((r) => r.id !== a.id) }, me, 'work', `${a.where}: видалено «${a.label}»`, old?.clearance);
    }
    case 'file/update': {
      const f = state.files.find((x) => x.id === a.file.id);
      if (!f) return state;
      return withAudit({ ...state, files: state.files.map((x) => (x.id === f.id ? a.file : x)) }, me, 'vault', `${a.note} «${f.name}»`, f.clearance);
    }
    case 'file/level': {
      // One step down the scale, by a person, following the rule set at filing (see lowerFile).
      const f = state.files.find((x) => x.id === a.file.id);
      if (!f) return state;
      return withAudit({ ...state, files: state.files.map((x) => (x.id === f.id ? a.file : x)) }, me, 'vault',
        `Знижено гриф «${f.name}»: ${f.number ?? ''} ${levelOf(f.clearance).name} → ${a.file.number ?? ''} ${levelOf(a.file.clearance).name} (${a.why})`, f.clearance);
    }
    case 'folder/add': {
      const folder = { id: uid('f'), ...a.folder };
      return withAudit({ ...state, folders: [...state.folders.filter((x) => x.id !== folder.id), folder] }, me, 'vault', `Створено папку «${folder.name}»`, folder.clearance);
    }
    case 'vault/sync': {
      // The shared index is authoritative for files; folders merge by id with the built-in ones.
      if (a.files) return { ...state, files: a.files.map((f) => (f.clearance > MAX_LEVEL ? { ...f, clearance: MAX_LEVEL } : f)).sort((x, y) => (y.at || '').localeCompare(x.at || '')) };
      if (a.folders) {
        const known = new Set(state.folders.map((f) => f.id));
        const add = a.folders.filter((f) => f && !known.has(f.id));
        return add.length ? { ...state, folders: [...state.folders, ...add] } : state;
      }
      return state;
    }
    case 'point/add': {
      const point = { id: uid('p'), owner: me, at: new Date().toISOString(), ...a.point };
      return withAudit({ ...state, points: [...state.points, point] }, me, 'map', `Додано позначку «${point.name}» (${point.lat.toFixed(4)}, ${point.lon.toFixed(4)})`, point.clearance);
    }
    case 'point/delete': {
      const p = state.points.find((x) => x.id === a.id);
      return withAudit({ ...state, points: state.points.filter((x) => x.id !== a.id) }, me, 'map', `Видалено позначку «${p.name}»`, p.clearance);
    }
    case 'map/log':
      return withAudit(state, me, 'map', a.text);
    case 'seen':
      return { ...state, seen: { ...state.seen, [me]: new Date().toISOString() } };
    case 'audit/export':
      return withAudit(state, me, 'system', 'Експортовано журнал аудиту (CSV)');
    case 'settings':
      return { ...state, settings: { ...state.settings, ...a.patch } };
    case 'shared/sync': {
      // The team's copy from the server (src/lib/sync.js). Newest first where it matters.
      const by = (k) => (x, y) => String(y[k] || '').localeCompare(String(x[k] || ''));
      const items = a.kind === 'records' ? [...a.items].sort(by('updated'))
        : a.kind === 'requests' ? [...a.items].sort(by('at'))
          : a.kind === 'audit' ? [...a.items].sort(by('at')).slice(0, 500)
            : a.items;
      return { ...state, [a.kind]: items };
    }
    case 'reset':
      return { ...initial(), session: state.session, settings: state.settings };
    default:
      return state;
  }
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const [toasts, setToasts] = useState([]);
  const [backend, setBackend] = useState(null);

  useEffect(() => {
    let off;
    let live = true;
    storage().then((b) => {
      if (!live) return;
      setBackend(b);
      if (b.index) {
        off = b.index.watch(
          (files) => dispatch({ type: 'vault/sync', files }),
          (folders) => dispatch({ type: 'vault/sync', folders }),
        );
      }
    });
    return () => { live = false; off?.(); };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota or private mode */ }
  }, [state]);

  // Team sync: only where the backend offers shared documents (Supabase) and someone is signed in.
  const stateRef = useRef(state);
  stateRef.current = state;
  const [sbSession, setSbSession] = useState(signedIn());
  useEffect(() => onSession((s) => {
    setSbSession(!!s);
    if (!s && stateRef.current.session) dispatch({ type: 'logout' }); // the server ended the session
  }), []);
  // Leaving the app ends the server session too.
  useEffect(() => { if (supabaseOn && !state.session && signedIn()) signOut(); }, [state.session]);
  const syncRef = useRef(null);
  const loggedIn = !!state.session?.userId;
  const verified = !!state.session?.verified;
  useEffect(() => {
    // With Supabase the server answers only after the passkey step (session.verified).
    if (!backend?.docs || !loggedIn || (backend.needsSignIn && (!sbSession || !verified))) return undefined;
    const engine = createSync({
      docs: backend.docs,
      getState: () => stateRef.current,
      dispatch,
      onError: (e) => toastRef.current?.(`Сервер відхилив зміну: ${e.message}`),
    });
    syncRef.current = engine;
    return () => { engine.stop(); syncRef.current = null; };
  }, [backend, loggedIn, sbSession, verified]);
  useEffect(() => { syncRef.current?.changed(); }, [state.users, state.records, state.requests, state.audit]);

  const toastRef = useRef(null);
  const toast = useCallback((text) => {
    const id = uid('t');
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  toastRef.current = toast;

  const value = useMemo(() => {
    const me = state.users.find((u) => u.id === state.session?.userId) || null;
    const perms = me ? PERMISSIONS[me.role] : {};
    const userById = (id) => state.users.find((u) => u.id === id);
    return { state, dispatch, me, perms, userById, toast, toasts, backend };
  }, [state, toast, toasts, backend]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

/* ---------- formatting ---------- */
export function fmtBytes(n) {
  if (n < 1024) return `${n} Б`;
  const u = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toLocaleString('uk-UA', { maximumFractionDigits: n < 10 ? 1 : 0 })} ${u[i]}`;
}

export function fmtDate(iso, withTime = true) {
  if (!iso) return '—';
  const t = new Date(iso);
  const date = t.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return withTime ? `${date}, ${t.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : date;
}

export function fmtAgo(iso) {
  if (!iso) return 'ще не входив(-ла)';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'щойно';
  if (s < 3600) return `${Math.floor(s / 60)} хв тому`;
  if (s < 86400) return `${Math.floor(s / 3600)} год тому`;
  const days = Math.floor(s / 86400);
  return days === 1 ? 'учора' : `${days} дн. тому`;
}

export const canSeeFile = canSeeLevel;

/** The document after one lowering step; written to the shared index and then dispatched. */
export function lowerFile(f, to, by, why) {
  return {
    ...f,
    clearance: to,
    number: remark(f.number, { level: to, sealed: f.sealed }),
    downgrade: null, // a new rule is set, if needed, at the new level
    lowered: [...(f.lowered || []), { from: f.clearance, to, at: new Date().toISOString(), by, why }],
  };
}

export function requestLabel(state, r) {
  if (r.kind === 'clearance') return `допуск «${CLEARANCE[r.to]?.short}»`;
  if (r.kind === 'basis') {
    const f = state.files.find((x) => x.id === r.file);
    return `підставу ${SEAL.short} для ${f?.number ?? 'документа'} «${f?.name ?? '—'}»`;
  }
  return `папка «${state.folders.find((f) => f.id === r.folder)?.name}»`;
}

export const initials = (name) => name.split(' ').map((p) => p[0]).slice(0, 2).join('');
