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
import sample from '../src/news/sample.js';
import { SECTIONS, PER_SECTION, POOL, offTopic, KEY_COUNT, parseNewsFeed, pickItems, pageImage, summaryPrompt, readSummaries, translatePrompt, readTranslations, outlets, host, keepPrompt, readKeep, eventsPrompt, readEvents, sameEvents, dropRepeats, checkGroups, readPick, fitItems, issueTime, kyivDay, findReport, reportPrompt, composeReport, sharedWords } from '../src/lib/news.js';


const MIN = 60000;
const VERSION = 13;
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

// The article's own paragraphs (the first few thousand characters) — for the numbers of an official report.
async function articleText(url) {
  try {
    const res = await get(url, 7000, 'text/html');
    const html = (await res.text()).slice(0, 600000).replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()).filter((t) => t.length > 40);
    return paras.join('\n').slice(0, 3500);
  } catch { return ''; }
}

async function ask(messages, maxTokens) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0.1 }),
    signal: AbortSignal.timeout(28000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`AI ${res.status} ${JSON.stringify(data.errors || '').slice(0, 100)}`);
  return data.result?.response;
}
const on = () => Boolean(ACCOUNT && TOKEN);

async function summarize(items, tries = 2) {
  if (!on() || !items.length) return readSummaries('', items);
  try {
    const out = readSummaries(await ask(summaryPrompt(items), 2600), items);
    if (tries > 1 && out.filter((x) => x.ai).length < items.length / 2) return summarize(items, tries - 1); // the model fell short: once more
    return out;
  } catch { return tries > 1 ? summarize(items, tries - 1) : readSummaries('', items); }
}
async function translate(texts, tries = 2) {
  const none = { t: texts.map(() => ''), q: texts.map(() => '') };
  if (!on() || !texts.length) return none;
  try {
    const out = readTranslations(await ask(translatePrompt(texts), 2200), texts);
    if (tries > 1 && out.t.filter(Boolean).length < texts.length) return translate(texts, tries - 1); // missing ones: once more
    return out;
  } catch { return tries > 1 ? translate(texts, tries - 1) : none; }
}

