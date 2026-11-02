// CONTEXT News — one issue a day, made at 17:00 Kyiv time, each section from its own open sources. Served by
// api/pulse.js (the Hobby plan allows 12 functions per deployment; files starting with «_» are not routes):
//
// GET /api/pulse?news=1              → { v, at, for, sections: [{ id, part, title, items }] } — open, no sign-in
//                                      (public news from open sources, for the standalone page news.html)
// GET /api/pulse?news=1&img=<url>    a thumbnail of the current issue, for PDF and Word (only pictures it holds)
// GET /api/pulse?news=1&status=1     how the last making went (no model asked)
// GET /api/pulse?news=1&imgcheck=<url> whether one of its pictures has words on it (the picture model's yes / no)
//
// There is no refresh: the issue stays as it is until the next 17:00. The first request after 17:00 — the daily
// cron (vercel.json) or the first reader — makes the next one; a lock keeps two requests from making it twice.
//
// Each item: { title, url, domain, at, image, summary, ai } — summary is a 2–3 sentence Ukrainian retelling by
// Cloudflare Workers AI from the item's own feed text (src/lib/news.js), or that text shortened when the model
// is not available. Section 1 is the day's key news, chosen by the model from the headlines of all the others.
import { json, db, env } from './_core.js';
import Anthropic from '@anthropic-ai/sdk';
import sample from '../src/news/sample.js';
import { SECTIONS, PER_SECTION, POOL, FRESH, offTopic, KEY_COUNT, parseNewsFeed, pickItems, pageImage, summaryPrompt, readSummaries, translatePrompt, readTranslations, outlets, host, keepPrompt, readKeep, keyPrompt, eventsPrompt, readEvents, sameEvents, dropRepeats, checkGroups, readPick, fitItems, issueTime, kyivDay, findReport, reportPrompt, composeReport, sharedWords, LEAD_IMAGE, ruPicture, nightReport, airTally } from '../src/lib/news.js';


const MIN = 60000;
const VERSION = 22; // 22: photos: only real photographs from the archive, text only when it covers the picture, Russian sites' own pictures kept; 21: a repeat is kept in the thinnest section; 5.2 judged by headline; 20: the editor scores 2 / 1 / 0, a short section takes the partly-on-topic ones; 19: a quiet day reaches back to 48 hours; 18: news of the last 24 hours only, no analysis; fewer false repeats; the key news picked after repeats; archive photos checked to fit the news, else the plain picture
const ACCOUNT = env.CF_ACCOUNT_ID || env.R2_ACCOUNT_ID || '';
const TOKEN = env.CF_AI_TOKEN || '';
const MODEL = env.CF_AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
// A small model that sees pictures: it tells a clean photo from one with words on it (about 256 tokens a picture).
// The first one this account may use is kept (not every account is let in to every model).
const VISIONS = env.CF_AI_VISION_MODEL ? [env.CF_AI_VISION_MODEL] : ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/google/gemma-3-12b-it'];
const UA = 'ReactionCore/1.0 (+https://reactioncore.uk/news; news digest)'; // who asks, with a page to find out more (Wikimedia's policy)

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

// The article's own paragraphs (the first few thousand characters) — for the numbers of an official report.
async function articleText(url) {
  try {
    const res = await get(url, 7000, 'text/html');
    const html = (await res.text()).slice(0, 600000).replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()).filter((t) => t.length > 40);
    return paras.join('\n').slice(0, 3500);
  } catch { return ''; }
}

// The model's free allowance is counted per day (it renews at 00:00 UTC). Once it is spent, nothing more is asked
// that day — every further call fails at once instead of costing a round trip; a passing fault (a 5xx, a timeout)
// is asked once more. A refusal of the request itself (400, 403) is not asked again.
// Cloudflare says the allowance renews at 00:00 UTC, but on 1 Nov it still answered «spent» at 00:21 UTC — so a
// spent answer holds for an hour, not for the rest of the day: the retries later in the night can still make it.
const SPENT_FOR = 60 * 60 * 1000;
let spentAt = 0;
export const aiSpent = () => Date.now() - spentAt < SPENT_FOR;
export const resetSpent = () => { spentAt = 0; }; // for the tests
export const SPENT = /neurons|daily free allocation|\b429\b/;
// The function may run 120 s; the making keeps to 105 s so that whatever was made is still saved. Every request to
// the model is cut at the time left, and nothing is asked once it is up.
let deadline = Infinity;
const left = () => deadline - Date.now();
export const setDeadline = (at) => { deadline = at; };
// Claude Haiku 5.5 stands in when Cloudflare cannot answer (its free allowance spent, a fault, a refused model):
// the same request, the same answer shape. Only on the server, with ANTHROPIC_API_KEY set in Vercel.
const CLAUDE = 'claude-haiku-5-5';
// The key's variable in Vercel: ANTHROPIC_API_KEY, or context_new (the name it was first saved under).
const claudeKey = () => env.ANTHROPIC_API_KEY || env.context_new || '';
const claudeOn = () => Boolean(claudeKey());
let claudeClient = null;
export const canAsk = () => (on() && !aiSpent()) || claudeRoom();
// Our requests are written chat-style ({ role: 'system' | 'user', content }); Claude takes the system text apart
// and a picture as an image block.
export function toClaude(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: Array.isArray(m.content) ? m.content.map((c) => {
      if (c.type !== 'image_url') return { type: 'text', text: c.text };
      const [, media, data] = /^data:([^;]+);base64,(.*)$/s.exec(c.image_url.url) || [];
      return media ? { type: 'image', source: { type: 'base64', media_type: media, data } } : { type: 'image', source: { type: 'url', url: c.image_url.url } };
    }) : m.content,
  }));
  return { system, messages: rest };
}
async function askClaude(messages, maxTokens) {
  if (left() < 4000) { timedOut = true; throw new Error('AI time up'); }
  claudeClient ||= new Anthropic({ apiKey: claudeKey(), maxRetries: 1 });
  const { system, messages: msgs } = toClaude(messages);
  try {
    const res = await claudeClient.messages.create({
      model: CLAUDE,
      max_tokens: maxTokens,
      // Short, fixed-format answers (JSON, yes/no): no thinking, low effort — cheaper and faster.
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      ...(system ? { system } : {}),
      messages: msgs,
    }, { timeout: Math.max(1000, Math.min(40000, left() - 2000)) });
    if (res.stop_reason === 'refusal') throw new Error('Claude refused');
    claudeUsed++;
    // Haiku 5.5: $0.10 per million tokens in, $0.50 out (prompts under 100K).
    claudeUSD += ((res.usage?.input_tokens || 0) * 0.10 + (res.usage?.output_tokens || 0) * 0.50) / 1e6;
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new Error(`Claude ${e.status ?? ''} ${String(e.message).slice(0, 80)}`);
    if (left() < 4000) timedOut = true;
    throw e;
  }
}
let claudeUsed = 0;
let claudeUSD = 0;
// Claude Haiku is the first choice; one issue may spend at most 3 cents on it — past that, and whenever Haiku
// cannot answer, Cloudflare's free model takes the request.
export const CLAUDE_CAP_USD = 0.03;
const claudeRoom = () => claudeOn() && claudeUSD < CLAUDE_CAP_USD;

