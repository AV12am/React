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
import { json, db, caller, siteCaller } from './_core.js';
import { companyProfile } from './_company.js';
import { recordVisit, visitStats } from './_visits.js';
import * as XLSX from 'xlsx';
import { timeline, anxiety, QUERY, FEEDS, parseFeed, crisisShare, ownIndex, cleanHeadlines, sharesByDay, GPR_URL, parseGpr, gprIndex, ANALYSIS_FEEDS, pickHeadlines } from '../src/lib/pulse.js';

export const config = { maxDuration: 120 };

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

// SITUATION: what the world's media say about one subject (a country, a company, a sector, a topic) — GDELT's
// coverage volume and tone for three months, or its latest articles. Kept six hours per question; GDELT answers one
// question per five seconds per address, so a refusal is passed on and the page asks again a little later.
//   GET /api/pulse?gdelt=vol|tone|arts&q=<query>   Authorization: Bearer <Supabase access token>
const GD_MODES = { vol: { mode: 'timelinevol', timespan: '3months' }, tone: { mode: 'timelinetone', timespan: '3months' }, arts: { mode: 'artlist', timespan: '7d', maxrecords: '75', sort: 'datedesc' } };
const hashOf = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
export async function subjectMedia(kind, q, now = Date.now(), fetchImpl = fetch) {
  const id = `gd-${kind}-${hashOf(q)}`;
  const kept = await read(id);
  if (kept?.at && now - Date.parse(kept.at) < 6 * HOUR && kept.q === q) return kept;
  // An older answer is better than none when GDELT is busy or down: it is given back, marked stale.
  const stale = kept?.q === q && kept.rows?.length ? { ...kept, stale: true } : null;
  let res;
  try { res = await fetchImpl(`${GDELT}?${new URLSearchParams({ query: q, format: 'json', ...GD_MODES[kind] })}`, { headers: { 'User-Agent': 'ReactionCore/1.0 (situation dashboards)' }, signal: AbortSignal.timeout(15000) }); } catch (e) { if (stale) return stale; throw e; }
  const text = await res.text();
  if (res.status === 429 || /limit requests|please limit/i.test(text)) { if (stale) return stale; const e = new Error('GDELT просить зачекати'); e.status = 429; throw e; }
  if (!res.ok && stale) return stale;
  if (!res.ok) throw new Error(`GDELT ${res.status}`);
  let j; try { j = JSON.parse(text); } catch { throw new Error(/query/i.test(text) ? `GDELT: ${text.slice(0, 120)}` : 'GDELT: незрозуміла відповідь'); }
  const rows = kind === 'arts'
    ? (j.articles || []).map((a) => ({ title: String(a.title || '').slice(0, 220), url: a.url, domain: a.domain, country: a.sourcecountry || '', language: a.language || '', date: /^(\d{4})(\d{2})(\d{2})/.test(a.seendate || '') ? a.seendate.replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3') : '' }))
    : timeline(j);
  const doc = { at: new Date(now).toISOString(), q, kind, rows };
  await keep(id, doc);
  return doc;
}

// SITUATION: a company's public procurement (Prozorro) — the tenders where it is the buyer, found by its EDRPOU code
// through Prozorro's own search (the one prozorro.gov.ua uses). Its exact request form is not documented, so the
// usual ones are tried in turn and the answer is read loosely; kept twelve hours per code.
//   GET /api/pulse?prozorro=<8-digit code>   Authorization: Bearer <Supabase access token>
const PROZORRO_SEARCH = process.env.PROZORRO_SEARCH_URL || 'https://prozorro.gov.ua/api/search/tenders';
const STATUS_UA = { 'active.enquiries': 'Уточнення', 'active.tendering': 'Подання пропозицій', 'active.pre-qualification': 'Прекваліфікація', 'active.auction': 'Аукціон', 'active.qualification': 'Кваліфікація', 'active.awarded': 'Пропозиції розглянуто', active: 'Активна', complete: 'Завершена', unsuccessful: 'Не відбулася', cancelled: 'Скасована', draft: 'Чернетка' };
export function normProzorro(j) {
  const list = Array.isArray(j) ? j : j?.data || j?.items || j?.results || j?.tenders || j?.hits?.hits?.map((h) => h._source) || [];
  return list.filter((t) => t && typeof t === 'object').map((t) => {
    const value = t.value || t.contracts?.[0]?.value || {};
    const pe = t.procuringEntity || t.buyer || {};
    const id = t.tenderID || t.tender_id || t.id || '';
    return {
      id: String(id), title: String(t.title || t.description || '').slice(0, 240), status: STATUS_UA[t.status] || t.status || '',
      amount: Number.isFinite(+value.amount) ? +value.amount : null, currency: value.currency || 'UAH',
      date: String(t.date || t.dateCreated || t.tenderPeriod?.startDate || t.dateModified || '').slice(0, 10),
      buyer: pe.name || pe.identifier?.legalName || '', buyerCode: pe.identifier?.id || '',
      method: t.procurementMethodType || '', url: t.id && /^[0-9a-f]{32}$/.test(t.id) ? `https://prozorro.gov.ua/tender/${t.tenderID || t.id}` : id ? `https://prozorro.gov.ua/tender/${id}` : '',
    };
  }).filter((t) => t.id || t.title);
}
export async function companyTenders(code, now = Date.now(), fetchImpl = fetch) {
  const id = `pz-${code}`;
  const kept = await read(id);
  if (kept?.at && now - Date.parse(kept.at) < 12 * HOUR) return kept;
  const head = { 'User-Agent': 'ReactionCore/1.0 (situation dashboards)', Accept: 'application/json' };
  const tries = [
    () => fetchImpl(PROZORRO_SEARCH, { method: 'POST', headers: { ...head, 'Content-Type': 'application/json' }, body: JSON.stringify({ edrpou: [code], page: 1 }), signal: AbortSignal.timeout(15000) }),
    () => fetchImpl(PROZORRO_SEARCH, { method: 'POST', headers: { ...head, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ edrpou: code, page: '1' }).toString(), signal: AbortSignal.timeout(15000) }),
    () => fetchImpl(`${PROZORRO_SEARCH}?${new URLSearchParams({ edrpou: code, page: '1' })}`, { headers: head, signal: AbortSignal.timeout(15000) }),
  ];
  let last = '';
  for (const go of tries) {
    try {
      const res = await go();
      if (!res.ok) { last = `HTTP ${res.status}`; continue; }
      const rows = normProzorro(await res.json());
      // An answer that ignores the code (the latest tenders of everyone) is no answer.
      const own = rows.filter((r) => !r.buyerCode || r.buyerCode === code);
      if (rows.length && !own.length) { last = 'пошук не врахував код'; continue; }
      const doc = { at: new Date(now).toISOString(), code, rows: own };
      await keep(id, doc);
      return doc;
    } catch (e) { last = e.message; }
  }
  throw new Error(`Prozorro не відповів: ${last}`);
}

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  if (sp.has('prozorro')) {
    const code = String(sp.get('prozorro') || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(code)) return json(400, { error: 'code', message: 'Потрібен код ЄДРПОУ (8 цифр)' });
    if (!(await caller(req)) && !(await siteCaller(req))) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    try { return json(200, await companyTenders(code)); } catch (e) { return json(502, { error: 'prozorro', message: e.message }); }
  }
  if (sp.has('visits')) {
    // The public site's visits: an administrator of the workspace only.
    const m = await caller(req);
    if (!m || m.doc?.role !== 'admin') return json(403, { error: 'admin', message: 'Лише адміністратор' });
    try { return json(200, await visitStats(+sp.get('visits'))); } catch (e) { return json(500, { error: 'visits', message: e.message }); }
  }
  if (sp.has('company')) {
    const code = String(sp.get('company') || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(code)) return json(400, { error: 'code', message: 'Потрібен код ЄДРПОУ (8 цифр)' });
    if (!(await caller(req)) && !(await siteCaller(req))) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    try { return json(200, await companyProfile(code)); } catch (e) { return json(502, { error: 'company', message: e.message }); }
  }
  if (sp.has('news')) return newsGet(req); // CONTEXT News (api/_news.js)
  if (sp.has('gdelt')) {
    const kind = sp.get('gdelt');
    const q = String(sp.get('q') || '').trim().slice(0, 160);
    if (!GD_MODES[kind] || q.length < 2) return json(400, { error: 'query', message: 'Потрібні вид (vol, tone, arts) і запит' });
    if (!(await caller(req)) && !(await siteCaller(req))) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    try { return json(200, await subjectMedia(kind, q)); } catch (e) { return json(e.status === 429 ? 429 : 502, { error: 'gdelt', message: e.message }); }
  }
  try {
    const m = (await caller(req)) || (await siteCaller(req));
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

// A visit to the public site (api/_visits.js): sent with navigator.sendBeacon, answered with nothing.
export async function POST(req) {
  if (!new URL(req.url).searchParams.has('visit')) return json(404, { error: 'not_found' });
  try { await recordVisit(req); } catch { /* a lost count is not worth an error */ }
  return new Response(null, { status: 204 });
}
