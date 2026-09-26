import { createContext, useContext, useEffect, useMemo, useReducer, useCallback, useState } from 'react';
import { USERS, REQUESTS, FILES, FOLDERS, SEED_AUDIT, PERMISSIONS, CLEARANCE } from './data/seed.js';
import { SEED_POINTS } from './data/geo.js';

const KEY = 'reaction-core/v1';

const initial = () => ({
  users: USERS,
  requests: REQUESTS,
  folders: FOLDERS,
  files: FILES,
  points: SEED_POINTS.map((x) => ({ ...x, at: new Date(Date.now() - 86400000 * 3).toISOString() })),
  seen: {},
  audit: SEED_AUDIT.map((e, i) => ({ id: `a-seed-${i}`, ...e })),
  settings: { theme: 'matte', sensitive: true, lockMinutes: 5 },
  session: null,
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initial(), ...JSON.parse(raw) };
  } catch { /* storage unavailable: start fresh */ }
  return initial();
}

let seq = 0;
const uid = (p) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

function withAudit(state, actor, type, text) {
  const entry = { id: uid('a'), at: new Date().toISOString(), actor, type, text };
  return { ...state, audit: [entry, ...state.audit].slice(0, 500) };
}

function reducer(state, a) {
  const me = state.session?.userId;
  switch (a.type) {
    case 'login': {
      const s = { ...state, session: { userId: a.userId, since: new Date().toISOString() } };
      return withAudit(s, a.userId, 'auth', 'Вхід у систему · MFA підтверджено');
    }
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
    case 'user/invite': {
      const n = state.users.filter((u) => u.code.startsWith('V-')).length + 80;
      const user = { id: uid('u'), code: `V-${String(n).padStart(3, '0')}`, status: 'invited', mfa: false, lastSeen: null, ...a.user };
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
      const what = r.kind === 'clearance'
        ? `допуск «${CLEARANCE[r.to].short}»`
        : `папка «${state.folders.find((f) => f.id === r.folder)?.name}»`;
      return withAudit(s, me, 'access', `${a.approve ? 'Схвалено' : 'Відхилено'} запит ${u.code} ${u.name}: ${what}`);
    }
    case 'request/create': {
      const req = { id: uid('r'), at: new Date().toISOString(), status: 'pending', user: me, ...a.request };
      return withAudit({ ...state, requests: [req, ...state.requests] }, me, 'access', 'Створено запит на доступ');
    }
    case 'file/add':
      return withAudit({ ...state, files: [a.file, ...state.files] }, me, 'vault', `Завантажено «${a.file.name}»`);
    case 'file/delete': {
      const f = state.files.find((x) => x.id === a.id);
      return withAudit({ ...state, files: state.files.filter((x) => x.id !== a.id) }, me, 'vault', `Видалено «${f.name}»`);
    }
    case 'file/open': {
      const f = state.files.find((x) => x.id === a.id);
      return withAudit(state, me, 'vault', `${a.download ? 'Завантажено на пристрій' : 'Переглянуто'} «${f.name}»`);
    }
    case 'folder/add': {
      const folder = { id: uid('f'), ...a.folder };
      return withAudit({ ...state, folders: [...state.folders, folder] }, me, 'vault', `Створено папку «${folder.name}»`);
    }
    case 'point/add': {
      const point = { id: uid('p'), owner: me, at: new Date().toISOString(), ...a.point };
      return withAudit({ ...state, points: [...state.points, point] }, me, 'map', `Додано позначку «${point.name}» (${point.lat.toFixed(4)}, ${point.lon.toFixed(4)})`);
    }
    case 'point/delete': {
      const p = state.points.find((x) => x.id === a.id);
      return withAudit({ ...state, points: state.points.filter((x) => x.id !== a.id) }, me, 'map', `Видалено позначку «${p.name}»`);
    }
    case 'map/log':
      return withAudit(state, me, 'map', a.text);
    case 'seen':
      return { ...state, seen: { ...state.seen, [me]: new Date().toISOString() } };
    case 'audit/export':
      return withAudit(state, me, 'system', 'Експортовано журнал аудиту (CSV)');
    case 'settings':
      return { ...state, settings: { ...state.settings, ...a.patch } };
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

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota or private mode */ }
  }, [state]);

  const toast = useCallback((text) => {
    const id = uid('t');
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const value = useMemo(() => {
    const me = state.users.find((u) => u.id === state.session?.userId) || null;
    const perms = me ? PERMISSIONS[me.role] : {};
    const userById = (id) => state.users.find((u) => u.id === id);
    return { state, dispatch, me, perms, userById, toast, toasts };
  }, [state, toast, toasts]);

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

export const canSeeFile = (me, f) => f.clearance <= me.clearance || (me.grants || []).includes(f.folder);

export const initials = (name) => name.split(' ').map((p) => p[0]).slice(0, 2).join('');
