// Vercel Function: the world anxiety index (src/lib/pulse.js).
//
// Two sources, so the index never hangs on one service:
//   · the platform's own measurement — open RSS of world newsrooms, read here, the share of items about war,
//     conflict, attacks, crises and sanctions kept per day in core_docs (kind 'pulse', id 'feeds');
//   · GDELT (open data, three months of history at once) — asked one question at a time and at most every
//     ten minutes, because it limits requests per address and Vercel's addresses are shared with many sites;
//     what it answers is kept (id 'gdelt') and used while fresh.
// The result for the screen is kept for the hour (id 'world'), one refresh for the whole team.
//
// GET /api/pulse   Authorization: Bearer <Supabase access token>  → { at, index, headlines, source, provisional }
import { json, db, caller } from './_core.js';
import { timeline, anxiety, QUERY, FEEDS, parseFeed, crisisShare, ownIndex, cleanHeadlines, sharesByDay } from '../src/lib/pulse.js';

export const config = { maxDuration: 30 };

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

async function measureFeeds(now) {
  const all = await Promise.all(FEEDS.map(async (url) => {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ReactionCore/1.0 (+news tone index)', Accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(8000) });
      return res.ok ? parseFeed(await res.text(), new URL(url).hostname.replace(/^(www|feeds|rss|news)\./, '')) : [];
    } catch { return []; }
  }));
  return crisisShare(all.flat(), now);
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

export async function refresh(now = Date.now()) {
  const [feeds, gdelt] = await Promise.all([read('feeds'), read('gdelt')]);
  const [m, g] = await Promise.all([measureFeeds(now), stepGdelt(gdelt || {}, now)]);
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
  await Promise.all([keep('feeds', { days, at: new Date(now).toISOString() }), keep('gdelt', g)]);
  // GDELT's three months while fresh enough (a week), otherwise the platform's own record.
  const gOk = g.tone?.data?.length && g.vol?.data?.length && now - Date.parse(g.tone.at) < 7 * 24 * HOUR;
  const index = gOk ? anxiety(g.tone.data, g.vol.data) : ownIndex(days);
  const own = m.crisis.slice(0, 8).map((x) => ({ title: x.title, url: x.url, domain: x.domain, at: x.at }));
  const headlines = g.arts?.data?.length && now - Date.parse(g.arts.at) < 6 * HOUR ? g.arts.data : own;
  return {
    at: new Date(now).toISOString(), index, headlines: cleanHeadlines(headlines),
    source: gOk ? 'gdelt' : 'feeds', days: Object.keys(days).length, provisional: !gOk && Object.keys(days).length < 7,
    pending: STEPS.some(([k]) => !g[k]?.at), // GDELT not complete yet: refresh sooner
  };
}

export async function GET(req) {
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
