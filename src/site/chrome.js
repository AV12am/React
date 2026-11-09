import { mountSwitcher } from './i18n.js';

// A tab opened before the site was updated asks for script files that no longer exist (each update renames them):
// the page reloads once and takes the new version, instead of hanging. Once per 30 s, so it never loops.
export function reloadOnce() {
  try {
    const last = +sessionStorage.getItem('reaction-site/reloaded') || 0;
    if (Date.now() - last < 30000) return false;
    sessionStorage.setItem('reaction-site/reloaded', String(Date.now()));
  } catch { /* private mode: reload anyway */ }
  location.reload();
  return true;
}
window.addEventListener('vite:preloadError', (e) => { if (reloadOnce()) e.preventDefault(); });
// What every page of the public site shares: the phone menu under the one header (src/site/partials/header.html).
const burger = document.getElementById('burger');
const mob = document.getElementById('mob');
burger?.addEventListener('click', () => {
  const open = mob.hidden;
  mob.hidden = !open;
  burger.setAttribute('aria-expanded', String(open));
  burger.textContent = open ? 'Close' : 'Menu';
});
mob?.addEventListener('click', (e) => { if (e.target.closest('a')) { mob.hidden = true; burger.setAttribute('aria-expanded', 'false'); burger.textContent = 'Menu'; } });

mountSwitcher();

// One visit per page view (api/_visits.js): no cookies, no IP kept. «Do Not Track» is respected.
try {
  if (navigator.doNotTrack !== '1' && navigator.sendBeacon && /(^|\.)reactioncore\.uk$/.test(location.hostname)) {
    navigator.sendBeacon('/api/pulse?visit=1', new Blob([JSON.stringify({ path: location.pathname, ref: document.referrer, lang: document.documentElement.lang })], { type: 'application/json' }));
  }
} catch { /* not counted */ }
