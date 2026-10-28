// Addresses of pictures for <img>: with Supabase, signed by api/files.js for a whole page at once (one call
// for every picture asked within the same moment) and remembered for most of their hour; the browser then
// loads them itself, progressively and in parallel. Other stores fall back to reading the body (bodyOf).
import { supabaseOn, filesApi } from './supabase.js';
import { bodyOf } from './attach.js';

const known = new Map(); // id → { url, until }
let queue = null; // { ids: Set, waiters: Map(id → [resolve]) }

function flush() {
  const { ids, waiters } = queue;
  queue = null;
  filesApi({ op: 'urls', ids: [...ids] })
    .then(({ urls = {}, ttl = 3600 }) => {
      const until = Date.now() + (ttl - 300) * 1000;
      for (const id of ids) {
        if (urls[id]) known.set(id, { url: urls[id], until });
        (waiters.get(id) || []).forEach((r) => r(urls[id] || null));
      }
    })
    .catch(() => { for (const id of ids) (waiters.get(id) || []).forEach((r) => r(null)); });
}

export function imageUrl(backend, f) {
  if (!f?.id) return Promise.resolve(null);
  const k = known.get(f.id);
  if (k && k.until > Date.now()) return Promise.resolve(k.url);
  if (!(supabaseOn && backend?.kind === 'supabase')) return bodyOf(backend, f).then((b) => b.url).catch(() => null);
  return new Promise((resolve) => {
    if (!queue) { queue = { ids: new Set(), waiters: new Map() }; setTimeout(flush, 30); }
    queue.ids.add(f.id);
    queue.waiters.set(f.id, [...(queue.waiters.get(f.id) || []), resolve]);
  });
}
