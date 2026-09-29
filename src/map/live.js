import { useEffect, useState } from 'react';

// Live conflict data, from the first place that has it:
//   1. api/conflicts — the Vercel Function (api/conflicts.js) that fetches the sources itself;
//   2. data/conflicts/ — files written by scripts/update-conflicts.mjs on a self-hosted server.
// Neither is an error — the map then uses its built-in outlines.
const DIR = 'data/conflicts/';
const REFRESH_MS = 15 * 60 * 1000;

async function getJson(name) {
  const res = await fetch(new URL(DIR + name, document.baseURI), { cache: 'no-cache' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export function useLiveConflicts() {
  const [data, setData] = useState({ manifest: null, deepstate: null, isw: null, acled: null });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(new URL('api/conflicts', document.baseURI), { cache: 'no-cache' });
        const api = res.ok && /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
        if (api?.manifest && (api.deepstate || api.isw || api.acled)) { if (alive) setData(api); return; }
      } catch { /* no function on this host */ }
      let manifest;
      try { manifest = await getJson('manifest.json'); } catch { return; }
      const next = { manifest, deepstate: null, isw: null, acled: null };
      await Promise.all(['deepstate', 'isw', 'acled'].map(async (id) => {
        const s = manifest.sources?.[id];
        if (!s?.file || !s.updatedAt) return;
        try { next[id] = await getJson(s.file); } catch { /* keep null: file not deployed */ }
      }));
      if (alive) setData(next);
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return data;
}

/** Hours since an ISO date, or Infinity when unknown. */
export const ageHours = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 3600000 : Infinity);
