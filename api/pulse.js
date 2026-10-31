// Vercel Function: the world anxiety index (src/lib/pulse.js).
//
// Three sources, so the index never hangs on one service:
//   · the Geopolitical Risk Index (Caldara & Iacoviello, Federal Reserve) — daily, from 1985, free, updated
//     every Monday: read here at most once a day (id 'gpr') and shown first;
//   · the platform's own measurement — open RSS of world newsrooms, read here, the share of items about war,
//     conflict, attacks, crises and sanctions kept per day in core_docs (kind 'pulse', id 'feeds');
//   · GDELT (open data, three months of history at once) — asked one question at a time and at most every
//     ten minutes, because it limits requests per address and Vercel's addresses are shared with many sites;
//     what it answers is kept (id 'gdelt') and used while fresh.
// The result for the screen is kept for the hour (id 'world'), one refresh for the whole team.
//
// GET /api/pulse   Authorization: Bearer <Supabase access token>  → { at, index, headlines, source, provisional }
import { newsGet } from './_news.js';
import { json, db, caller } from './_core.js';
import * as XLSX from 'xlsx';
import { timeline, anxiety, QUERY, FEEDS, parseFeed, crisisShare, ownIndex, cleanHeadlines, sharesByDay, GPR_URL, parseGpr, gprIndex, ANALYSIS_FEEDS, pickHeadlines } from '../src/lib/pulse.js';

export const config = { maxDuration: 60 };

const MIN = 60000;
const HOUR = 60 * MIN;
const GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const STEPS = [
  ['tone', { mode: 'timelinetone', timespan: '3months', TIMELINESMOOTH: '3' }],
  ['vol', { mode: 'timelinevol', timespan: '3months', TIMELINESMOOTH: '3' }],
  ['arts', { mode: 'artlist', timespan: '24h', maxrecords: '8', sort: 'hybridrel' }],
];

const read = async (id) => (await db(`core_docs?kind=eq.pulse&id=eq.${id}&select=doc`).catch(() => []))[0]?.doc || null;
const keep = (id, doc) => db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { kind: 'pulse', id, doc: { ...doc, id, clearance: 0 } } }).catch(() => {});

const readFeed = async (url) => {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'ReactionCore/1.0 (+news tone index)', Accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(8000) });
    return res.ok ? parseFeed(await res.text(), new URL(url).hostname.replace(/^(www|feeds|rss|news)\./, '')) : [];
  } catch { return []; }
};

// The newsrooms make the measurement; the analysis feeds only add headlines.
async function measureFeeds(now) {
  const [news, analysis] = await Promise.all([Promise.all(FEEDS.map(readFeed)), Promise.all(ANALYSIS_FEEDS.map(readFeed))]);
  return { ...crisisShare(news.flat(), now), analysis: analysis.flat() };
}

/** One GDELT question, if it is time to ask: the next missing (or stale) step. */
async function stepGdelt(g, now) {
  if (g.nextTry && now < Date.parse(g.nextTry)) return g;
  const fresh = (k) => g[k]?.at && now - Date.parse(g[k].at) < 6 * HOUR;
  const step = STEPS.find(([k]) => !fresh(k));
  if (!step) return g;
  const [key, params] = step;
  try {
    const res = await fetch(`${GDELT}?${new URLSearchParams({ query: QUERY, format: 'json', ...params })}`, { headers: { 'User-Agent': 'ReactionCore/1.0 (anxiety index)' }, signal: AbortSignal.timeout(12000) });
    const text = await res.text();
    if (res.status === 429 || /limit requests/i.test(text) || !res.ok) throw new Error(`GDELT ${res.status}`);
    const j = JSON.parse(text);
    const data = key === 'arts' ? cleanHeadlines(j.articles) : timeline(j);
    return { ...g, [key]: { at: new Date(now).toISOString(), data }, nextTry: new Date(now + 6000).toISOString(), error: null };
  } catch (e) {
    return { ...g, nextTry: new Date(now + 10 * MIN).toISOString(), error: e.message };
  }
}

