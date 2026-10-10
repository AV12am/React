// The logo a company shows on its own website: apple-touch-icon, the largest icon, an SVG icon, og:logo,
// then /favicon.ico. Pure parsing here; fetching is api/logo.js.

const attr = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(2).find((x) => x != null) ?? '';
const size = (s) => Math.max(0, ...String(s || '').split(/\s+/).map((x) => (x.toLowerCase() === 'any' ? 512 : parseInt(x, 10) || 0)));

/** Candidate logo URLs from a home page, best first. */
export function logoCandidates(html, base) {
  const out = [];
  const add = (href, score) => { if (!href) return; try { out.push({ url: new URL(href.trim(), base).href, score }); } catch { /* bad url */ } };
  for (const m of String(html).matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = attr(tag, 'rel').toLowerCase();
    const href = attr(tag, 'href');
    const type = attr(tag, 'type').toLowerCase();
    if (/apple-touch-icon/.test(rel)) add(href, 900 + Math.min(99, size(attr(tag, 'sizes')) / 10));
    else if (/\bicon\b/.test(rel)) add(href, (type.includes('svg') || /\.svg(\?|$)/i.test(href) ? 800 : 0) + Math.min(700, size(attr(tag, 'sizes'))));
  }
  for (const m of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const prop = (attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop')).toLowerCase();
    if (prop === 'og:logo' || prop === 'logo') add(attr(tag, 'content'), 850);
  }
  add('/apple-touch-icon.png', 300);
  add('/favicon.ico', 100);
  const seen = new Set();
  return out.sort((a, b) => b.score - a.score).filter((c) => (seen.has(c.url) ? false : seen.add(c.url))).map((c) => c.url);
}

/** Private, loopback and link-local addresses a server must not be made to fetch. */
export function isPrivateAddress(ip) {
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(ip)) return true;
  const m = /^172\.(\d+)\./.exec(ip); if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true; // carrier-grade NAT
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:127.') || v6.startsWith('::ffff:10.') || v6.startsWith('::ffff:192.168.');
}
