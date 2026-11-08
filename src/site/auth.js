// Sign-in on the public site (reactioncore.uk) for SITUATION and CONTEXT: Google or LinkedIn through Supabase Auth
// (OAuth with PKCE, plain fetch, no SDK). Signing in opens the areas at once; an administrator of the workspace can
// close access for a person (deploy/site.sql, status «blocked»). The session is kept apart from the
// workspace's, and the database never treats it as a team member (core_email() ignores OAuth sessions).
import { SB_URL, SB_KEY } from '../lib/supabase.js';
import { SITE_OPEN } from '../lib/site-open.js';

export const PROVIDERS = [
  { id: 'google', name: 'Google' },
  { id: 'linkedin_oidc', name: 'LinkedIn' },
];
const KEY = 'reaction-site/session';
const VERIFIER = 'reaction-site/pkce';
const on = Boolean(SB_URL && SB_KEY);

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const keep = (s) => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* private mode */ } };
const withExpiry = (s) => ({ ...s, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) });

async function auth(path, body) {
  const res = await fetch(`${SB_URL}/auth/v1/${path}`, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || `HTTP ${res.status}`);
  return data;
}

/** Off to the provider; back to this very page with ?code=… */
export async function signInWith(provider) {
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(VERIFIER, verifier);
  const back = `${location.origin}${location.pathname}`;
  location.assign(`${SB_URL}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(back)}&code_challenge=${challenge}&code_challenge_method=s256`);
}

export function signOut() {
  const s = read();
  keep(null);
  if (s?.access_token) fetch(`${SB_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
}

/** The session: finishing a return from the provider, refreshing an old one — or null. */
export async function session() {
  if (!on) return null;
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  if (code) {
    url.searchParams.delete('code');
    history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
    const verifier = sessionStorage.getItem(VERIFIER);
    sessionStorage.removeItem(VERIFIER);
    if (verifier) {
      try { const s = withExpiry(await auth('token?grant_type=pkce', { auth_code: code, code_verifier: verifier })); keep(s); return s; } catch { /* fall through */ }
    }
  }
  const s = read();
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s;
  try { const fresh = withExpiry(await auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token })); keep(fresh); return fresh; } catch { keep(null); return null; }
}

/** REST with the person's token: row-level security decides (their own row, their own dashboards). */
export async function rest(path, { method = 'GET', body, prefer } = {}) {
  const s = await session();
  if (!s) throw new Error('signed out');
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

/** Who is here: { user, status: 'approved' | 'blocked' } — or null when signed out. */
export async function whoAmI() {
  const s = await session();
  if (!s) return null;
  const u = s.user || {};
  const meta = u.user_metadata || {};
  const row = { id: u.id, email: u.email || meta.email || '', name: meta.full_name || meta.name || '', provider: u.app_metadata?.provider || '' };
  // The first visit adds the person; later visits leave the row as it is.
  await rest('site_users', { method: 'POST', body: row, prefer: 'resolution=ignore-duplicates,return=minimal' }).catch(() => {});
  const [me] = (await rest(`site_users?id=eq.${encodeURIComponent(u.id)}&select=status`).catch(() => [])) || [];
  return { user: row, status: me?.status || 'approved' };
}

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Guards an area: shows the sign-in card in `box`, and calls `open(me)` for a signed-in person whose access is not
 * closed. `area` names it in the text («SITUATION»).
 */
export async function guard(box, area, open) {
  const show = (html) => { box.hidden = false; box.innerHTML = html; };
  if (SITE_OPEN) { box.hidden = true; box.innerHTML = ''; return open({ user: { id: 'local', name: 'Ви', email: '' }, status: 'approved', local: true }); }
  if (!on) return show(`<div class="gate"><h2>${area} is not available yet.</h2><p>Sign-in is being set up. Please write to <a href="mailto:info@reactioncore.uk">info@reactioncore.uk</a>.</p></div>`);
  let me = null;
  try { me = await whoAmI(); } catch { me = null; }
  if (!me) {
    show(`<div class="gate"><span class="k">${area}</span><h2>Sign in to continue.</h2><p>Sign in with your Google or LinkedIn account to open ${area}.</p>
      <div class="gate-btns">${PROVIDERS.map((p) => `<button class="btn btn-line" type="button" data-p="${p.id}">Continue with ${p.name}</button>`).join('')}</div></div>`);
    box.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => signInWith(b.dataset.p)));
    return;
  }
  const out = `<button class="btn btn-line" type="button" data-out>Sign out</button>`;
  const bind = () => box.querySelector('[data-out]')?.addEventListener('click', () => { signOut(); location.reload(); });
  if (me.status === 'blocked') { show(`<div class="gate"><h2>Access is closed.</h2><p>Access for ${esc(me.user.email)} has been closed. Questions: <a href="mailto:info@reactioncore.uk">info@reactioncore.uk</a>.</p><div class="gate-btns">${out}</div></div>`); return bind(); }
  box.hidden = true; box.innerHTML = '';
  open(me);
}