// The GPR file, if a day has passed since the last read (and not more often than every two hours after a failure).
async function readGpr(gpr, now) {
  if (gpr?.at && now - Date.parse(gpr.at) < 24 * HOUR) return gpr;
  if (gpr?.failedAt && now - Date.parse(gpr.failedAt) < 2 * HOUR) return gpr;
  try {
    const res = await fetch(GPR_URL, { headers: { 'User-Agent': 'ReactionCore/1.0 (geopolitical risk panel)' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`GPR ${res.status}`);
    const book = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array', cellDates: true });
    const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, raw: true });
    const series = parseGpr(rows).slice(-400);
    if (series.length < 30) throw new Error('GPR: no daily series in the file');
    return { at: new Date(now).toISOString(), series };
  } catch (e) {
    return { ...(gpr || {}), failedAt: new Date(now).toISOString(), error: e.message };
  }
}

export async function refresh(now = Date.now()) {
  const [feeds, gdelt, gprOld] = await Promise.all([read('feeds'), read('gdelt'), read('gpr')]);
  const [m, g, gpr] = await Promise.all([measureFeeds(now), stepGdelt(gdelt || {}, now), readGpr(gprOld, now)]);
  const days = { ...(feeds?.days || {}) };
  const today = new Date(now).toISOString().slice(0, 10);
  // Earlier days still in the feeds fill gaps in the record (never overwrite a measured day).
  for (const [d, v] of Object.entries(sharesByDay(m.items, now))) if (d < today && !days[d]) days[d] = { ...v, k: 0, back: true };
  if (m.share != null) {
    // Several measurements a day: their mean.
    const d = days[today];
    const k = (d?.k || 0) + 1;
    days[today] = { share: d ? d.share + (m.share - d.share) / k : m.share, n: m.n, k };
  }
  await Promise.all([keep('feeds', { days, at: new Date(now).toISOString() }), keep('gdelt', g), gpr !== gprOld && keep('gpr', gpr)]);
  // The GPR first (while its last day is within three weeks), then GDELT's three months, then the own record.
  const gprOk = gpr?.series?.length >= 30 && now - Date.parse(`${gpr.series.at(-1).date}T00:00:00Z`) < 21 * 24 * HOUR;
  const gOk = g.tone?.data?.length && g.vol?.data?.length && now - Date.parse(g.tone.at) < 7 * 24 * HOUR;
  const index = gprOk ? gprIndex(gpr.series) : gOk ? anxiety(g.tone.data, g.vol.data) : ownIndex(days);
  const own = pickHeadlines(m.crisis, m.analysis || [], now).map((x) => ({ title: x.title, url: x.url, domain: x.domain, at: x.at }));
  const headlines = g.arts?.data?.length && now - Date.parse(g.arts.at) < 6 * HOUR ? pickHeadlines(g.arts.data, m.analysis || [], now) : own;
  return {
    at: new Date(now).toISOString(), index, headlines: cleanHeadlines(headlines),
    source: gprOk ? 'gpr' : gOk ? 'gdelt' : 'feeds', days: Object.keys(days).length, provisional: !gprOk && !gOk && Object.keys(days).length < 7,
    pending: !gprOk && STEPS.some(([k]) => !g[k]?.at), // nothing with history yet: refresh sooner
  };
}

export async function GET(req) {
  if (new URL(req.url).searchParams.has('news')) return newsGet(req); // CONTEXT News (api/_news.js)
  try {
    const m = await caller(req);
    if (!m) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    const cached = await read('world');
    const age = cached?.at ? Date.now() - Date.parse(cached.at) : Infinity;
    if (cached?.index?.length && (age < 10 * MIN || (age < HOUR && !cached.pending))) return json(200, cached);
    const fresh = await refresh();
    if (fresh.index.length) await keep('world', fresh);
    else if (cached?.index?.length) return json(200, { ...cached, stale: true });
    return json(200, fresh);
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