async function ask(messages, maxTokens, model = MODEL, retry = 1) {
  if (claudeRoom()) {
    try { return await askClaude(messages, maxTokens); } catch (e) {
      if (/time up/.test(String(e?.message)) || !on()) throw e;
    }
  }
  return askCloudflare(messages, maxTokens, model, retry);
}
async function askCloudflare(messages, maxTokens, model = MODEL, retry = 1) {
  if (!on()) throw new Error('AI off');
  if (aiSpent()) throw new Error('AI 429 daily neurons spent');
  if (left() < 4000) { timedOut = true; throw new Error('AI time up'); }
  let res, data;
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0.1 }),
      signal: AbortSignal.timeout(Math.max(1000, Math.min(28000, left() - 2000))),
    });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    if (retry > 0 && left() > 20000) { await new Promise((r) => setTimeout(r, 1500)); return askCloudflare(messages, maxTokens, model, retry - 1); }
    if (left() < 4000) timedOut = true;
    throw new Error(`AI network ${String(e?.message || e).slice(0, 60)}`);
  }
  if (!res.ok) {
    const msg = `AI ${res.status} ${JSON.stringify(data.errors || '').slice(0, 100)}`;
    if (res.status === 429 || SPENT.test(msg)) { spentAt = Date.now(); throw new Error(msg); }
    if (res.status >= 500 && retry > 0 && left() > 20000) { await new Promise((r) => setTimeout(r, 1500)); return askCloudflare(messages, maxTokens, model, retry - 1); }
    throw new Error(msg);
  }
  spend(model, data.result?.usage, messages, data.result?.response);
  return data.result?.response;
}

// What this making has spent, by the models' own token counts (Cloudflare's neurons per million tokens, in / out).
// The free allowance is 10,000 a day; the optional picture check runs only while enough is left for it.
const RATES = { 'llama-3.3': [26668, 204805], 'llama-4-scout': [24545, 77273], 'mistral-small': [31876, 50488], 'gemma-3': [31371, 50560] };
let spent = 0;
let timedOut = false;
export const spentNeurons = () => Math.round(spent);
export const resetNeurons = () => { spent = 0; timedOut = false; claudeUsed = 0; claudeUSD = 0; sumErrs.length = 0; };
function spend(model, usage, messages, answer) {
  const [rin, rout] = Object.entries(RATES).find(([k]) => model.includes(k))?.[1] || RATES['llama-3.3'];
  const tin = usage?.prompt_tokens ?? JSON.stringify(messages).length / 3;
  const tout = usage?.completion_tokens ?? String(answer || '').length / 3;
  spent += (tin * rin + tout * rout) / 1e6;
}
const on = () => Boolean(ACCOUNT && TOKEN);
const any = () => on() || claudeOn(); // some model can be asked

// Every news gets its Ukrainian retelling: one request for the section, then the ones it left without a
// retelling (a reply cut short, a malformed list) asked again, three at a time. Why any stayed without one is noted.
const sumErrs = [];
async function summarize(items, tries = 2) {
  if (!any() || !items.length) return readSummaries('', items);
  let out;
  try { out = readSummaries(await ask(summaryPrompt(items), 4000), items); } catch (e) {
    sumErrs.push(String(e?.message || e).slice(0, 80));
    out = readSummaries('', items);
  }
  for (let round = 1; round < tries + 1; round++) {
    const missing = out.map((x, i) => (x.ai ? -1 : i)).filter((i) => i >= 0);
    if (!missing.length || left() < 30000 || !canAsk()) break;
    for (let a = 0; a < missing.length; a += 3) {
      const part = missing.slice(a, a + 3);
      try {
        const again = readSummaries(await ask(summaryPrompt(part.map((i) => items[i])), 2000), part.map((i) => items[i]));
        part.forEach((i, j) => { if (again[j].ai) out[i] = again[j]; });
      } catch (e) { sumErrs.push(String(e?.message || e).slice(0, 80)); }
    }
  }
  const left_ = out.filter((x) => !x.ai).length;
  if (left_) sumErrs.push(`${left_} of ${items.length} without a retelling`);
  return out;
}
async function translate(texts, tries = 2) {
  const none = { t: texts.map(() => ''), q: texts.map(() => '') };
  if (!any() || !texts.length) return none;
  try {
    const out = readTranslations(await ask(translatePrompt(texts), 2200), texts);
    if (tries > 1 && left() > 30000 && out.t.filter(Boolean).length < texts.length) return translate(texts, tries - 1); // missing ones: once more
    return out;
  } catch { return tries > 1 && left() > 30000 && canAsk() ? translate(texts, tries - 1) : none; }
}

