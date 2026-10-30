// Vercel Function: attachments of records (photos, documents) — src/lib/attach.js.
//
// POST /api/files  Authorization: Bearer <Supabase access token>
//   { op: 'sign', name, type, size, clearance, division }
//       → { id, ref, uploadUrl }   the browser PUTs the file body to uploadUrl (a one-off signed address)
//   { op: 'commit', meta }          → { ok }   files the card in the Vault index (and its division's folder)
//   { op: 'url', id }               → { url }  a signed address to read the body, valid 10 minutes
//   { op: 'remove', id }            → { ok }
//
// The whole Vault goes through here too (src/lib/storage.js, Supabase backend), so the browser never reads
// or writes the Vault tables or the bucket itself:
//   { op: 'sign', id, dir, name, type, size, clearance } → { id, ref, store, uploadUrl, headers }  a Vault body
//   { op: 'index', meta }           → { ok, meta }  file or update a card (a new one is filed under the caller)
//   { op: 'list' }                  → { files, folders }  the cards up to my clearance, and the folders
//   { op: 'folder', folder }        → { ok }  a new folder (never above my clearance; an existing one is kept)
//   { op: 'info' }                  → { store, quota }  where new bodies go and how much room there is
//
// The caller must be a member with a passkey-confirmed session (_core.caller), and every check the database
// makes for the Vault is made here too: nobody files, reads or removes a card above their own clearance;
// a NON OCULIS card is read only by its owner or someone granted a basis for it.
// The service key stays on the server.
//
// Where bodies go: Cloudflare R2 when it is configured (api/_r2.js, 10 ГБ free), otherwise Supabase
// Storage. The card remembers its store (`store: 'r2'`), so files filed earlier keep opening from Supabase.
import crypto from 'node:crypto';
import { json, db, caller, SB_URL, SERVICE, env } from './_core.js';
import { r2On, presign, r2Delete, r2Size } from './_r2.js';

export const config = { maxDuration: 20 };

const BUCKET = env.VITE_SUPABASE_BUCKET || env.SUPABASE_BUCKET || 'vault';
const MAX = 50 * 1024 * 1024;
const DIVS = ['int', 'ana', 'it', 'sec', 'ops', 'acad', 'res', 'prj', 'info'];
const FOLDER = { int: 'Розвідка · вкладення', ana: 'Аналітика · вкладення', res: 'Дослідження · вкладення', prj: 'Проєкти · вкладення', acad: 'Академія · вкладення', info: 'Інформація · документи' };

const level = (m) => Math.max(0, Math.min(2, +m.doc?.clearance || 0));
const GiB = 1024 * 1024 * 1024;
// The free plan of R2 is 10 ГБ; uploads stop short of it (R2_QUOTA_GB, 9.75 by default) so it never bills.
const R2_QUOTA = (+env.R2_QUOTA_GB || 9.75) * GiB;
const SB_QUOTA = (+env.STORAGE_QUOTA_GB || 1) * GiB;
const FULL = { error: 'full', message: 'Сховище заповнене: ліміт 9,75 ГБ. Видаліть непотрібні файли.' };
async function usedBytes(store) {
  const rows = await db('vault_files?select=size:doc->>size,store:doc->>store');
  return rows.filter((r) => (r.store === 'r2') === (store === 'r2')).reduce((s, r) => s + (+r.size || 0), 0);
}
// Before a body is stored: is there room for it in the store new files go to?
async function roomFor(size) {
  return (await usedBytes(r2On ? 'r2' : 'supabase')) + size <= (r2On ? R2_QUOTA : SB_QUOTA);
}
// After: the size the store actually holds (not what the browser said); over the limit — the body goes.
async function realSize(card) {
  if (card.store !== 'r2') return card.size;
  const size = await r2Size(card.ref);
  if (size == null) throw Object.assign(new Error('Файл не дійшов до сховища — завантажте ще раз'), { status: 409 });
  if ((await usedBytes('r2')) + size > R2_QUOTA) { await r2Delete(card.ref).catch(() => {}); throw Object.assign(new Error(FULL.message), { status: 507 }); }
  return size;
}
const okId = (id) => /^[\w-]{1,80}$/.test(id || '');
const cleanDir = (d) => String(d || 'vault').split('/').filter((x) => x && x !== '..' && x !== '.').map((x) => x.replace(/[^\w-]+/g, '_')).join('/').slice(0, 120) || 'vault';
// A card's address must be its own: <dir>/<id>/<name>, nothing climbing out.
const ownRef = (ref, id) => typeof ref === 'string' && !ref.includes('..') && ref.split('/').slice(-2, -1)[0] === id && ref.split('/').length >= 3;
const mayFolder = (m, folder) => !folder || (+folder.clearance || 0) <= level(m) || (m.doc?.basis || []).includes(folder.id) || (m.doc?.grants || []).includes(folder.id);
async function folderOf(id) {
  const [row] = await db(`vault_folders?id=eq.${encodeURIComponent(id)}&select=doc`);
  return row?.doc || null;
}
async function signUpload(ref) {
  if (r2On) return { store: 'r2', uploadUrl: presign('PUT', ref, { expires: 900 }), headers: {} };
  const r = await storage(`object/upload/sign/${BUCKET}/${enc(ref)}`, {});
  if (!r.url) throw new Error('storage: no upload url');
  return { store: 'supabase', uploadUrl: `${SB_URL}/storage/v1${r.url}`, headers: { 'x-upsert': 'false' } };
}
const safe = (s) => String(s || 'file').normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-120) || 'file';
const enc = (ref) => ref.split('/').map(encodeURIComponent).join('/');

