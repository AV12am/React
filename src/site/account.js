// The account mark at the top right of every page of the public site (src/site/partials/header.html): signed out —
// a person outline that opens «Continue with Google / LinkedIn»; signed in — the person's initial, opening their name,
// e-mail and «Sign out». Shown only once sign-in is on (SITE_OPEN false and Supabase configured): while the site is
// open to everyone there is nothing to sign in to, so it stays hidden.
import { PROVIDERS, session, signInWith, signOut, enabled } from './auth.js';
import { SITE_OPEN } from '../lib/site-open.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PERSON = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="6.2" r="3.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2.8 16c.6-3.3 3.1-5.1 6.2-5.1s5.6 1.8 6.2 5.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

/** What the person is called and their initial, from the provider's profile (pure — tested). */
export function whoOf(s) {
  const u = s?.user || {};
  const m = u.user_metadata || {};
  const name = String(m.full_name || m.name || '').trim();
  const email = String(u.email || m.email || '').trim();
  const letter = (name || email).trim().charAt(0).toUpperCase();
  return { name, email, letter };
}

export async function mountAccount(open = SITE_OPEN, on = enabled) {
  const box = document.querySelector('[data-acct]');
  if (!box || open || !on) return;
  const btn = box.querySelector('.acct-btn');
  const menu = box.querySelector('.acct-menu');
  box.hidden = false;
  const s = await session().catch(() => null);
  if (s) {
    const me = whoOf(s);
    btn.innerHTML = `<span class="acct-in" aria-hidden="true">${esc(me.letter || '•')}</span>`;
    btn.setAttribute('aria-label', 'Account');
    menu.innerHTML = `<div class="acct-who">${me.name ? `<b data-no-i18n>${esc(me.name)}</b>` : ''}<span data-no-i18n>${esc(me.email)}</span></div><button type="button" data-out>Sign out</button>`;
  } else {
    btn.innerHTML = PERSON;
    btn.setAttribute('aria-label', 'Sign in');
    menu.innerHTML = `<div class="acct-who"><span>Sign in</span></div>${PROVIDERS.map((p) => `<button type="button" data-p="${p.id}">Continue with ${p.name}</button>`).join('')}`;
  }
  const close = () => { box.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); const o = !box.classList.contains('open'); box.classList.toggle('open', o); btn.setAttribute('aria-expanded', String(o)); });
  menu.addEventListener('click', (e) => {
    const p = e.target.closest('[data-p]');
    if (p) return signInWith(p.dataset.p);
    if (e.target.closest('[data-out]')) { signOut(); location.reload(); }
  });
  document.addEventListener('click', (e) => { if (!box.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
