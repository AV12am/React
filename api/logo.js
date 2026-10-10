// Vercel Function: a company's logo (scripts/lib/logo.mjs).
//
// POST /api/logo { sites: [{ id, url?, code?, image? }] }  (up to 8)   Authorization: Bearer <Supabase access token>
//   image — a picture address the person found themselves: fetched as is.
//   Otherwise, in order: the icons on the company's own site (url); the logo on Wikidata of the entity with this
//   EDRPOU code (exact match on P3125, so no name guessing), whose official site is also tried when none is known;
//   last, the site's favicon from Google's icon service.
//   → { results: [{ id, type, data (base64), from, via, website? } | { id, error }] }. The app files each logo in the
//   company's Vault folder like any upload. Only public http(s) addresses are fetched; at most 1 MB per image.
import { lookup } from 'node:dns/promises';
import { json, caller, SB_URL, SERVICE } from './_core.js';
import { logoCandidates, isPrivateAddress, wikidataQuery, parseWikidata, commonsThumb } from '../scripts/lib/logo.mjs';

export const config = { maxDuration: 60 };
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
async function get(u, { accept, timeout = 6000 } = {}) {
  let url = await safeUrl(u);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(timeout) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = await safeUrl(new URL(res.headers.get('location'), url).href); continue; }
    return { res, url };
  }
  throw new Error('забагато переадресацій');
}

/** One image address → { type, data, from }, or null when it is not a usable picture. */
async function image(u) {
  const { res: r } = await get(u, { accept: 'image/*' });
  const type = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (!r.ok || !/^image\//.test(type)) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 200 || buf.length > MAX) return null;
  return { type: type === 'image/vnd.microsoft.icon' ? 'image/x-icon' : type, data: buf.toString('base64'), from: u };
}

async function fromSite(site) {
  const { res, url } = await get(site, { accept: 'text/html' });
  const html = res.ok ? (await res.text()).slice(0, 400_000) : '';
  for (const c of logoCandidates(html, url).slice(0, 6)) {
    try { const got = await image(c); if (got) return got; } catch { /* next candidate */ }
  }
  return null;
}

async function wikidata(code) {
  const q = wikidataQuery(code);
  if (!q) return { logo: '', site: '' };
  const res = await fetch(q, { headers: { 'User-Agent': `${UA} (internal company directory)`, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(8000) });
  return res.ok ? parseWikidata(await res.json()) : { logo: '', site: '' };
}

async function logoOf({ url, code, image: direct }) {
  if (direct) {
    const got = await image(direct);
    if (!got) throw new Error('за посиланням немає зображення (потрібна пряма адреса картинки, до 1 МБ)');
    return { ...got, via: 'посилання' };
  }
  if (url) { try { const got = await fromSite(url); if (got) return { ...got, via: 'сайт' }; } catch { /* try Wikidata */ } }
  const wd = await wikidata(code).catch(() => ({ logo: '', site: '' }));
  if (wd.logo) { try { const got = await image(commonsThumb(wd.logo)); if (got) return { ...got, via: 'Wikidata', website: wd.site }; } catch { /* next */ } }
  const site = url || wd.site;
  if (!url && site) { try { const got = await fromSite(site); if (got) return { ...got, via: 'сайт (з Wikidata)', website: site }; } catch { /* next */ } }
  if (site) {
    try {
      const got = await image(`https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(new URL(site).hostname)}`);
      if (got) return { ...got, via: 'значок сайту', ...(url ? {} : { website: site }) };
    } catch { /* nothing left */ }
  }
  throw new Error(site ? 'логотип не знайдено ні на сайті, ні у Wikidata' : 'немає сайту, а у Wikidata логотипа для цього коду немає');
}

export async function POST(req) {
  try {
    if (SB_URL && SERVICE && !(await caller(req))) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    const body = await req.json().catch(() => ({}));
    const http = (v) => (/^https?:\/\//.test(v || '') ? v : '');
    const sites = (Array.isArray(body.sites) ? body.sites : [])
      .map((s) => ({ id: s?.id, url: http(s?.url), image: http(s?.image), code: /^\d{8}$/.test(s?.code || '') ? s.code : '' }))
      .filter((s) => s.id && (s.url || s.image || s.code)).slice(0, 8);
    const results = await Promise.all(sites.map(async (s) => {
      try { return { id: s.id, ...(await logoOf(s)) }; } catch (e) { return { id: s.id, error: e.message }; }
    }));
    return json(200, { results });
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