// A news item with no picture of its own: a photo of its subject from Wikimedia Commons (an open,
// freely licensed archive), found by the short query the model gave with the English summary.
async function commonsImage(q) {
  if (!q) return '';
  try {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=5&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}&prop=imageinfo&iiprop=url|mime&iiurlwidth=640`;
    const j = await (await get(u, 6000, 'application/json')).json();
    const pages = Object.values(j?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    // Only a photo whose own name has a word of the search in it: Commons' search also turns up files that merely
    // mention a word in their description (a beach for «Zelensky Turkey generators»).
    const words = q.toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length >= 4);
    // Two words of the search in the name when it has two or more («China Forum», not any file with «China»).
    const need = Math.min(2, words.length);
    const named = (t) => { const n = String(t || '').toLowerCase().replace(/_/g, ' '); return words.filter((w) => n.includes(w.slice(0, Math.max(4, w.length - 2)))).length >= need; };
    // Photographs only: no maps, flags, emblems, logos, diagrams or satellite views (a black-and-sand map of
    // Western Sahara reads as a broken picture).
    const notPhoto = /\b(map|maps|locator|location|flag|coat of arms|emblem|logo|diagram|chart|graph|scheme|satellite|sat|topographic|relief|outline|blank|svg|icon|symbol|seal)\b|карта|прапор|герб/i;
    const hit = pages.find((p) => named(p.title) && !notPhoto.test(String(p.title).replace(/_/g, ' ')) && p.imageinfo?.[0] && /image\/jpeg/.test(p.imageinfo[0].mime || '') && p.imageinfo[0].thumburl);
    return hit?.imageinfo[0].thumburl || '';
  } catch { return ''; }
}

// Openverse: openly licensed photos from Flickr and other collections (many more than Commons alone), with the
// author and licence kept for the credit line. Photographs only, and a word of the search in the title.
async function openverseImage(q) {
  if (!q) return null;
  try {
    const u = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=8&category=photograph&mature=false`;
    const j = await (await get(u, 6000, 'application/json')).json();
    const words = q.toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length >= 4);
    const named = (t) => { const n = String(t || '').toLowerCase(); return words.some((w) => n.includes(w.slice(0, Math.max(4, w.length - 2)))); };
    const hit = (j?.results || []).find((r) => named(r.title) && !/\b(map|flag|logo|diagram|chart|poster|screenshot)\b/i.test(r.title || '') && (r.thumbnail || r.url));
    if (!hit) return null;
    return { url: hit.thumbnail || hit.url, credit: [hit.creator, hit.license && `CC ${String(hit.license).toUpperCase()}`, hit.source].filter(Boolean).join(' · ') };
  } catch { return null; }
}

