// Central file storage. One interface, three free backends, picked at start-up:
//
//   supabase — self-hosted or supabase.com free tier (1 ГБ). Set VITE_SUPABASE_URL,
//              VITE_SUPABASE_ANON_KEY and optionally VITE_SUPABASE_BUCKET at build time.
//              Real sign-in; file bodies in Storage, the shared index and the team's
//              records in Postgres, all behind row-level security (deploy/supabase.sql).
//   artifact — when the app runs as a claude.ai artifact: bodies in the artifact's
//              asset store, the shared index in its document store. Free, shared by
//              everyone the artifact is shared with.
//   local    — fallback: IndexedDB on this device only.
//
// Every backend exposes the same calls; Vault never knows which one it is talking to.

import { putBlob, getBlob, deleteBlob } from '../vaultdb.js';
import { SB_URL, SB_BUCKET, supabaseOn, authHeaders, rest, signedIn, onSession } from './supabase.js';

const MiB = 1024 * 1024;

// ---------- local (IndexedDB) ----------
const local = {
  kind: 'local',
  label: 'лише цей браузер',
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
// Every call carries the signed-in person's token: the database's row-level security
// (deploy/supabase.sql) decides what comes back. Nothing is read before sign-in.
function supabaseBackend() {
  const obj = (ref) => `${SB_URL}/storage/v1/object/${SB_BUCKET}/${ref.split('/').map(encodeURIComponent).join('/')}`;
  const ok = async (res) => { if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`); return res; };
  const poll = (fn, ms) => { fn(); const t = setInterval(fn, ms); return () => clearInterval(t); };
  const upsert = (table, row) => rest(`${table}?on_conflict=${table === 'core_docs' ? 'kind,id' : 'id'}`, { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' });
  return {
    kind: 'supabase',
    label: 'Supabase',
    shared: true,
    writable: true,
    needsSignIn: true,
    maxFile: 50 * MiB, // free-tier per-file limit
    // Free plan: 1 GB of files. On a paid plan set VITE_STORAGE_QUOTA_GB (or NEXT_PUBLIC_STORAGE_QUOTA_GB), e.g. 100.
    quota: (Number(import.meta.env?.VITE_STORAGE_QUOTA_GB || import.meta.env?.NEXT_PUBLIC_STORAGE_QUOTA_GB) || 1) * 1024 * MiB,
    // `dir` keeps related files together in the bucket, e.g. companies/20077720/<id>/logo.png.
    async put(id, file, { dir } = {}) {
      const ref = `${dir ? `${dir.replace(/[^\w/-]+/g, '_')}/` : ''}${id}/${file.name.replace(/[^\w.-]+/g, '_')}`;
      await ok(await fetch(obj(ref), { method: 'POST', headers: await authHeaders({ 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }), body: file }));
      return { ref };
    },
    async get(f) {
      const res = await fetch(`${SB_URL}/storage/v1/object/authenticated/${SB_BUCKET}/${f.ref.split('/').map(encodeURIComponent).join('/')}`, { headers: await authHeaders() });
      return res.ok ? res.blob() : null;
    },
    async remove(f) {
      await ok(await fetch(`${SB_URL}/storage/v1/object/${SB_BUCKET}`, { method: 'DELETE', headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: [f.ref] }) }));
    },
    index: {
      watch(onFiles, onFolders) {
        const load = async () => {
          if (!signedIn()) return;
          try {
            const [a, b] = await Promise.all([rest('vault_files?select=doc'), rest('vault_folders?select=doc')]);
            onFiles(a.map((r) => r.doc));
            onFolders(b.map((r) => r.doc));
          } catch { /* offline or signed out: keep last known index */ }
        };
        const stop = poll(load, 20000);
        const off = onSession(() => load());
        return () => { stop(); off(); };
      },
      addFile: (f) => upsert('vault_files', { id: f.id, doc: f }),
      removeFile: (id) => rest(`vault_files?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }),
      addFolder: (f) => upsert('vault_folders', { id: f.id, doc: f }),
    },
    // Shared app state for the whole team (see src/lib/sync.js): people, records, requests, audit.
    docs: {
      watch(onKind) {
        const load = async () => {
          if (!signedIn()) return;
          try {
            const [members, docs, audit] = await Promise.all([
              rest('core_members?select=doc,id'),
              rest('core_docs?select=kind,doc&kind=in.(records,requests,comments,tasks)'),
              rest('core_docs?select=doc&kind=eq.audit&order=updated_at.desc&limit=300'),
            ]);
            // No members visible means the server does not count this sign-in (e.g. the passkey
            // confirmation expired): keep the local copy rather than replacing it with nothing.
            if (!members.length) return;
            onKind('users', members.map((r) => ({ ...r.doc, id: r.id })));
            onKind('records', docs.filter((r) => r.kind === 'records').map((r) => r.doc));
            onKind('requests', docs.filter((r) => r.kind === 'requests').map((r) => r.doc));
            onKind('comments', docs.filter((r) => r.kind === 'comments').map((r) => r.doc));
            onKind('tasks', docs.filter((r) => r.kind === 'tasks').map((r) => r.doc));
            onKind('audit', audit.map((r) => r.doc));
          } catch { /* offline: keep what we have */ }
        };
        const stop = poll(load, 10000);
        const off = onSession(() => load());
        return () => { stop(); off(); };
      },
      // People are updated in place (PATCH) and inserted only when new: an upsert would be checked
      // as an insert, which only administrators and leads may do.
      async put(kind, doc) {
        if (kind === 'audit') return rest('core_docs?on_conflict=kind,id', { method: 'POST', body: { kind, id: doc.id, doc }, prefer: 'resolution=ignore-duplicates,return=minimal' });
        if (kind !== 'users') return upsert('core_docs', { kind, id: doc.id, doc });
        const changed = await rest(`core_members?id=eq.${encodeURIComponent(doc.id)}`, { method: 'PATCH', body: { doc }, prefer: 'return=representation' });
        if (!changed?.length) await rest('core_members', { method: 'POST', body: { id: doc.id, email: doc.email || null, doc }, prefer: 'return=minimal' });
        return null;
      },
      remove: (kind, id) => (kind === 'users'
        ? rest(`core_members?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
        : rest(`core_docs?kind=eq.${kind}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })),
    },
  };
}

// ---------- selection ----------
let chosen;
async function resolve() {
  if (supabaseOn) return supabaseBackend();
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
