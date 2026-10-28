// Вкладення записів (фото, документи) — the body in the file store, the card in the Vault index.
//
// With Supabase the browser never writes the Vault tables itself: api/files.js checks the person and their
// clearance, hands out a one-off signed upload address, files the card and signs read addresses.
// The other stores (this browser, claude.ai) go through the ordinary backend calls.
import { supabaseOn, authHeaders } from './supabase.js';
import { extractText } from './textract.js';
import { docNumber, nextSerial } from '../data/clearance.js';
import { DIVISIONS } from '../data/seed.js';

const MiB = 1024 * 1024;

async function api(body) {
  const res = await fetch(new URL('api/files', document.baseURI), { method: 'POST', headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || (res.status === 404 ? 'Серверна функція недоступна (працює лише на Vercel)' : `HTTP ${res.status}`));
  return data;
}

export const kindOf = (f) => {
  const n = (f?.name || '').toLowerCase();
  const t = f?.type || '';
  if (/^image\//.test(t) || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(n)) return 'image';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.docx') || t.includes('wordprocessingml')) return 'docx';
  if (n.endsWith('.doc') || t === 'application/msword') return 'doc';
  if (n.endsWith('.xlsx') || t.includes('spreadsheetml')) return 'xlsx';
  if (/^video\//.test(t) || /\.(mp4|webm|mov)$/.test(n)) return 'video';
  if (/^audio\//.test(t) || /\.(mp3|wav|ogg|m4a)$/.test(n)) return 'audio';
  if (/^text\//.test(t) || /\.(txt|csv|md|json|log)$/.test(n)) return 'text';
  return 'other';
};

/**
 * Upload files and file their cards. ctx: { state, me, dispatch, backend }.
 * opts: { clearance, division, record } → the new cards (in the order given).
 */
export async function upload(ctx, list, { clearance = 0, division = 'int', record = null } = {}) {
  const { state, me, dispatch, backend } = ctx;
  if (!backend) throw new Error('Сховище ще підключається');
  const year = new Date().getFullYear();
  const taken = state.files.map((f) => f.number);
  const out = [];
  for (const file of list) {
    const max = backend.maxFile || 50 * MiB;
    if (file.size > max) throw new Error(`«${file.name}» більший за ${Math.round(max / MiB)} МБ`);
    const meta = {
      name: file.name, size: file.size, type: file.type || 'application/octet-stream', clearance, division, record,
      number: docNumber({ level: clearance, sealed: false, year, serial: nextSerial(taken, year) }), role: 'attachment',
    };
    taken.push(meta.number);
    if (['pdf', 'docx', 'text'].includes(kindOf(file))) { const text = await extractText(file).catch(() => ''); if (text) meta.text = text; meta.indexed = true; }
    let card;
    if (supabaseOn && backend.kind === 'supabase') {
      const s = await api({ op: 'sign', name: file.name, type: meta.type, size: file.size, clearance, division });
      // Supabase Storage or Cloudflare R2 — api/files.js decides and signs the address.
      const put = await fetch(s.uploadUrl, { method: 'PUT', headers: { 'Content-Type': meta.type, ...(s.headers || { 'x-upsert': 'false' }) }, body: file })
        .catch(() => { throw new Error(`«${file.name}»: сховище недоступне${s.store === 'r2' ? ' (перевірте CORS у бакеті R2)' : ''}`); });
      if (!put.ok) throw new Error(`«${file.name}»: сховище не прийняло файл (${put.status})`);
      card = (await api({ op: 'commit', meta: { ...meta, id: s.id, ref: s.ref, store: s.store } })).meta;
    } else {
      const id = `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const folder = `f-att-${division}`;
      if (!state.folders.some((f) => f.id === folder)) {
        const f = { id: folder, name: `${DIVISIONS.find((d) => d.id === division)?.name || 'Записи'} · вкладення`, clearance: 0, division, group: 'attachments' };
        if (backend.index) await backend.index.addFolder(f);
        dispatch({ type: 'folder/add', folder: f });
      }
      const put = await backend.put(id, file, { dir: `att/${division}` });
      card = { ...meta, ...put, id, folder, sealed: false, owner: me.id, ownerName: me.name, at: new Date().toISOString(), stored: true, backend: backend.kind };
      if (backend.index) await backend.index.addFile(card);
    }
    dispatch({ type: 'file/add', file: card });
    out.push(card);
  }
  return out;
}

/** What a record keeps of a file: enough to show, open and report it without the Vault index. */
export const cardForRecord = (c) => ({
  id: c.id, name: c.name, type: c.type, size: c.size, ref: c.ref, wrap: c.wrap, number: c.number, clearance: c.clearance, store: c.store,
  folder: c.folder, owner: c.owner, at: c.at, backend: c.backend, ...(c.text ? { text: String(c.text).slice(0, 20000) } : {}),
});

const cache = new Map(); // file id → { url, blob }
/**
 * The body of a card: { url, blob } (cached for the session). Viewers read `blob` directly — the page's
 * security policy does not let scripts fetch blob: addresses; `url` is for <img>, <video> and downloads.
 */
export async function bodyOf(backend, f) {
  if (cache.has(f.id)) return cache.get(f.id);
  let blob;
  if (supabaseOn && backend?.kind === 'supabase' && String(f.ref || '').startsWith('att/')) {
    const { url } = await api({ op: 'url', id: f.id });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Файл недоступний (${res.status})`);
    blob = await res.blob();
  } else {
    blob = await backend.get(f);
  }
  if (!blob) throw new Error('Файл недоступний');
  const typed = f.type && blob.type !== f.type ? new Blob([blob], { type: f.type }) : blob;
  const body = { url: URL.createObjectURL(typed), blob: typed };
  cache.set(f.id, body);
  return body;
}

export async function remove(ctx, f) {
  const { backend, dispatch } = ctx;
  if (supabaseOn && backend?.kind === 'supabase' && String(f.ref || '').startsWith('att/')) await api({ op: 'remove', id: f.id });
  else {
    try { await backend.remove(f); } catch { /* already gone */ }
    if (backend.index) await backend.index.removeFile(f.id).catch(() => {});
  }
  if (cache.has(f.id)) { URL.revokeObjectURL(cache.get(f.id).url); cache.delete(f.id); }
  dispatch({ type: 'file/delete', id: f.id });
}