const COMMON_CAPS = /^(The|This|That|These|According|After|Before|During|Ukraine’s|Russia’s|January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|President|Minister|Deputy|Office|Head|Leader|Supreme|Separate|Express|Federation|General|Staff|Defence|Forces|Ministry|Foreign|Republic)$/;
// A picture's bytes, only when it is one (and small enough to pass on).
async function fetchImage(u) {
  const res = await get(u, 8000, 'image/*');
  const type = res.headers.get('content-type') || '';
  const buf = await res.arrayBuffer();
  if (!/^image\//.test(type) || buf.byteLength > 4 * 1024 * 1024) throw new Error('not an image');
  return { type, buf };
}

// Whether a picture carries words: a headline card, a caption or slogan laid over it, a poster, a screenshot.
// true / false; null when it could not be told (no model, the picture unreadable) — such a picture stays.
// Only text that takes over the picture counts: a headline card, a quote laid across it, a poster, a screenshot.
// A small corner logo or watermark, a sign in the street, text on a uniform or a vehicle do not — a news photo
// keeps its place rather than giving way to a plain one.
export const TEXT_CHECK = 'Look at this picture. Is it mainly text or does large text cover a big part of it — a headline card, a quote or caption laid across the image, a poster, an infographic or a screenshot of text? A small logo or watermark in a corner, street signs, text on uniforms, vehicles or buildings do not count. Answer only yes or no.';
export let visionWhy = ''; // why the last check could not tell (for the imgcheck diagnosis)
// For an archive photo found by search, also whether it shows the news' own subject (not the Kremlin for a forum in China).
export const FIT_CHECK = (news) => `Look at this picture, meant to illustrate the news: «${String(news).slice(0, 300)}». Answer with two words. First: is it mainly text, or does large text cover a big part of it — a headline card, a quote laid across it, a poster, an infographic or a screenshot (a small corner logo or watermark, signs, text on uniforms or vehicles do not count)? yes or no. Second: is it a real photograph (not a map, flag, emblem, diagram or drawing) that plainly fits this news — its own place, country, people, organisation or kind of event, not another country's landmark or an unrelated person or scene? yes or no.`;
/** true: the picture is not to be used (words on it, or — with `news` given — not about that news). */
export async function hasText(url, deps = {}, news = '') {
  const run = deps.ask || ask;
  const spent = !deps.ask && !canAsk();
  if ((!deps.ask && !any()) || spent || !url || url.startsWith('/')) { visionWhy = spent ? 'spent' : 'off'; return null; }
  try {
    const { type, buf } = await (deps.fetchImage || fetchImage)(url);
    const data = `data:${type.split(';')[0]};base64,${Buffer.from(buf).toString('base64')}`;
    const msg = [{ role: 'user', content: [{ type: 'text', text: news ? FIT_CHECK(news) : TEXT_CHECK }, { type: 'image_url', image_url: { url: data } }] }];
    let r;
    for (;;) {
      try { r = await run(msg, news ? 8 : 4, VISIONS[0]); break; } catch (e) {
        // A model this account is not let in to, or one that takes no pictures: the next one, for good.
        if (VISIONS.length > 1 && /AI (403|400|404)/.test(String(e?.message))) { VISIONS.shift(); continue; }
        throw e;
      }
    }
    const a = String(r || '').trim().toLowerCase();
    visionWhy = `${VISIONS[0]}: ${a.slice(0, 40)}`;
    if (news) {
      const [t, f] = a.split(/[^a-zа-яії]+/).filter((w) => /^(yes|no|так|ні)$/.test(w));
      if (!t || !f) return null;
      return /^(yes|так)$/.test(t) || /^(no|ні)$/.test(f);
    }
    return /^(yes|так)/.test(a) ? true : /^(no|ні)/.test(a) ? false : null;
  } catch (e) {
    visionWhy = `${VISIONS[0]}: ${String(e?.message || e).slice(0, 200)}`;
    return null;
  }
}

// When nothing on the news' own subject is found, so that no news goes without a picture: not a general photo of a section's subject (the Kremlin under a forum in China misleads): the site's own plain
// picture, the CONTEXT nib on black, with no words on it.
export const PLAIN_IMAGE = '/news-img/plain.jpg';
// A Commons search for a news item: the names in its English summary (places, people, systems), else its title.
export function commonsQuery(x) {
  if (!x) return '';
  const words = (x.summary_en || '').match(/(?<![.!?]\s)(?<!^)\b[A-Z][\p{L}\d-]{2,}/gu) || [];
  const names = [...new Set(words.filter((w) => !COMMON_CAPS.test(w)))].slice(0, 3);
  return names.length >= 2 ? names.join(' ') : (x.title || '').split(/\s+/).slice(0, 6).join(' ');
}

// The first news of each section in turn — the key news when the model cannot choose.
function roundRobin(lists) {
  const out = [];
  for (let i = 0; i < POOL; i++) lists.forEach((l) => { if (i < l.length) out.push(l[i]); });
  return out;
}

export async function makeIssue(now = Date.now()) {
  const started = Date.now(); // the whole making must end within the function's 120 s
  resetNeurons();
  setDeadline(started + 105 * 1000);
  const own = SECTIONS.filter((s) => !s.key);
  const urls = [...new Set(own.flatMap((s) => s.feeds))];
  const got = new Map(await Promise.all(urls.map(async (u) => [u, await feed(u)])));

  // 1. Candidates: each section's freshest news from its own verified outlets only.
  const norm = (x) => x.url.split('?')[0];
  // A section with a word list (2.1, 3, 5.1, 5.2) reads only the headlines that have its words: TASS and RIA give
  // a hundred news a day, most of them not about the war.
  // A news «not about Ukraine» (5.2) is judged by its headline: a conflict story that mentions Russia in passing stays.
  const fits = (x, s) => (!s.match || s.match.test(`${x.title} ${x.text}`)) && (!s.skip || !s.skip.test(x.title));
  // The last 24 hours; a section that has too few of them (a weekend, a quiet day) reaches back to 48 hours.
  const cands = own.map((s) => {
    const all = s.feeds.flatMap((u) => (got.get(u) || []).map((x) => ({ ...x, outlet: host(u) }))).filter((x) => !offTopic(x) && fits(x, s));
    const take = (fresh) => pickItems(all, now, s.pool || POOL, s.pool ? (s.pool > 36 ? 12 : 8) : 4, fresh);
    const day = take(FRESH);
    return day.length >= 12 ? day : take(2 * FRESH);
  });
  // All candidates once (a feed two sections share gives the same news to both).
  const pool = [];
  const at = new Map();
  for (const x of cands.flat()) if (!at.has(norm(x))) { at.set(norm(x), pool.length); pool.push(x); }

  // 2. The editor, in small requests side by side: for each section, which of its candidates are plainly about
  //    its topic (yes or no); over all headlines together, the news telling the same event and the key news.
  const note = { sections: own.length, judged: 0, events: false };
  const [verdicts, events] = await Promise.all([
    Promise.all(own.map(async (s, k) => {
      if (!any() || !cands[k].length) return null;
      try { return readKeep(await ask(keepPrompt(s, cands[k]), 600), cands[k]); } catch (e) { note.err = String(e.message || e).slice(0, 120); return null; }
    })),
    (async () => {
      if (!any() || !pool.length) return null;
      try { return readEvents(await ask(eventsPrompt(pool), 1500), pool); } catch (e) { note.err = String(e.message || e).slice(0, 120); return null; }
    })(),
  ]);
  note.judged = verdicts.filter(Boolean).length;
  note.events = Boolean(events);
  // Each news to the first section (Chapter 3 first) that keeps it; without the editor's answer, the section's keyword rule.
  const sec = pool.map(() => null);
  const order = own.map((s, k) => k).sort((a, b) => Number(Boolean(own[b].first)) - Number(Boolean(own[a].first)));
  for (const k of order) {
    cands[k].forEach((x, i) => {
      const said = verdicts[k]?.[i];
      const keep = said === undefined ? fits(x, own[k]) : said === true;
      const p = at.get(norm(x));
      if (keep && !sec[p]) sec[p] = own[k].id;
    });
  }
  // A section the editor left short of news takes the ones it judged partly on its topic.
  for (const k of order) {
    cands[k].forEach((x, i) => {
      const p = at.get(norm(x));
      if (verdicts[k]?.[i] === 'maybe' && !sec[p] && sec.filter((v) => v === own[k].id).length < 8) sec[p] = own[k].id;
    });
  }
  // What the editor said per section: [clearly, partly, not] — to see why a page came out thin.
  note.said = Object.fromEntries(own.map((s, k) => [s.id, verdicts[k] ? [true, 'maybe', false].map((v) => verdicts[k].filter((x) => x === v).length) : cands[k].length ? 'none' : 'empty']));
  note.kept = Object.fromEntries(own.map((s) => [s.id, sec.filter((v) => v === s.id).length]));
  note.pool = pool.length;
  // One news per event — the editor's groups and the shared-words rule together.
  // The copy kept is the one in the section with fewest news (a news of no section is the last to be kept).
  const { drop, root: eventOf } = dropRepeats(pool, [...checkGroups(pool, events?.groups || []), ...sameEvents(pool)], (i) => (sec[i] ? note.kept[sec[i]] : 1e9));
  // The night's air-defence reports that open 2.1 (Russian claim) and 2.2 (Ukrainian Air Force) — never twice.
  // The morning capture keeps the day's reports (the feeds move on by 17:00); otherwise look in today's feeds.
  const kept = await captured(now);
  const reports = { ru: kept.ru || findReport([...got.values()].flat(), 'ru', now), ua: kept.ua || findReport([...got.values()].flat(), 'ua', now) };
  // What each feed gave and which headlines look like air-defence reports — to see why a report was not found.
  note.feeds = Object.fromEntries([...got].map(([u, l]) => [host(u) + new URL(u).pathname.slice(0, 24), l.length]));
  note.airHeads = [...got.values()].flat().filter((x) => /ППО|ПВО|протиповітрян|Повітрян\S* сил|беспилотн|БПЛА|БпЛА|drones?\b/i.test(x.title) && /\d{2,}/.test(x.title))
    .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10).map((x) => `${String(x.at).slice(5, 16)} ${x.domain}: ${x.title.slice(0, 110)}`);
  const isReport = (x) => Object.values(reports).some((r) => r && (norm(r) === norm(x) || sharedWords(r, x) >= 3));
  // Another outlet's item on the same night report repeats the lead of 2.1 / 2.2: out. The day's tallies stay.
  const nightAgain = (x) => nightReport(x, 'ru') || nightReport(x, 'ua');
  const live = pool.map((_, i) => i).filter((i) => sec[i] && !drop.has(i) && !isReport(pool[i]) && !((sec[i] === 'infospace' || sec[i] === 'media') && nightAgain(pool[i]) && !airTally(pool[i], true)));
  const bySec = Object.fromEntries(own.map((s) => [s.id, pickItems(live.filter((i) => sec[i] === s.id).map((i) => ({ ...pool[i], i })), now, POOL, 4, 2 * FRESH).map((x) => x.i)]));
  const SPARE = 3; // candidates beyond five, for the news whose summary comes out shorter than two sentences
  // The key news: the editor's ranking, at most one from a section, and never from a section left with fewer than
  // three — the key news must not empty the chapters they come from.
  // Only the editor's own choice of key news; the plain round of sections only when the editor gave none at all
  // (it filled the page with whatever came first — tank engines in Poland, a Gripen for Canada).
  // After the repeats are gone, the editor's own short pick of the key news from what is left — the first news of
  // each section — so that a chosen news is never lost as a repeat. Its earlier pick, then the plain round of
  // sections, only when this one gives nothing.
  const shortlist = roundRobin(own.map((s) => bySec[s.id].slice(0, 8)));
  let picked0 = [];
  if (any() && shortlist.length) {
    try { picked0 = readPick(await ask(keyPrompt(shortlist.map((i) => pool[i])), 120), shortlist, KEY_COUNT + 2).map((k) => shortlist[k]); } catch (e) { note.keyErr = String(e.message || e).slice(0, 120); }
  }
  note.keyPick = picked0.length;
  const editorKey = (events?.key || []).filter((i) => live.includes(i));
  const ranked = picked0.length ? [...picked0, ...editorKey.filter((i) => !picked0.includes(i))] : editorKey.length ? editorKey : roundRobin(own.map((s) => bySec[s.id]));
  // The key news are simply the editor's most resonant ones, from whichever sections they come.
  const key = ranked.slice(0, KEY_COUNT);
  // Where each section's news went (to see why a page came out thin).
  note.bySec = Object.fromEntries(own.map((s) => [s.id, bySec[s.id].length]));
  note.repeats = drop.size;
  const picked = SECTIONS.map((s) => (s.key ? key : bySec[s.id].filter((i) => !key.includes(i)).slice(0, PER_SECTION + SPARE)).map((i) => pool[i]));

  // 3. Pictures from the article pages and the Ukrainian summaries, side by side; then the news to keep:
  //    two or three sentences each (one-sentence ones only when nothing else is left), four or five a page.
  const lead = async (side) => {
    const r = reports[side];
    if (!r || !any()) return null;
    try {
      const [text, pic] = await Promise.all([r.article ? Promise.resolve(r.article) : articleText(r.url), withImage(r)]);
      const summary = composeReport(side, await ask(reportPrompt(side, `${r.title}\n${r.text || ''}\n${text}`), 300), r.at);
      return summary ? { ...pic, image: LEAD_IMAGE[side], summary, ai: true, n: 2, lead: side } : null;
    } catch { return null; }
  };
  const [pictured, uk, leadRu, leadUa] = await Promise.all([
    Promise.all(picked.map((l) => Promise.all(l.map(withImage)))),
    Promise.all(picked.map((l) => summarize(l))),
    lead('ru'),
    lead('ua'),
  ]);
  note.reports = { ru: reports.ru ? (leadRu ? 'used' : 'unread') : 'none', ua: reports.ua ? (leadUa ? 'used' : 'unread') : 'none' };
  const chosen = pictured.map((l, k) => {
    const rows = l.map((x, i) => ({ ...x, summary: uk[k][i].text, ai: uk[k][i].ai, n: uk[k][i].n }));
    const good = rows.filter((x) => x.n >= 2);
    const first = SECTIONS[k].id === 'infospace' ? leadRu : SECTIONS[k].id === 'media' ? leadUa : null;
    return fitItems([...(first ? [first] : []), ...good, ...rows.filter((x) => x.n === 1)].slice(0, PER_SECTION)); // n 0: not Ukrainian — left out
  });
  note.short = chosen.flat().filter((x) => x.n < 2).length;

  // 4. The English issue: the Ukrainian summaries translated; with them, the photo queries.
  const en = await Promise.all(chosen.map((l) => translate(l.map((x) => x.summary))));
  note.translated = en.flatMap((e) => e.t).filter(Boolean).length;

  // 5. Still no picture: first the photo another outlet ran with the same event today (fresh, and of this very
  //    event), then an open photo of the subject — Openverse (Flickr and other open collections, far more photos),
  //    then Wikimedia Commons. Each one found this way is checked to fit the news before it stays (step 6).
  const queries = (x, k, i) => {
    const words = commonsQuery({ ...x, summary_en: en[k].t[i] }).split(' ');
    return [...new Set([en[k].q[i], words.join(' '), words.slice(0, 2).join(' ')])].filter((q) => q && q.trim());
  };
  const everything = [...got.values()].flat();
  const sameEventPictures = (x) => {
    const p = at.get(norm(x));
    const out = [];
    if (p != null) pool.forEach((y, j) => { if (j !== p && eventOf(j) === eventOf(p) && y.image) out.push(y.image); });
    // Not grouped, but three telling words in common with a fresh headline elsewhere in today's feeds.
    for (const y of everything) {
      if (out.length >= 4) break;
      if (y.image && norm(y) !== norm(x) && y.at && now - Date.parse(y.at) < 2 * FRESH && sharedWords(x, y, { numbers: false }) >= 3) out.push(y.image);
    }
    return [...new Set(out)].filter((u) => u !== x.image);
  };
  async function* candidates(x, k, i) {
    for (const u of sameEventPictures(x)) yield { image: u, imageFrom: 'event' };
    for (const q of queries(x, k, i)) {
      const o = await openverseImage(q);
      if (o) yield { image: o.url, imageFrom: 'openverse', imageCredit: o.credit };
      const c = await commonsImage(q);
      if (c) yield { image: c, imageFrom: 'commons' };
    }
  }
  const found = await Promise.all(chosen.map((l, k) => Promise.all(l.map(async (x, i) => {
    // Its own picture — a Russian site's too: the page shows it through the site's own server (blocked in Ukraine
    // otherwise), and the check for words comes next.
    if (x.lead || x.image) return x;
    if (left() < 15000) return { ...x, image: '' }; // no time to look
    for await (const c of candidates(x, k, i)) return { ...x, ...c };
    return { ...x, image: '' };
  }))));

  // 6. Photos only, no words on them; and a photo not the news' own must show the news' own subject.
  //    One that fails gives way to the next candidate that passes; else the site's plain picture.
  //    The leads keep theirs. The check is the first to go: not when the allowance is spent, nor late in the making.
  note.textPics = 0;
  note.unfit = 0;
  const looks = canAsk() && left() > 35 * 1000 && (spent < 7000 || claudeOn());
  note.neurons = spentNeurons();
  note.picsChecked = looks;
  const withPhotos = await Promise.all(found.map((l, k) => Promise.all(l.map(async (x, i) => {
    if (!looks || x.lead || !x.image) return x;
    const news = en[k].t[i] || x.title;
    if ((await hasText(x.image, {}, x.imageFrom ? news : '')) !== true) return x;
    if (x.imageFrom) note.unfit++; else note.textPics++;
    let tries = 0;
    for await (const c of candidates(x, k, i)) {
      if (left() < 15000 || ++tries > 5) break;
      if (c.image !== x.image && (await hasText(c.image, {}, news)) !== true) return { ...x, imageCredit: undefined, ...c };
    }
    return { ...x, image: PLAIN_IMAGE, imageFrom: 'plain', imageCredit: undefined };
  }))));
  note.from = withPhotos.flat().reduce((m, x) => { const f = x.lead ? 'lead' : x.imageFrom || 'own'; m[f] = (m[f] || 0) + 1; return m; }, {});

  // Any news still without a picture: the site's plain picture — never a photo of something else.
  for (const l of withPhotos) for (const x of l) if (!x.image) { x.image = PLAIN_IMAGE; x.imageFrom = 'plain'; }
  note.plain = withPhotos.flat().filter((x) => x.image === PLAIN_IMAGE).length;
  note.noImage = withPhotos.flat().filter((x) => !x.image).length;

  const sections = SECTIONS.map((s, k) => ({
    id: s.id, part: s.part, title: s.title, en: s.en, sources: s.feeds.length,
    items: withPhotos[k].map((x, i) => ({
      title: x.title, url: x.url, domain: x.domain, at: x.at, image: x.image || null, ...(x.imageFrom && x.image ? { imageFrom: x.imageFrom } : {}), ...(x.imageCredit ? { imageCredit: x.imageCredit } : {}),
      summary: x.summary, summary_en: en[k].t[i] || x.summary, ai: x.ai, ...(x.lead ? { lead: x.lead } : {}),
    })),
  }));
  // Made without the model (its daily free allowance spent, or it did not answer at all): a stand-in, not the
  // day's issue — it is marked to be made again as soon as the model answers (the allowance renews at 00:00 UTC).
  // The same when the allowance ran out half-way: too few news retold in Ukrainian, or the English mostly missing —
  // the issue is made again after 00:00 UTC rather than kept as the day's (it never replaces a good one).
  const items = sections.flatMap((s) => s.items);
  if (!canAsk()) note.err = note.err || 'AI 429 daily neurons spent';
  note.claude = claudeUsed;
  if (sumErrs.length) note.sumErrs = [...new Set(sumErrs)].slice(0, 8);
  note.claudeCents = Math.round(claudeUSD * 10000) / 100;
  const thin = any() && (items.filter((x) => x.ai).length < 24 || note.translated < items.length / 2);
  if (timedOut) note.timedOut = true;
  const degraded = any() && ((!note.judged && !note.events) || ((!canAsk() || timedOut) && thin));
  setDeadline(Infinity);
  note.secs = Math.round((Date.now() - started) / 1000);
  note.neuronsAll = spentNeurons();
  return { v: VERSION, at: new Date(now).toISOString(), for: new Date(issueTime(now)).toISOString(), editor: note, ...(degraded ? { degraded: true } : {}), sections };
}

