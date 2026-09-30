// Phone-only behaviour: installing to the home screen, labelled table cells for the card layout,
// edge swipes, and knowing when the app is hidden (app switcher, another app, screen off).
import { useEffect, useState } from 'react';

const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false, addEventListener() {}, removeEventListener() {} });

/** A touch device (phone, tablet) — not a narrow desktop window. */
export const isTouch = () => mq('(pointer: coarse), (hover: none)').matches;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Opened from the home-screen icon, in its own window. */
export const isStandalone = () => mq('(display-mode: standalone)').matches || navigator.standalone === true;

export function useMedia(query) {
  const [on, setOn] = useState(() => mq(query).matches);
  useEffect(() => {
    const m = mq(query);
    const h = () => setOn(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, [query]);
  return on;
}
export const usePhone = () => useMedia('(max-width: 900px)');

/* ---------- Install (Android/Chrome gives a prompt; iOS needs Share → Add to Home Screen) ---------- */
let deferred = null;
const installListeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; installListeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; installListeners.forEach((f) => f()); });
}
export function useInstall() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); installListeners.add(f); return () => installListeners.delete(f); }, []);
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    ios: isIOS(),
    prompt: async () => { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice; deferred = null; return r.outcome === 'accepted'; },
  };
}

/* ---------- Tables: each cell carries its column name, so CSS can lay rows out as cards on a phone ---------- */
function label(table) {
  const heads = [...table.querySelectorAll(':scope > thead th')].map((th) => th.textContent.trim());
  if (!heads.length) return;
  for (const tr of table.querySelectorAll(':scope > tbody > tr')) {
    [...tr.children].forEach((td, i) => { if (td.dataset.label !== heads[i]) td.dataset.label = heads[i] || ''; });
  }
}
export function labelTables(root = document.body) {
  const run = () => root.querySelectorAll('table.vx-table').forEach(label);
  let queued = false;
  const obs = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; run(); }); } });
  obs.observe(root, { childList: true, subtree: true });
  run();
  return () => obs.disconnect();
}

/* ---------- Horizontal swipe on an element ---------- */
export function useSwipe(ref, { onLeft, onRight, edge = 0, min = 60 } = {}) {
  useEffect(() => {
    const el = ref.current || document;
    let start = null;
    const down = (e) => {
      const t = e.touches[0];
      if (edge && t.clientX > edge) { start = null; return; }
      start = { x: t.clientX, y: t.clientY };
    };
    const up = (e) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x, dy = t.clientY - start.y;
      start = null;
      if (Math.abs(dx) < min || Math.abs(dy) > Math.abs(dx) * 0.7) return;
      if (dx < 0) onLeft?.(); else onRight?.();
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchend', up, { passive: true });
    return () => { el.removeEventListener('touchstart', down); el.removeEventListener('touchend', up); };
  }, [ref, onLeft, onRight, edge, min]);
}

/* ---------- Hidden: app switcher, another app, screen off ---------- */
/** Calls onHide / onShow(ms hidden). */
export function useHidden(onHide, onShow) {
  useEffect(() => {
    let since = null;
    const h = () => {
      if (document.visibilityState === 'hidden') { since = Date.now(); onHide?.(); }
      else if (since != null) { const ms = Date.now() - since; since = null; onShow?.(ms); }
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [onHide, onShow]);
}

/** A short tap on Android (iOS has no vibration API for the web). */
export const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* not allowed */ } };
