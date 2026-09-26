import { useEffect, useState } from 'react';

// Reads the conflict data that scripts/update-conflicts.mjs publishes next to the app
// (public/data/conflicts/). Missing files are normal — the map then uses its built-in outlines.
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
