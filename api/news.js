// Vercel Function: CONTEXT News — an issue of short news, each section from its own open sources.
//
// GET /api/news              Authorization: Bearer <token>  → { at, sections: [{ id, title, items: [...] }] }
// GET /api/news?refresh=1    the same, made anew (at most once every 5 minutes)
// GET /api/news?img=<url>    a thumbnail of the current issue, for PDF and Word (only pictures the issue holds)
//
// Each item: { title, url, domain, at, image, summary, ai } — summary is a 2–3 sentence Ukrainian retelling by
// Cloudflare Workers AI from the item's own feed text (src/lib/news.js), or that text shortened when the model
// is not available. The issue is kept an hour (core_docs kind 'news'), so the free model is asked rarely.
import { json, db, caller, env } from './_core.js';
import { SECTIONS, parseNewsFeed, pickItems, pageImage, summaryPrompt, readSummaries } from '../src/lib/news.js';

export const config = { maxDuration: 60 };

const MIN = 60000;
const HOUR = 60 * MIN;
const ACCOUNT = env.CF_ACCOUNT_ID || env.R2_ACCOUNT_ID || '';
const TOKEN = env.CF_AI_TOKEN || '';
const MODEL = env.CF_AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const UA = 'ReactionCore/1.0 (+news digest)';

const read = async () => (await db('core_docs?kind=eq.news&id=eq.issue&select=doc').catch(() => []))[0]?.doc || null;
const keep = (doc) => db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { kind: 'news', id: 'issue', doc: { ...doc, id: 'issue', clearance: 0 } } }).catch(() => {});

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

async function summarize(items) {
  if (!ACCOUNT || !TOKEN || !items.length) return readSummaries('', items);
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: summaryPrompt(items), max_tokens: 900, temperature: 0.1 }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await res.json().catch(() => ({}));
    return readSummaries(res.ok ? data.result?.response : '', items);
  } catch { return readSummaries('', items); }
}

export async function makeIssue(now = Date.now()) {
  const sections = await Promise.all(SECTIONS.map(async (s) => {
    const items = pickItems((await Promise.all(s.feeds.map(feed))).flat(), now);
    const pictured = await Promise.all(items.map(withImage));
    const sums = await summarize(pictured);
    return {
      id: s.id, title: s.title, sources: s.feeds.length,
      items: pictured.map((x, i) => ({ title: x.title, url: x.url, domain: x.domain, at: x.at, image: x.image || null, summary: sums[i].text, ai: sums[i].ai })),
    };
  }));
  return { at: new Date(now).toISOString(), sections };
}

export async function GET(req) {
  try {
    const m = await caller(req);
    if (!m) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
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

    const age = cached?.at ? Date.now() - Date.parse(cached.at) : Infinity;
    const want = q.get('refresh') === '1' ? 5 * MIN : HOUR;
    if (cached?.sections?.length && age < want) return json(200, cached);
    const issue = await makeIssue();
    if (issue.sections.some((s) => s.items.length)) { await keep(issue); return json(200, issue); }
    return json(200, cached?.sections?.length ? { ...cached, stale: true } : issue);
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