// ── Morning capture ─────────────────────────────────────────────────────────────────────────────────────
// The Air Force's report and the Russian defence ministry's claim come out each morning; by the 17:00 issue the
// busiest feeds have moved past them. Two morning crons (vercel.json) look for the day's reports and keep them
// with the article's own text — no model involved — so the 17:00 issue can quote them.
const dayKey = (now) => { const d = kyivDay(now); return `${d.year}-${d.month}-${d.day}`; };
async function captured(now) {
  const doc = await read('reports');
  // A kept one that is not the night's report (an earlier rule let a monthly tally through) is looked for again.
  if (doc?.day !== dayKey(now)) return {};
  return { ru: nightReport(doc.ru, 'ru') ? doc.ru : null, ua: nightReport(doc.ua, 'ua') ? doc.ua : null };
}
// The morning's reports go onto the page at once: the issue on show gets the night's figures in its 2.1 and 2.2 leads
// (two short model answers and one translation — a fraction of a cent), without waiting for the 17:00 issue.
async function refreshLeads(reports, now) {
  const issue = await read();
  if (!issue?.sections || !any()) return 0;
  setDeadline(Date.now() + 60 * 1000);
  const where = { ru: 'infospace', ua: 'media' };
  let changed = 0;
  for (const side of ['ru', 'ua']) {
    const r = reports[side];
    const sec = issue.sections.find((x) => x.id === where[side]);
    if (!r || !sec) continue;
    // Another item on the same night report would repeat the lead: out (the day's tallies stay).
    const before = sec.items.length;
    sec.items = sec.items.filter((x) => x.lead || !(nightReport(x, side) && !airTally(x, true)));
    if (sec.items.length !== before) changed++;
    const at = sec.items.findIndex((x) => x.lead === side);
    if (at >= 0 && sec.items[at].url === r.url) continue; // already the night's own report
    try {
      const summary = composeReport(side, await ask(reportPrompt(side, `${r.title}\n${r.text || ''}\n${r.article || ''}`), 300), r.at);
      if (!summary) continue;
      const en = await translate([summary]);
      const item = { title: r.title, url: r.url, domain: r.domain || host(r.url), at: r.at, image: LEAD_IMAGE[side], summary, summary_en: en.t[0] || summary, ai: true, lead: side };
      if (at >= 0) sec.items[at] = item; else sec.items.unshift(item);
      changed++;
    } catch { /* the lead stays as it was */ }
  }
  if (changed) await keep({ ...issue, leadsAt: new Date(now).toISOString() });
  return changed;
}

