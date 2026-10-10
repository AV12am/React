// Vercel Function: a company's logo from its own website (scripts/lib/logo.mjs).
//
// POST /api/logo { sites: [{ id, url }] }  (up to 8)   Authorization: Bearer <Supabase access token>
//   → { results: [{ id, type, data (base64), from } | { id, error }] }. The app files each logo in the
//   company's Vault folder like any upload. Only public http(s) addresses are fetched; at most 1 MB per image.
import { lookup } from 'node:dns/promises';
import { json, caller, SB_URL, SERVICE } from './_core.js';
import { logoCandidates, isPrivateAddress } from '../scripts/lib/logo.mjs';

export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0 (compatible; ReactionCore-logo/1.0)';
const MAX = 1024 * 1024;

async function safeUrl(u) {
  const url = new URL(u);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error('недозволена адреса');
  const addrs = await lookup(url.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error('недозволена адреса');
  return url.href;
}

// Redirects are followed by hand so every hop is checked.
async function get(u, { accept, timeout = 8000 } = {}) {
  let url = await safeUrl(u);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(timeout) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = await safeUrl(new URL(res.headers.get('location'), url).href); continue; }
    return { res, url };
  }
  throw new Error('забагато переадресацій');
}

async function logoOf(site) {
  const { res, url } = await get(site, { accept: 'text/html' });
  const html = res.ok ? (await res.text()).slice(0, 400_000) : '';
  for (const c of logoCandidates(html, url).slice(0, 6)) {
    try {
      const { res: r } = await get(c, { accept: 'image/*' });
      const type = (r.headers.get('content-type') || '').split(';')[0].trim();
      if (!r.ok || !/^image\//.test(type)) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 200 || buf.length > MAX) continue;
      return { type: type === 'image/vnd.microsoft.icon' ? 'image/x-icon' : type, data: buf.toString('base64'), from: c };
    } catch { /* next candidate */ }
  }
  throw new Error('логотип на сайті не знайдено');
}

export async function POST(req) {
  try {
    if (SB_URL && SERVICE && !(await caller(req))) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    const body = await req.json().catch(() => ({}));
    const sites = (Array.isArray(body.sites) ? body.sites : []).filter((s) => s?.id && /^https?:\/\//.test(s.url || '')).slice(0, 8);
    const results = await Promise.all(sites.map(async (s) => {
      try { return { id: s.id, ...(await logoOf(s.url)) }; } catch (e) { return { id: s.id, error: e.message }; }
    }));
    return json(200, { results });
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