async function storage(path, body, method = 'POST') {
  const headers = { apikey: SERVICE, 'Content-Type': 'application/json' };
  if (SERVICE.startsWith('eyJ')) headers.Authorization = `Bearer ${SERVICE}`;
  const res = await fetch(`${SB_URL}/storage/v1/${path}`, { method, headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`storage ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return res.json().catch(() => ({}));
}

async function cardOf(id) {
  const [row] = await db(`vault_files?id=eq.${encodeURIComponent(id)}&select=doc`);
  return row?.doc || null;
}
const mayRead = (m, f) => (+f.clearance || 0) <= level(m)
  && (!f.sealed || f.owner === m.id || (m.doc?.basis || []).includes(f.id));

export async function POST(req) {
  if (!SB_URL || !SERVICE) return json(503, { error: 'not_configured', message: 'Потрібні SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY' });
  try {
    const m = await caller(req);
    if (!m) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    const body = await req.json().catch(() => ({}));

    if (body.op === 'sign') {
      const clearance = Math.max(0, Math.min(2, +body.clearance || 0));
      if (clearance > level(m)) return json(403, { error: 'level', message: 'Гриф вищий за ваш допуск' });
      if (!(+body.size > 0) || +body.size > MAX) return json(413, { error: 'size', message: 'Файл порожній або більший за 50 МБ' });
      // A Vault body (the card is filed afterwards with op 'index') or a record's attachment.
      const vault = body.dir != null || body.id != null;
      const id = vault && okId(body.id) ? body.id : `x-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
      if (vault && await cardOf(id)) return json(409, { error: 'exists', message: 'Файл з таким номером уже є' });
      if (!(await roomFor(+body.size))) return json(507, FULL);
      const ref = vault ? `${cleanDir(body.dir)}/${id}/${safe(body.name)}` : `att/${DIVS.includes(body.division) ? body.division : 'int'}/${id}/${safe(body.name)}`;
      return json(200, { id, ref, ...(await signUpload(ref)) });
    }

    if (body.op === 'index') {
      const f = body.meta || {};
      if (!okId(f.id) || !ownRef(f.ref, f.id)) return json(400, { error: 'meta', message: 'Неправильна картка файлу' });
      const clearance = Math.max(0, Math.min(2, +f.clearance || 0));
      if (clearance > level(m)) return json(403, { error: 'level', message: 'Гриф вищий за ваш допуск' });
      const old = await cardOf(f.id);
      if (old && !mayRead(m, old)) return json(403, { error: 'level', message: 'Гриф вищий за ваш допуск' });
      const folder = f.folder ? await folderOf(f.folder) : null;
      if (f.folder && !folder) return json(404, { error: 'folder', message: 'Папку не знайдено' });
      if (!mayFolder(m, folder)) return json(403, { error: 'level', message: 'Гриф папки вищий за ваш допуск' });
      // Who filed it, where its body is and when are fixed; a new card is filed under the caller.
      const fixed = old
        ? { ref: old.ref, store: old.store, owner: old.owner, ownerName: old.ownerName, at: old.at }
        : { owner: m.id, ownerName: m.doc?.name || '', at: new Date().toISOString(), store: f.store === 'r2' && r2On ? 'r2' : 'supabase' };
      const card = { ...f, clearance, sealed: !!f.sealed, stored: true, backend: 'supabase', ...fixed };
      if (!old) card.size = await realSize(card);
      else card.size = old.size;
      await db('vault_files?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { id: card.id, doc: card } });
      return json(200, { ok: true, meta: card });
    }

    if (body.op === 'list') {
      const [files, folders] = await Promise.all([db('vault_files?select=doc'), db('vault_folders?select=doc')]);
      const mine = (m.doc?.basis || []);
      return json(200, {
        files: files.map((r) => r.doc).filter((f) => f && (+f.clearance || 0) <= level(m))
          // A sealed card is listed, but its text only for its owner or someone with a basis for it.
          .map((f) => (f.sealed && f.owner !== m.id && !mine.includes(f.id) ? { ...f, text: undefined } : f))
          // The small preview stays in the records that show it; the index is polled and stays light.
          .map((f) => (f.thumb ? { ...f, thumb: undefined, hasThumb: true } : f)),
        folders: folders.map((r) => r.doc).filter(Boolean),
      });
    }

    if (body.op === 'folder') {
      const f = body.folder || {};
      if (!okId(f.id) || !String(f.name || '').trim()) return json(400, { error: 'folder', message: 'Неправильна папка' });
      if ((+f.clearance || 0) > level(m)) return json(403, { error: 'level', message: 'Гриф папки вищий за ваш допуск' });
      await db('vault_folders?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { id: f.id, doc: { ...f, clearance: Math.max(0, Math.min(2, +f.clearance || 0)) } } });
      return json(200, { ok: true });
    }

    if (body.op === 'info') return json(200, { store: r2On ? 'r2' : 'supabase', quota: r2On ? R2_QUOTA : SB_QUOTA, used: await usedBytes(r2On ? 'r2' : 'supabase') });

    if (body.op === 'commit') {
      const f = body.meta || {};
      const division = DIVS.includes(f.division) ? f.division : 'int';
      if (!/^x-[\w-]+$/.test(f.id || '') || f.ref !== `att/${division}/${f.id}/${f.ref?.split('/').pop()}`) return json(400, { error: 'meta', message: 'Неправильна картка файлу' });
      if ((+f.clearance || 0) > level(m)) return json(403, { error: 'level', message: 'Гриф вищий за ваш допуск' });
      const folder = `f-att-${division}`;
      const card = {
        ...f, folder, division, clearance: Math.max(0, Math.min(2, +f.clearance || 0)), sealed: false, store: f.store === 'r2' && r2On ? 'r2' : 'supabase',
        owner: m.id, ownerName: m.doc?.name || '', at: new Date().toISOString(), stored: true, backend: 'supabase',
      };
      card.size = await realSize(card);
      await db('vault_folders?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { id: folder, doc: { id: folder, name: FOLDER[division] || 'Вкладення', clearance: 0, division, group: 'attachments' } } });
      await db('vault_files?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { id: card.id, doc: card } });
      return json(200, { ok: true, meta: card });
    }

    // Many pictures at once (a page of cards): one call, signed addresses for those the caller may read.
    if (body.op === 'urls') {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String).filter(okId))].slice(0, 100);
      if (!ids.length) return json(200, { urls: {} });
      const rows = await db(`vault_files?id=in.(${ids.map((i) => `"${i}"`).join(',')})&select=doc`);
      const urls = {};
      await Promise.all(rows.map((r) => r.doc).filter((f) => f?.ref && mayRead(m, f)).map(async (f) => {
        if (f.store === 'r2') { urls[f.id] = presign('GET', f.ref, { expires: 3600 }); return; }
        const r = await storage(`object/sign/${BUCKET}/${enc(f.ref)}`, { expiresIn: 3600 }).catch(() => ({}));
        if (r.signedURL || r.signedUrl) urls[f.id] = `${SB_URL}/storage/v1${r.signedURL || r.signedUrl}`;
      }));
      return json(200, { urls, ttl: 3600 });
    }

    if (body.op === 'url' || body.op === 'remove') {
      const f = await cardOf(String(body.id || ''));
      if (!f || !f.ref) return json(404, { error: 'missing', message: 'Файл не знайдено' });
      if (!mayRead(m, f)) return json(403, { error: 'level', message: 'Гриф вищий за ваш допуск' });
      if (body.op === 'url') {
        if (f.store === 'r2') return json(200, { url: presign('GET', f.ref, { expires: 600 }) });
        const r = await storage(`object/sign/${BUCKET}/${enc(f.ref)}`, { expiresIn: 600 });
        return json(200, { url: `${SB_URL}/storage/v1${r.signedURL || r.signedUrl}` });
      }
      if (f.owner !== m.id && !['admin', 'lead'].includes(m.doc?.role)) return json(403, { error: 'owner', message: 'Видалити може автор файлу або керівник' });
      if (f.store === 'r2') await r2Delete(f.ref);
      else await storage(`object/${BUCKET}`, { prefixes: [f.ref] }, 'DELETE');
      await db(`vault_files?id=eq.${encodeURIComponent(f.id)}`, { method: 'DELETE', prefer: 'return=minimal' });
      return json(200, { ok: true });
    }

    return json(400, { error: 'op', message: 'Невідома дія' });
  } catch (e) {
    return json(e.status || 500, { error: e.status === 507 ? 'full' : 'error', message: e.message });
  }
}