export async function captureReports(now = Date.now()) {
  const have = await captured(now);
  if (have.ru && have.ua) { await refreshLeads(have, now); return have; }
  const urls = [...new Set(SECTIONS.flatMap((s) => s.feeds))];
  const items = (await Promise.all(urls.map(feed))).flat();
  const out = { ...have };
  for (const side of ['ru', 'ua']) {
    if (out[side]) continue;
    const r = findReport(items, side, now);
    if (r) out[side] = { ...r, article: await articleText(r.url) };
  }
  if (out.ru || out.ua) {
    await keep({ day: dayKey(now), ru: out.ru || null, ua: out.ua || null }, 'reports');
    await refreshLeads(out, now);
  }
  return out;
}

// The next issue, made in the hour before its 17:00 (only then, only once): kept as «next» until it is due.
async function prepare(now) {
  const due = issueTime(now + 86400000); // the coming 17:00 Kyiv
  const ahead = due - now;
  if (ahead <= 0 || ahead > 2 * 3600 * 1000) return { prep: 'not-now', due: new Date(due).toISOString() };
  const have = await read('next');
  if (have?.v === VERSION && Date.parse(have.for) === due && have.sections?.length) return { prep: 'ready', due: have.for };
  const id = `make-prep-${due}-${Math.floor(now / (10 * MIN))}`;
  const mark = `${now}-${Math.random().toString(36).slice(2)}`;
  await db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { kind: 'news', id, doc: { id, mark, clearance: 0 } } }).catch(() => {});
  if ((await read(id))?.mark !== mark) return { prep: 'busy' };
  const issue = await makeIssue(now);
  if (issue.degraded || !issue.sections.some((s) => s.items.length)) return { prep: 'failed', degraded: Boolean(issue.degraded) }; // the 17:00 cron makes it then
  await keep({ ...issue, for: new Date(due).toISOString(), preparedAt: issue.at }, 'next');
  return { prep: 'made', due: new Date(due).toISOString() };
}

