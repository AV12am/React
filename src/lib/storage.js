// Central file storage. One interface, three free backends, picked at start-up:
//
//   supabase — self-hosted or supabase.com free tier (1 ГБ). Set VITE_SUPABASE_URL,
//              VITE_SUPABASE_ANON_KEY and optionally VITE_SUPABASE_BUCKET at build time.
//              Real sign-in; the Vault through api/files.js (bodies in Cloudflare R2 when set
//              up, else Supabase Storage), the team's records in Postgres behind row-level
//              security (deploy/supabase.sql).
//   artifact — when the app runs as a claude.ai artifact: bodies in the artifact's
//              asset store, the shared index in its document store. Free, shared by
//              everyone the artifact is shared with.
//   local    — fallback: IndexedDB on this device only.
//
// Every backend exposes the same calls; Vault never knows which one it is talking to.

import { putBlob, getBlob, deleteBlob } from '../vaultdb.js';
import { supabaseOn, rest, signedIn, onSession, filesApi } from './supabase.js';

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

// ---------- Supabase (+ Cloudflare R2) ----------
// The Vault goes through the server function api/files.js: it checks the person and their clearance,
// files and lists the cards, and hands out one-off signed addresses for file bodies — in Cloudflare R2 when
// it is configured, otherwise in Supabase Storage. The browser never touches the Vault tables or the bucket.
// The team's shared state (people, records…) is read and written with the person's own token under
// row-level security (deploy/supabase.sql).
function supabaseBackend() {
  const poll = (fn, ms) => { fn(); const t = setInterval(fn, ms); return () => clearInterval(t); };
  const upsert = (table, row) => rest(`${table}?on_conflict=${table === 'core_docs' ? 'kind,id' : 'id'}`, { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' });
  const gone = (e) => { if (e?.status !== 404) throw e; };
  // Asked afresh each time the Vault changes (Vault.jsx), so the meter follows uploads.
  const where = () => filesApi({ op: 'info' }).catch(() => null);
  return {
    kind: 'supabase',
    label: 'Supabase',
    shared: true,
    writable: true,
    needsSignIn: true,
    maxFile: 50 * MiB,
    quota: (Number(import.meta.env?.VITE_STORAGE_QUOTA_GB || import.meta.env?.NEXT_PUBLIC_STORAGE_QUOTA_GB) || 9.75) * 1024 * MiB, // until the server reports it (api/files.js, R2_QUOTA_GB)
    // Where new files go, what is used there and the limit (Cloudflare R2: 9,75 ГБ of the free 10 ГБ).
    async usage() {
      const i = await where();
      return i ? { bytes: i.used, maxBytes: i.quota, label: i.store === 'r2' ? 'Cloudflare R2' : 'Supabase' } : null;
    },
    // `dir` keeps related files together, e.g. companies/20077720/<id>/logo.png. The card is filed after
    // the body (index.addFile), with the same id; `opts.clearance` is checked before anything is stored.
    async put(id, file, { dir, clearance = 0 } = {}) {
      const s = await filesApi({ op: 'sign', id, dir: dir || 'vault', name: file.name, type: file.type, size: file.size, clearance });
      const res = await fetch(s.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream', ...(s.headers || {}) }, body: file })
        .catch(() => { throw new Error(`сховище недоступне${s.store === 'r2' ? ' (перевірте CORS у бакеті R2)' : ''}`); });
      if (!res.ok) throw new Error(`сховище не прийняло файл (${res.status})`);
      return { ref: s.ref, store: s.store };
    },
    async get(f) {
      const { url } = await filesApi({ op: 'url', id: f.id });
      const res = await fetch(url);
      return res.ok ? res.blob() : null;
    },
    async remove(f) { await filesApi({ op: 'remove', id: f.id }).catch(gone); },
    index: {
      watch(onFiles, onFolders) {
        const load = async () => {
          if (!signedIn()) return;
          try {
            const r = await filesApi({ op: 'list' });
            onFiles(r.files || []);
            onFolders(r.folders || []);
          } catch { /* offline or signed out: keep last known index */ }
        };
        const stop = poll(load, 20000);
        const off = onSession(() => load());
        return () => { stop(); off(); };
      },
      addFile: (f) => filesApi({ op: 'index', meta: f }),
      // The body and the card go together (api/files.js remove).
      removeFile: (id) => filesApi({ op: 'remove', id }).catch(gone),
      addFolder: (f) => filesApi({ op: 'folder', folder: f }),
    },
    // Shared app state for the whole team (see src/lib/sync.js): people, records, requests, audit.
    docs: {
      // Only what changed is fetched: the first load (and every sign-in) takes everything, then each
      // poll asks for documents updated since the last one seen, and once a minute for the list of ids
      // alone, to notice deletions. A kind with nothing new is not handed on, so the screen stays still.
      watch(onKind) {
        const KINDS = ['records', 'requests', 'comments', 'tasks'];
        let cache = null; // kind -> Map(id -> doc)
        let audit = new Map();
        let cursor = '';
        let ticks = 0;
        let lastMembers = '';
        const later = (t) => { if (t && t > cursor) cursor = t; };
        const load = async (full = false) => {
          if (!signedIn()) return;
          try {
            const fresh = full || !cache;
            const since = fresh ? '' : `&updated_at=gte.${encodeURIComponent(cursor)}`;
            const checkIds = !fresh && ++ticks % 6 === 0;
            const [members, docs, log, ids] = await Promise.all([
              rest('core_members?select=doc,id'),
              rest(`core_docs?select=kind,doc,updated_at&kind=in.(${KINDS.join(',')})${since}`),
              rest(`core_docs?select=doc,updated_at&kind=eq.audit&order=updated_at.desc&limit=300${since}`),
              checkIds ? rest(`core_docs?select=kind,id&kind=in.(${KINDS.join(',')})`) : null,
            ]);
            // No members visible means the server does not count this sign-in (e.g. the passkey
            // confirmation expired): keep the local copy rather than replacing it with nothing.
            if (!members.length) return;
            const m = JSON.stringify(members);
            if (fresh || m !== lastMembers) onKind('users', members.map((r) => ({ ...r.doc, id: r.id })));
            lastMembers = m;
            const changed = new Set(fresh ? KINDS : []);
            if (fresh) cache = Object.fromEntries(KINDS.map((k) => [k, new Map()]));
            for (const r of docs) {
              later(r.updated_at);
              const before = cache[r.kind].get(r.doc.id);
              if (!before || JSON.stringify(before) !== JSON.stringify(r.doc)) { cache[r.kind].set(r.doc.id, r.doc); changed.add(r.kind); }
            }
            if (ids) {
              const live = new Set(ids.map((r) => `${r.kind}/${r.id}`));
              for (const k of KINDS) for (const id of [...cache[k].keys()]) if (!live.has(`${k}/${id}`)) { cache[k].delete(id); changed.add(k); }
            }
            for (const k of changed) onKind(k, [...cache[k].values()]);
            if (fresh) audit = new Map();
            const auditBefore = audit.size;
            for (const r of log) { later(r.updated_at); audit.set(r.doc.id, r.doc); }
            if (fresh || audit.size !== auditBefore) {
              const list = [...audit.values()].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 300);
              audit = new Map(list.map((d) => [d.id, d]));
              onKind('audit', list);
            }
          } catch { /* offline: keep what we have */ }
        };
        const stop = poll(() => load(false), 10000);
        const off = onSession(() => load(true));
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
  return e?.message || 'Не вдалося зберегти файл';
}
