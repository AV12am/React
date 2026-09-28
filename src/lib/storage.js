// Central file storage. One interface, three free backends, picked at start-up:
//
//   supabase — self-hosted or supabase.com free tier (1 ГБ). Set VITE_SUPABASE_URL,
//              VITE_SUPABASE_ANON_KEY and optionally VITE_SUPABASE_BUCKET at build time.
//              File bodies go to Storage, the shared index to the `vault_files` and
//              `vault_folders` tables (schema in deploy/supabase.sql).
//   artifact — when the app runs as a claude.ai artifact: bodies in the artifact's
//              asset store, the shared index in its document store. Free, shared by
//              everyone the artifact is shared with.
//   local    — fallback: IndexedDB on this device only.
//
// Every backend exposes the same calls; Vault never knows which one it is talking to.

import { putBlob, getBlob, deleteBlob } from '../vaultdb.js';

const env = import.meta.env || {};
const SB_URL = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = env.VITE_SUPABASE_ANON_KEY || '';
const SB_BUCKET = env.VITE_SUPABASE_BUCKET || 'vault';

const MiB = 1024 * 1024;

// ---------- local (IndexedDB) ----------
const local = {
  kind: 'local',
  label: 'Цей пристрій (IndexedDB)',
  shared: false,
  writable: true,
  maxFile: 500 * MiB,
  quota: 2 * 1024 * MiB,
  async put(id, file) { await putBlob(id, file); return { ref: id }; },
  async get(f) { return getBlob(f.ref || f.id); },
  async remove(f) { await deleteBlob(f.ref || f.id); },
};

// ---------- claude.ai artifact (assets + db) ----------
// The asset store serves only a closed set of types; anything else (docx, xlsx, zip…)
// travels base64-wrapped as text/plain and is unwrapped on read.
const NATIVE = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm)|application\/pdf)$/;
const toB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (txt, type) => {
  const bin = atob(txt.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type });
};

function artifactBackend(assets, db) {
  return {
    kind: 'artifact',
    label: 'Сховище Reaction (claude.ai)',
    shared: true,
    writable: !!assets, // readers of the artifact can open files but not upload
    maxFile: 15 * MiB, // 20 MiB cap, minus base64 overhead for wrapped types
    quota: null, // reported by the platform, see usage()
    async put(id, file) {
      if (!assets) throw { code: 'not_granted' };
      const type = file.type || 'application/octet-stream';
      if (NATIVE.test(type)) {
        const r = await assets.upload(file, { type });
        return { ref: r.id };
      }
      const wrapped = new Blob([toB64(await file.arrayBuffer())], { type: 'text/plain' });
      const r = await assets.upload(wrapped, { type: 'text/plain' });
      return { ref: r.id, wrap: 'b64' };
    },
    async get(f) {
      const res = await fetch(`/_blob/${f.ref}`);
      if (!res.ok) return null;
      if (f.wrap === 'b64') return fromB64(await res.text(), f.type || 'application/octet-stream');
      const b = await res.blob();
      return f.type && b.type !== f.type ? new Blob([b], { type: f.type }) : b;
    },
    async remove(f) { if (f.ref && assets) await assets.delete(f.ref); },
    async usage() { return assets ? (await assets.list()).usage : null; },
    index: {
      watch(onFiles, onFolders) {
        const a = db.collection('vault').onSnapshot((s) => onFiles(s.docs.map((d) => d.data())), () => {});
        const b = db.collection('vault-folders').onSnapshot((s) => onFolders(s.docs.map((d) => d.data())), () => {});
        return () => { a(); b(); };
      },
      addFile: (f) => db.collection('vault').doc(f.id).set(f),
      removeFile: (id) => db.collection('vault').doc(id).delete(),
      addFolder: (f) => db.collection('vault-folders').doc(f.id).set(f),
    },
  };
}

// ---------- Supabase (Storage + PostgREST, plain fetch — no SDK) ----------
function supabaseBackend() {
  const h = (extra = {}) => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, ...extra });
  const obj = (ref) => `${SB_URL}/storage/v1/object/${SB_BUCKET}/${ref.split('/').map(encodeURIComponent).join('/')}`;
  const rest = (table, q = '') => `${SB_URL}/rest/v1/${table}${q}`;
  const ok = async (res) => { if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`); return res; };
  const poll = (fn, ms) => { fn(); const t = setInterval(fn, ms); return () => clearInterval(t); };
  return {
    kind: 'supabase',
    label: 'Supabase Storage',
    shared: true,
    writable: true,
    maxFile: 50 * MiB, // free-tier per-file limit
    quota: 1024 * MiB, // free-tier storage
    async put(id, file) {
      const ref = `${id}/${file.name.replace(/[^\w.-]+/g, '_')}`;
      await ok(await fetch(obj(ref), { method: 'POST', headers: h({ 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }), body: file }));
      return { ref };
    },
    async get(f) {
      const res = await fetch(`${SB_URL}/storage/v1/object/authenticated/${SB_BUCKET}/${f.ref.split('/').map(encodeURIComponent).join('/')}`, { headers: h() });
      return res.ok ? res.blob() : null;
    },
    async remove(f) {
      await ok(await fetch(`${SB_URL}/storage/v1/object/${SB_BUCKET}`, { method: 'DELETE', headers: h({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: [f.ref] }) }));
    },
    index: {
      watch(onFiles, onFolders) {
        const load = async () => {
          try {
            const [a, b] = await Promise.all([
              fetch(rest('vault_files', '?select=doc'), { headers: h() }).then(ok).then((r) => r.json()),
              fetch(rest('vault_folders', '?select=doc'), { headers: h() }).then(ok).then((r) => r.json()),
            ]);
            onFiles(a.map((r) => r.doc));
            onFolders(b.map((r) => r.doc));
          } catch { /* offline: keep last known index */ }
        };
        return poll(load, 20000);
      },
      addFile: (f) => fetch(rest('vault_files'), { method: 'POST', headers: h({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }), body: JSON.stringify({ id: f.id, doc: f }) }).then(ok),
      removeFile: (id) => fetch(rest('vault_files', `?id=eq.${encodeURIComponent(id)}`), { method: 'DELETE', headers: h() }).then(ok),
      addFolder: (f) => fetch(rest('vault_folders'), { method: 'POST', headers: h({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }), body: JSON.stringify({ id: f.id, doc: f }) }).then(ok),
    },
  };
}

// ---------- selection ----------
let chosen;
async function resolve() {
  if (SB_URL && SB_KEY) return supabaseBackend();
  const use = typeof window !== 'undefined' && window.claude?.use;
  if (use) {
    try {
      const [assets, db] = await Promise.all([window.claude.use('assets').catch(() => null), window.claude.use('db').catch(() => null)]);
      if (db) return artifactBackend(assets, db);
    } catch { /* not served here */ }
  }
  return local;
}

/** The active backend (memoized). Always resolves; falls back to local. */
export function storage() {
  if (!chosen) chosen = resolve();
  return chosen;
}

/** Map a backend rejection to a message for the person uploading. */
export function storageError(e) {
  const code = e?.code;
  if (code === 'too_large') return 'Файл завеликий для сховища';
  if (code === 'quota_or_state') return 'Сховище заповнене';
  if (code === 'rate_limited') return 'Забагато завантажень — спробуйте за хвилину';
  if (code === 'not_granted' || code === 'upstream_auth') return 'Немає дозволу на запис у сховище';
  return 'Не вдалося зберегти файл';
}