export async function newsGet(req) {
  try {
    const q = new URL(req.url).searchParams;
    if (q.has('capture')) {
      const r = await captureReports();
      return json(200, { day: dayKey(Date.now()), ru: r.ru ? r.ru.title : null, ua: r.ua ? r.ua.title : null });
    }
    const cached = await read();

    // How the last making went (no model asked): when, for which 17:00, whether it was cut short and why.
    if (q.has('status')) {
      const items = (cached?.sections || []).flatMap((s) => s.items);
      return json(200, { at: cached?.at || null, for: cached?.for || null, v: cached?.v ?? null, degraded: Boolean(cached?.degraded), items: items.length, ai: items.filter((x) => x.ai).length, editor: cached?.editor || null, spentNow: aiSpent(), claude: claudeOn() });
    }

    // A check of one of the issue's pictures for words on it (to see the picture model answer): yes / no / unknown.
    const check = q.get('imgcheck');
    if (check) {
      const known = [...(cached?.sections || []), ...sample.sections].some((s) => s.items.some((x) => x.image === check));
      if (!known) return json(404, { error: 'img', message: 'Немає такого зображення у випуску' });
      const text = await hasText(check);
      return json(200, { text, why: visionWhy });
    }

    // A thumbnail for the documents: only one the current issue holds — never an arbitrary address.
    const img = q.get('img');
    if (img) {
      const known = [...(cached?.sections || []), ...sample.sections].some((s) => s.items.some((x) => x.image === img)); // the issue's own, or the hand-made test issue's
      if (!known) return json(404, { error: 'img', message: 'Немає такого зображення у випуску' });
      const send = ({ type, buf }) => new Response(buf, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' } });
      try { return send(await fetchImage(img)); } catch { /* the source would not give it: an open picture instead */ }
      // When the source turns the picture away, a picture on the same subject from Wikimedia Commons stands in.
      const item = [...(cached?.sections || []), ...sample.sections].flatMap((s) => s.items).find((x) => x.image === img);
      try {
        // The names together first, then fewer of them: Commons finds only what matches every word.
        const words = commonsQuery(item).split(' ');
        for (const q of [...new Set([words.join(' '), words.slice(0, 2).join(' '), words[0]])].filter(Boolean)) {
          const alt = await commonsImage(q);
          if (alt) return send(await fetchImage(alt));
        }
      } catch { /* nothing open on the subject either */ }
      return json(502, { error: 'img', message: 'Джерело не віддало зображення' });
    }

    // Vercel's free plan fires a cron anywhere within its hour: «17:02» may come at 17:50. So the issue is made
    // ahead, in the hour before (prep), kept aside, and shown from 17:00 sharp — by the first reader after it.
    const now = Date.now();
    if (q.has('prep')) return json(200, await prepare(now));
    if (!(cached && Date.parse(cached.for) >= issueTime(now))) {
      const next = await read('next');
      if (next?.v === VERSION && next.sections?.length && Date.parse(next.for) === issueTime(now)) {
        await keep(next);
        return json(200, next);
      }
    }
    // The current issue holds until the next 17:00 Kyiv.
    const current = cached?.v === VERSION && cached.sections?.length && Date.parse(cached.for) >= issueTime(now);
    if (current) return json(200, cached);
    // While the day's issue is only a stand-in made without the model, the hand-made test issue of the same day
    // (real news, src/news/sample.js) is shown instead — never after its day has passed.
    const standIn = (doc) => (doc?.degraded && Date.parse(sample.for) === issueTime(now) ? { ...sample, standIn: true } : doc);

    // The model's allowance was found spent within the last hour: no point asking again so soon.
    const spent = !claudeOn() && cached?.degraded && SPENT.test(cached.editor?.err || '') && now - Date.parse(cached.at) < SPENT_FOR;
    if (spent) return json(200, standIn(cached));

    // Only one request makes it: the first to file the lock for this issue (and this ten minutes, so a failed
    // attempt is tried again); the others give what there is.
    if (!(await claim(now))) return json(200, cached?.sections?.length ? standIn({ ...cached, making: true }) : { making: true, sections: [] });

    const issue = await makeIssue(now);
    if (issue.degraded) {
      // Keep a good issue rather than replace it with one made without the model; either way try again later
      // (a stand-in counts as from the day before, so the next request after ten minutes makes it anew).
      const retry = { ...issue, for: new Date(issueTime(now) - 1).toISOString() };
      if (cached?.sections?.length && !cached.degraded && cached.v === VERSION) { await keep({ ...cached, for: retry.for }); return json(200, { ...cached, stale: true }); }
      if (issue.sections.some((s) => s.items.length)) await keep(retry);
      return json(200, standIn(retry));
    }
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
