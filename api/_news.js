// CONTEXT News — one issue a day, made at 17:00 Kyiv time, each section from its own open sources. Served by
// api/pulse.js (the Hobby plan allows 12 functions per deployment; files starting with «_» are not routes):
//
// GET /api/pulse?news=1              → { v, at, for, sections: [{ id, part, title, items }] } — open, no sign-in
//                                      (public news from open sources, for the standalone page news.html)
// GET /api/pulse?news=1&img=<url>    a thumbnail of the current issue, for PDF and Word (only pictures it holds)
//
// There is no refresh: the issue stays as it is until the next 17:00. The first request after 17:00 — the daily
// cron (vercel.json) or the first reader — makes the next one; a lock keeps two requests from making it twice.
//
// Each item: { title, url, domain, at, image, summary, ai } — summary is a 2–3 sentence Ukrainian retelling by
// Cloudflare Workers AI from the item's own feed text (src/lib/news.js), or that text shortened when the model
// is not available. Section 1 is the day's key news, chosen by the model from the headlines of all the others.
import { json, db, env } from './_core.js';
import { SECTIONS, PER_SECTION, KEY_COUNT, parseNewsFeed, pickItems, pageImage, summaryPrompt, readSummaries, keyPrompt, readPick, fitItems, issueTime } from '../src/lib/news.js';


const MIN = 60000;
const VERSION = 2;
const ACCOUNT = env.CF_ACCOUNT_ID || env.R2_ACCOUNT_ID || '';
const TOKEN = env.CF_AI_TOKEN || '';
const MODEL = env.CF_AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const UA = 'ReactionCore/1.0 (+news digest)';

const read = async (id = 'issue') => (await db(`core_docs?kind=eq.news&id=eq.${id}&select=doc`).catch(() => []))[0]?.doc || null;
const keep = (doc, id = 'issue') => db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { kind: 'news', id, doc: { ...doc, id, clearance: 0 } } }).catch(() => {});

// Insert-if-absent, then read back: the request whose mark is in the row made the claim.
async function claim(now) {
  const id = `make-${issueTime(now)}-${Math.floor(now / (10 * MIN))}`;
  const mark = `${now}-${Math.random().toString(36).slice(2)}`;
  try {
    await db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { kind: 'news', id, doc: { id, mark, clearance: 0 } } });
    return (await read(id))?.mark === mark;
  } catch { return true; } // without the lock store, making it beats giving nothing
}

async function get(url, ms = 8000, accept = 'application/rss+xml, application/xml, text/xml, text/html') {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res;
}
const feed = async (url) => { try { return parseNewsFeed(await (await get(url)).text()); } catch { return []; } };

// An item without a picture in its feed: the article page's own preview picture (og:image).
async function withImage(x) {
  if (x.image) return x;
  try {
    const res = await get(x.url, 6000, 'text/html');
    const reader = res.body.getReader();
    let html = '';
    while (html.length < 250000) { const { done, value } = await reader.read(); if (done) break; html += new TextDecoder().decode(value); if (/<\/head>/i.test(html)) break; }
    reader.cancel().catch(() => {});
    return { ...x, image: pageImage(html) };
  } catch { return x; }
}

async function ask(messages, maxTokens) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0.1 }),
    signal: AbortSignal.timeout(28000),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? data.result?.response : '';
}
const on = () => Boolean(ACCOUNT && TOKEN);

async function summarize(items) {
  if (!on() || !items.length) return readSummaries('', items);
  try { return readSummaries(await ask(summaryPrompt(items), 1600), items); } catch { return readSummaries('', items); }
}

// The first news of each section in turn — the key news when the model cannot choose.
function roundRobin(lists) {
  const out = [];
  let base = 0;
  const starts = lists.map((l) => { const s = base; base += l.length; return s; });
  for (let i = 0; i < PER_SECTION; i++) lists.forEach((l, k) => { if (i < l.length) out.push(starts[k] + i); });
  return out;
}

export async function makeIssue(now = Date.now()) {
  const own = SECTIONS.filter((s) => !s.key);
  const urls = [...new Set(own.flatMap((s) => s.feeds))];
  const got = new Map(await Promise.all(urls.map(async (u) => [u, await feed(u)])));
  const used = new Set();
  const lists = own.map((s) => {
    const all = s.feeds.flatMap((u) => got.get(u) || [])
      .filter((x) => !used.has(x.url.split('?')[0]))
      .filter((x) => (!s.match || s.match.test(`${x.title} ${x.text}`)) && (!s.skip || !s.skip.test(`${x.title} ${x.text}`)));
    const items = pickItems(all, now, PER_SECTION);
    items.forEach((x) => used.add(x.url.split('?')[0]));
    return items;
  });
  const flat = lists.flat();
  const [pictured, pick] = await Promise.all([
    Promise.all(lists.map((l) => Promise.all(l.map(withImage)))),
    (async () => {
      const fallback = roundRobin(lists);
      if (!on() || !flat.length) return readPick('', flat, KEY_COUNT, fallback);
      try { return readPick(await ask(keyPrompt(flat), 120), flat, KEY_COUNT, fallback); } catch { return readPick('', flat, KEY_COUNT, fallback); }
    })(),
  ]);
  const sums = await Promise.all(pictured.map(summarize));
  const done = pictured.map((l, k) => l.map((x, i) => ({ title: x.title, url: x.url, domain: x.domain, at: x.at, image: x.image || null, summary: sums[k][i].text, ai: sums[k][i].ai })));
  const all = done.flat();
  const keyUrls = new Set(pick.map((i) => all[i].url));
  const sections = SECTIONS.map((s) => {
    const items = s.key ? pick.map((i) => all[i]) : done[own.indexOf(s)].filter((x) => !keyUrls.has(x.url));
    return { id: s.id, part: s.part, title: s.title, sources: s.feeds.length, items: fitItems(items) };
  });
  return { v: VERSION, at: new Date(now).toISOString(), for: new Date(issueTime(now)).toISOString(), sections };
}

export async function newsGet(req) {
  try {
    const q = new URL(req.url).searchParams;
    const cached = await read();

    // A thumbnail for the documents: only one the current issue holds — never an arbitrary address.
    const img = q.get('img');
    if (img) {
      const known = (cached?.sections || []).some((s) => s.items.some((x) => x.image === img));
      if (!known) return json(404, { error: 'img', message: 'Немає такого зображення у випуску' });
      try {
        const res = await get(img, 8000, 'image/*');
        const type = res.headers.get('content-type') || '';
        const buf = await res.arrayBuffer();
        if (!/^image\//.test(type) || buf.byteLength > 5 * 1024 * 1024) return json(415, { error: 'img', message: 'Не зображення' });
        return new Response(buf, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' } });
      } catch { return json(502, { error: 'img', message: 'Джерело не віддало зображення' }); }
    }

    // The current issue holds until the next 17:00 Kyiv.
    const now = Date.now();
    const current = cached?.v === VERSION && cached.sections?.length && Date.parse(cached.for) >= issueTime(now);
    if (current) return json(200, cached);

    // Only one request makes it: the first to file the lock for this issue (and this ten minutes, so a failed
    // attempt is tried again); the others give what there is.
    if (!(await claim(now))) return json(200, cached?.sections?.length ? { ...cached, making: true } : { making: true, sections: [] });

    const issue = await makeIssue(now);
    if (issue.sections.some((s) => s.items.length)) {
      await keep(issue);
      await db('core_docs?kind=eq.news&id=like.make-*', { method: 'DELETE' }).catch(() => {});
      return json(200, issue);
    }
    return json(200, cached?.sections?.length ? { ...cached, stale: true } : issue);
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
