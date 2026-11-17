// A company's logo from its own website — for the company cards (GET /api/pulse?logo=<host>, a workspace member).
// The site's page is read for its icons (apple-touch-icon, <link rel="icon">, the manifest-less defaults), the best
// one is fetched and returned as base64; the browser shrinks it and keeps it on the record. Nothing is asked of any
// third-party icon service, so which companies the team looks at stays between the platform and the company's site.

const UA = 'Mozilla/5.0 (compatible; ReactionCore/1.0; +https://reactioncore.uk)';
const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const MAX_HTML = 600 * 1024;
const MAX_IMG = 1024 * 1024;

/** A public host name only: no addresses, no local or internal names. */
export const cleanHost = (v) => {
  let h = String(v || '').trim().toLowerCase();
  try { if (/^https?:\/\//.test(h)) h = new URL(h).hostname; } catch { return ''; }
  h = h.replace(/\/.*$/, '').replace(/\.$/, '');
  if (!HOST.test(h) || /^\d+(\.\d+){3}$/.test(h) || /(^|\.)(localhost|local|internal|lan|home|corp|test|invalid|example)$/.test(h)) return '';
  return h;
};

async function limited(res, max) {
  const len = +res.headers.get('content-length') || 0;
  if (len > max) throw new Error('too large');
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > max) throw new Error('too large');
  return buf;
}
const get = (url, accept, ms = 7000) => fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow', signal: AbortSignal.timeout(ms) });

/** Icon candidates named in a page, best first: [{url, score}] (pure — tested). */
export function iconsOf(html, base) {
  const out = [];
  for (const tag of String(html).slice(0, MAX_HTML).match(/<link\b[^>]*>/gi) || []) {
    const attr = (n) => (new RegExp(`\\b${n}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag) || []).slice(2).find((x) => x != null) || '';
    const rel = attr('rel').toLowerCase();
    if (!/icon/.test(rel) || /mask-icon/.test(rel)) continue;
    const href = attr('href');
    if (!href || /^data:/i.test(href)) continue;
    let url; try { url = new URL(href, base); } catch { continue; }
    if (url.protocol !== 'https:' || !cleanHost(url.hostname)) continue;
    const size = Math.max(0, ...(attr('sizes').match(/\d+/g) || []).map(Number));
    const svg = /\.svg(\?|$)/i.test(url.pathname) || /svg/i.test(attr('type'));
    // Bigger is better up to what a logo tile needs; a touch icon is a real square logo; SVG scales.
    const score = (/apple-touch/.test(rel) ? 300 : 0) + (svg ? 250 : 0) + Math.min(size || (/apple-touch/.test(rel) ? 180 : 16), 512);
    out.push({ url: url.href, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

const TYPES = /^image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|avif|bmp)/i;
async function image(url) {
  const res = await get(url, 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES.test(type)) { if (/\.ico(\?|$)/i.test(url)) type = 'image/x-icon'; else throw new Error('not an image'); }
  const buf = await limited(res, MAX_IMG);
  if (buf.length < 70) throw new Error('empty');
  return { type, data: Buffer.from(buf).toString('base64'), from: url };
}

export async function siteLogo(hostIn) {
  const host = cleanHost(hostIn);
  if (!host) throw Object.assign(new Error('Потрібна адреса сайту'), { status: 400 });
  let page = `https://${host}/`; let list = [];
  try {
    const res = await get(page, 'text/html,application/xhtml+xml');
    if (res.ok) {
      const end = new URL(res.url);
      if (end.protocol === 'https:' && cleanHost(end.hostname)) page = end.href;
      list = iconsOf(new TextDecoder().decode(await limited(res, MAX_HTML * 4)), page);
    }
  } catch { /* the page did not answer: try the usual places */ }
  const origin = new URL(page).origin;
  const tries = [...list.map((x) => x.url), `${origin}/apple-touch-icon.png`, `${origin}/favicon.ico`];
  for (const url of [...new Set(tries)].slice(0, 6)) {
    try { return await image(url); } catch { /* next */ }
  }
  throw Object.assign(new Error('На сайті не знайдено значка'), { status: 404 });
}
