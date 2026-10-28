// Vercel Function: attachments of records (photos, documents) — src/lib/attach.js.
//
// POST /api/files  Authorization: Bearer <Supabase access token>
//   { op: 'sign', name, type, size, clearance, division }
//       → { id, ref, uploadUrl }   the browser PUTs the file body to uploadUrl (a one-off signed address)
//   { op: 'commit', meta }          → { ok }   files the card in the Vault index (and its division's folder)
//   { op: 'url', id }               → { url }  a signed address to read the body, valid 10 minutes
//   { op: 'remove', id }            → { ok }
//
// The caller must be a member with a passkey-confirmed session (_core.caller), and every check the database
// makes for the Vault is made here too: nobody files, reads or removes a card above their own clearance;
// a NON OCULIS card is read only by its owner or someone granted a basis for it.
// The service key stays on the server.
import crypto from 'node:crypto';
import { json, db, caller, SB_URL, SERVICE, env } from './_core.js';

export const config = { maxDuration: 20 };

const BUCKET = env.VITE_SUPABASE_BUCKET || env.SUPABASE_BUCKET || 'vault';
const MAX = 50 * 1024 * 1024;
const DIVS = ['int', 'ana', 'it', 'sec', 'ops', 'acad', 'res', 'prj'];
const FOLDER = { int: 'Розвідка · вкладення', ana: 'Аналітика · вкладення', res: 'Дослідження · вкладення', prj: 'Проєкти · вкладення', acad: 'Академія · вкладення' };

const level = (m) => Math.max(0, Math.min(2, +m.doc?.clearance || 0));
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
      const division = DIVS.includes(body.division) ? body.division : 'int';
      const id = `x-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
      const ref = `att/${division}/${id}/${safe(body.name)}`;
      const r = await storage(`object/upload/sign/${BUCKET}/${enc(ref)}`, {});
      if (!r.url) throw new Error('storage: no upload url');
      return json(200, { id, ref, uploadUrl: `${SB_URL}/storage/v1${r.url}` });
    }

    if (body.op === 'commit') {
      const f = body.meta || {};
      const division = DIVS.includes(f.division) ? f.division : 'int';
      if (!/^x-[\w-]+$/.test(f.id || '') || f.ref !== `att/${division}/${f.id}/${f.ref?.split('/').pop()}`) return json(400, { error: 'meta', message: 'Неправильна картка файлу' });
      if ((+f.clearance || 0) > level(m)) return json(403, { error: 'level', message: 'Гриф вищий за ваш допуск' });
      const folder = `f-att-${division}`;
      const card = {
        ...f, folder, division, clearance: Math.max(0, Math.min(2, +f.clearance || 0)), sealed: false,
        owner: m.id, ownerName: m.doc?.name || '', at: new Date().toISOString(), stored: true, backend: 'supabase',
      };
      await db('vault_folders?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { id: folder, doc: { id: folder, name: FOLDER[division] || 'Вкладення', clearance: 0, division, group: 'attachments' } } });
      await db('vault_files?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { id: card.id, doc: card } });
      return json(200, { ok: true, meta: card });
    }

    if (body.op === 'url' || body.op === 'remove') {
      const f = await cardOf(String(body.id || ''));
      if (!f || !f.ref) return json(404, { error: 'missing', message: 'Файл не знайдено' });
      if (!mayRead(m, f)) return json(403, { error: 'level', message: 'Гриф вищий за ваш допуск' });
      if (body.op === 'url') {
        const r = await storage(`object/sign/${BUCKET}/${enc(f.ref)}`, { expiresIn: 600 });
        return json(200, { url: `${SB_URL}/storage/v1${r.signedURL || r.signedUrl}` });
      }
      if (f.owner !== m.id && !['admin', 'lead'].includes(m.doc?.role)) return json(403, { error: 'owner', message: 'Видалити може автор файлу або керівник' });
      await storage(`object/${BUCKET}`, { prefixes: [f.ref] }, 'DELETE');
      await db(`vault_files?id=eq.${encodeURIComponent(f.id)}`, { method: 'DELETE', prefer: 'return=minimal' });
      return json(200, { ok: true });
    }

    return json(400, { error: 'op', message: 'Невідома дія' });
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
