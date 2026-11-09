// Visits to the public site (reactioncore.uk) — the workspace's «Відвідування»: views, visitors, countries, devices,
// browsers, pages and where people came from. No cookies, no IP address kept: the country comes from Vercel's
// x-vercel-ip-country at the time of the request; a visitor is counted with a one-way hash of the address, the
// browser and a secret that changes every day, so a person cannot be traced from one day to the next or back to an
// address. Bots and the browser's «Do Not Track» are not counted (the page does not send them).
//   POST /api/pulse?visit=1  { path, ref, lang }       (navigator.sendBeacon from src/site/chrome.js)
//   GET  /api/pulse?visits=30                           (an administrator of the workspace; the totals for N days)
import { createHash } from 'node:crypto';
import { db, SERVICE, env } from './_core.js';
import { clientIp } from '../src/lib/ip.js';

const BOT = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|pingdom|uptime|curl|wget|python|httpclient|go-http|java\//i;
const SALT = env.VISITS_SALT || SERVICE || 'reaction';

export function deviceOf(ua = '') {
  if (/iPad|Tablet|Nexus 7|Nexus 10|SM-T|Kindle|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'Планшет';
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return 'Телефон';
  return 'Комп’ютер';
}
export function browserOf(ua = '') {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua) || /CriOS/.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Інший';
}
export function osOf(ua = '') {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Інша';
}
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export async function recordVisit(req) {
  const ua = String(req.headers.get('user-agent') || '');
  if (!ua || BOT.test(ua)) return;
  const body = await req.json().catch(() => ({}));
  const path = String(body.path || '/').slice(0, 120).replace(/[?#].*$/, '') || '/';
  const ref = host(body.ref);
  const day = new Date().toISOString().slice(0, 10);
  const vid = createHash('sha256').update(`${SALT}|${day}|${clientIp(req) || ''}|${ua}`).digest('hex').slice(0, 16);
  const row = {
    day, path, vid,
    ref: ref && ref !== 'reactioncore.uk' ? ref : '',
    country: String(req.headers.get('x-vercel-ip-country') || '').slice(0, 2).toUpperCase(),
    device: deviceOf(ua), browser: browserOf(ua), os: osOf(ua),
    lang: String(body.lang || '').slice(0, 5),
  };
  await db('site_visits', { method: 'POST', body: row, prefer: 'return=minimal' });
}

const top = (rows, key, n = 12) => {
  const m = new Map();
  for (const r of rows) { const k = r[key] || '—'; const x = m.get(k) || { id: k, views: 0, v: new Set() }; x.views += 1; x.v.add(`${r.day}|${r.vid}`); m.set(k, x); }
  return [...m.values()].map((x) => ({ id: x.id, views: x.views, visitors: x.v.size })).sort((a, b) => b.visitors - a.visitors || b.views - a.views).slice(0, n);
};

/** The totals for the last `days` days (up to 365). */
export async function visitStats(days = 30) {
  const n = Math.max(1, Math.min(365, Math.round(days) || 30));
  const from = new Date(Date.now() - (n - 1) * 86400000).toISOString().slice(0, 10);
  const rows = [];
  for (let off = 0; off < 200000; off += 10000) {
    const page = (await db(`site_visits?day=gte.${from}&select=day,path,vid,ref,country,device,browser,os,lang&order=id.asc&limit=10000&offset=${off}`)) || [];
    rows.push(...page);
    if (page.length < 10000) break;
  }
  const byDay = new Map();
  for (let i = 0; i < n; i++) { const d = new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10); byDay.set(d, { day: d, views: 0, v: new Set() }); }
  for (const r of rows) { const x = byDay.get(r.day); if (x) { x.views += 1; x.v.add(r.vid); } }
  const visitors = new Set(rows.map((r) => `${r.day}|${r.vid}`)).size;
  return {
    from, days: n, views: rows.length, visitors,
    daily: [...byDay.values()].map((x) => ({ day: x.day, views: x.views, visitors: x.v.size })),
    countries: top(rows, 'country', 20), devices: top(rows, 'device'), browsers: top(rows, 'browser'), os: top(rows, 'os'),
    pages: top(rows, 'path', 15), refs: top(rows.filter((r) => r.ref), 'ref', 15), langs: top(rows, 'lang'),
  };
}
