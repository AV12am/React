// Supabase connection: sign-in (Supabase Auth, e-mail + password) and authorised REST calls.
// Plain fetch, no SDK. Configured at build time with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
// Every request after sign-in carries the person's access token, so the database's row-level
// security (deploy/supabase.sql) decides what they may read and change.

const env = import.meta.env || {};
export const SB_URL = (env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
export const SB_KEY = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const SB_BUCKET = env.VITE_SUPABASE_BUCKET || 'vault';
export const supabaseOn = !!(SB_URL && SB_KEY);

const SESSION_KEY = 'reaction-core/sb-session';
let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { session = null; }
const listeners = new Set();

function keep(s) {
  session = s;
  try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
  listeners.forEach((fn) => fn(s));
}
export const onSession = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const currentEmail = () => session?.user?.email?.toLowerCase() || null;
export const signedIn = () => !!session?.access_token;

const withExpiry = (s) => ({ ...s, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) });

async function authCall(path, body) {
  const res = await fetch(`${SB_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error_description || data.msg || data.message || `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status, code: data.error_code || data.error });
  }
  return data;
}

export async function signIn(email, password) {
  const s = await authCall('token?grant_type=password', { email: email.trim(), password });
  keep(withExpiry(s));
  return s.user;
}

let refreshing = null;
async function refresh() {
  if (!session?.refresh_token) return null;
  if (!refreshing) {
    refreshing = authCall('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then((s) => { keep(withExpiry(s)); return session; })
      .catch((e) => { if (e.status === 400 || e.status === 401) keep(null); return null; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function signOut() {
  const token = session?.access_token;
  keep(null);
  if (token) await fetch(`${SB_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } }).catch(() => {});
}

/** Headers for a request as the signed-in person (refreshing the token when it is about to expire). */
export async function authHeaders(extra = {}) {
  if (session && session.expires_at - 60 < Date.now() / 1000) await refresh();
  const token = session?.access_token || SB_KEY;
  return { apikey: SB_KEY, Authorization: `Bearer ${token}`, ...extra };
}

/** PostgREST call; throws with the server's message on failure. */
export async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = await authHeaders({ ...(body ? { 'Content-Type': 'application/json' } : {}), ...(prefer ? { Prefer: prefer } : {}) });
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && session) { await refresh(); }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(data.message || `HTTP ${res.status}`), { status: res.status, code: data.code });
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

export const rpc = (fn, args) => rest(`rpc/${fn}`, { method: 'POST', body: args });