// A news item with no picture of its own: a photo of its subject from Wikimedia Commons (an open,
// freely licensed archive), found by the short query the model gave with the English summary.
async function commonsImage(q) {
  if (!q) return '';
  try {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=5&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}&prop=imageinfo&iiprop=url|mime&iiurlwidth=640`;
    const j = await (await get(u, 6000, 'application/json')).json();
    const pages = Object.values(j?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    const hit = pages.map((p) => p.imageinfo?.[0]).find((i) => i && /image\/(jpeg|png|webp)/.test(i.mime || '') && i.thumburl);
    return hit?.thumburl || '';
  } catch { return ''; }
}

// The first news of each section in turn — the key news when the model cannot choose.
function roundRobin(lists) {
  const out = [];
  for (let i = 0; i < POOL; i++) lists.forEach((l) => { if (i < l.length) out.push(l[i]); });
  return out;
}

export async function makeIssue(now = Date.now()) {
  const own = SECTIONS.filter((s) => !s.key);
  const urls = [...new Set(own.flatMap((s) => s.feeds))];
  const got = new Map(await Promise.all(urls.map(async (u) => [u, await feed(u)])));

  // 1. Candidates: each section's freshest news from its own verified outlets only.
  const norm = (x) => x.url.split('?')[0];
  const cands = own.map((s) => pickItems(
    s.feeds.flatMap((u) => (got.get(u) || []).map((x) => ({ ...x, outlet: host(u) }))).filter((x) => !offTopic(x)),
    now, POOL,
  ));
  // All candidates once (a feed two sections share gives the same news to both).
  const pool = [];
  const at = new Map();
  for (const x of cands.flat()) if (!at.has(norm(x))) { at.set(norm(x), pool.length); pool.push(x); }

  // 2. The editor, in small requests side by side: for each section, which of its candidates are plainly about
  //    its topic (yes or no); over all headlines together, the news telling the same event and the key news.
  const note = { sections: own.length, judged: 0, events: false };
  const [verdicts, events] = await Promise.all([
    Promise.all(own.map(async (s, k) => {
      if (!on() || !cands[k].length) return null;
      try { return readKeep(await ask(keepPrompt(s, cands[k]), 300), cands[k]); } catch (e) { note.err = String(e.message || e).slice(0, 120); return null; }
    })),
    (async () => {
      if (!on() || !pool.length) return null;
      try { return readEvents(await ask(eventsPrompt(pool), 500), pool); } catch (e) { note.err = String(e.message || e).slice(0, 120); return null; }
    })(),
  ]);
  note.judged = verdicts.filter(Boolean).length;
  note.events = Boolean(events);
  const fits = (x, s) => (!s.match || s.match.test(`${x.title} ${x.text}`)) && (!s.skip || !s.skip.test(`${x.title} ${x.text}`));
  // Each news to the first section (Chapter 3 first) that keeps it; without the editor's answer, the section's keyword rule.
  const sec = pool.map(() => null);
  const order = own.map((s, k) => k).sort((a, b) => Number(Boolean(own[b].first)) - Number(Boolean(own[a].first)));
  for (const k of order) {
    cands[k].forEach((x, i) => {
      const said = verdicts[k]?.[i];
      const keep = said === undefined ? fits(x, own[k]) : said;
      const p = at.get(norm(x));
      if (keep && !sec[p]) sec[p] = own[k].id;
    });
  }
  note.kept = Object.fromEntries(own.map((s) => [s.id, sec.filter((v) => v === s.id).length]));
  note.pool = pool.length;
  // One news per event — the editor's groups and the shared-words rule together.
  const { drop } = dropRepeats(pool, [...checkGroups(pool, events?.groups || []), ...sameEvents(pool)]);
  // The night's air-defence reports that open 2.1 (Russian claim) and 2.2 (Ukrainian Air Force) — never twice.
  // The morning capture keeps the day's reports (the feeds move on by 17:00); otherwise look in today's feeds.
  const kept = await captured(now);
  const reports = { ru: kept.ru || findReport([...got.values()].flat(), 'ru', now), ua: kept.ua || findReport([...got.values()].flat(), 'ua', now) };
  // What each feed gave and which headlines look like air-defence reports — to see why a report was not found.
  note.feeds = Object.fromEntries([...got].map(([u, l]) => [host(u) + new URL(u).pathname.slice(0, 24), l.length]));
  note.airHeads = [...got.values()].flat().filter((x) => /ППО|ПВО|протиповітрян|Повітрян\S* сил|беспилотн|БПЛА|БпЛА|drones?\b/i.test(x.title) && /\d{2,}/.test(x.title))
    .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10).map((x) => `${String(x.at).slice(5, 16)} ${x.domain}: ${x.title.slice(0, 110)}`);
  const isReport = (x) => Object.values(reports).some((r) => r && (norm(r) === norm(x) || sharedWords(r, x) >= 3));
  const live = pool.map((_, i) => i).filter((i) => sec[i] && !drop.has(i) && !isReport(pool[i]));
  const bySec = Object.fromEntries(own.map((s) => [s.id, pickItems(live.filter((i) => sec[i] === s.id).map((i) => ({ ...pool[i], i })), now, POOL).map((x) => x.i)]));
  const SPARE = 2; // candidates beyond five, for the news whose summary comes out shorter than two sentences
  // The key news: the editor's ranking, at most one from a section, and never from a section left with fewer than
  // three — the key news must not empty the chapters they come from.
  const ranked = readPick(JSON.stringify({ pick: (events?.key || []).filter((i) => live.includes(i)).map((i) => i + 1) }), pool, live.length, roundRobin(own.map((s) => bySec[s.id])));
  const key = [];
  const took = new Set();
  for (const i of ranked) {
    if (key.length >= KEY_COUNT + SPARE) break;
    if (took.has(sec[i]) || bySec[sec[i]].length < 4) continue;
    key.push(i); took.add(sec[i]);
  }
  const picked = SECTIONS.map((s) => (s.key ? key : bySec[s.id].filter((i) => !key.includes(i)).slice(0, PER_SECTION + SPARE)).map((i) => pool[i]));

  // 3. Pictures from the article pages and the Ukrainian summaries, side by side; then the news to keep:
  //    two or three sentences each (one-sentence ones only when nothing else is left), four or five a page.
  const lead = async (side) => {
    const r = reports[side];
    if (!r || !on()) return null;
    try {
      const [text, pic] = await Promise.all([r.article ? Promise.resolve(r.article) : articleText(r.url), withImage(r)]);
      const summary = composeReport(side, await ask(reportPrompt(side, `${r.title}\n${r.text || ''}\n${text}`), 300), r.at);
      return summary ? { ...pic, summary, ai: true, n: 2, lead: side } : null;
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

  // 5. Still no picture: a photo of the subject from the open archive.
  const withPhotos = await Promise.all(chosen.map((l, k) => Promise.all(l.map(async (x, i) => (x.image ? x : { ...x, image: await commonsImage(en[k].q[i]), imageFrom: 'commons' })))));

  const sections = SECTIONS.map((s, k) => ({
    id: s.id, part: s.part, title: s.title, en: s.en, sources: s.feeds.length,
    items: withPhotos[k].map((x, i) => ({
      title: x.title, url: x.url, domain: x.domain, at: x.at, image: x.image || null, ...(x.imageFrom && x.image ? { imageFrom: x.imageFrom } : {}),
      summary: x.summary, summary_en: en[k].t[i] || x.summary, ai: x.ai, ...(x.lead ? { lead: x.lead } : {}),
    })),
  }));
  // Made without the model (its daily free allowance spent, or it did not answer at all): a stand-in, not the
  // day's issue — it is marked to be made again as soon as the model answers (the allowance renews at 00:00 UTC).
  const degraded = on() && !note.judged && !note.events;
  return { v: VERSION, at: new Date(now).toISOString(), for: new Date(issueTime(now)).toISOString(), editor: note, ...(degraded ? { degraded: true } : {}), sections };
}

// ── Morning capture ─────────────────────────────────────────────────────────────────────────────────────
// The Air Force's report and the Russian defence ministry's claim come out each morning; by the 17:00 issue the
// busiest feeds have moved past them. Two morning crons (vercel.json) look for the day's reports and keep them
// with the article's own text — no model involved — so the 17:00 issue can quote them.
const dayKey = (now) => { const d = kyivDay(now); return `${d.year}-${d.month}-${d.day}`; };
async function captured(now) {
  const doc = await read('reports');
  return doc?.day === dayKey(now) ? { ru: doc.ru || null, ua: doc.ua || null } : {};
}
export async function captureReports(now = Date.now()) {
  const have = await captured(now);
  if (have.ru && have.ua) return have;
  const urls = [...new Set(SECTIONS.flatMap((s) => s.feeds))];
  const items = (await Promise.all(urls.map(feed))).flat();
  const out = { ...have };
  for (const side of ['ru', 'ua']) {
    if (out[side]) continue;
    const r = findReport(items, side, now);
    if (r) out[side] = { ...r, article: await articleText(r.url) };
  }
  if (out.ru || out.ua) await keep({ day: dayKey(now), ru: out.ru || null, ua: out.ua || null }, 'reports');
  return out;
}

export async function newsGet(req) {
  try {
    const q = new URL(req.url).searchParams;
    if (q.has('capture')) {
      const r = await captureReports();
      return json(200, { day: dayKey(Date.now()), ru: r.ru ? r.ru.title : null, ua: r.ua ? r.ua.title : null });
    }
    const cached = await read();

    // A thumbnail for the documents: only one the current issue holds — never an arbitrary address.
    const img = q.get('img');
    if (img) {
      const known = [...(cached?.sections || []), ...sample.sections].some((s) => s.items.some((x) => x.image === img)); // the issue's own, or the hand-made test issue's
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
    // While the day's issue is only a stand-in made without the model, the hand-made test issue of the same day
    // (real news, src/news/sample.js) is shown instead — never after its day has passed.
    const standIn = (doc) => (doc?.degraded && Date.parse(sample.for) === issueTime(now) ? { ...sample, standIn: true } : doc);

    // The model's daily allowance is spent (it renews at 00:00 UTC): no point making the issue again before then.
    const spent = cached?.degraded && /neurons|429/.test(cached.editor?.err || '') && String(cached.at).slice(0, 10) === new Date(now).toISOString().slice(0, 10);
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
