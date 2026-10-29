// Vercel Function: the world anxiety index (src/lib/pulse.js) from GDELT — open data on world news, free,
// no key. Three questions to GDELT (the tone of coverage about war, conflict, crisis, attacks, sanctions…,
// its share of all world coverage, and the most relevant articles of the last day), asked at most once an
// hour for the whole team: the answer is kept in core_docs (kind 'pulse') — GDELT asks for one request
// every five seconds.
//
// GET  /api/pulse   → { at, index, headlines } (or 503 { need: 'browser' } when GDELT refuses this server)
// POST /api/pulse   { index, headlines } → the index a member's browser fetched from GDELT itself — GDELT limits
//   requests per address and Vercel's addresses are shared with many sites; checked and kept for the hour.
//   Authorization: Bearer <Supabase access token> for both.
import { json, db, caller } from './_core.js';
import { fetchPulse, cleanIndex, cleanHeadlines } from '../src/lib/pulse.js';

export const config = { maxDuration: 45 };

const HOUR = 3600000;
const keep = (doc) => db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { kind: 'pulse', id: 'world', doc: { ...doc, id: 'world', clearance: 0 } } }).catch(() => {});

export const refresh = () => fetchPulse({ 'User-Agent': 'ReactionCore/1.0 (anxiety index)' });

export async function GET(req) {
  try {
    const m = await caller(req);
    if (!m) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    const [row] = await db('core_docs?kind=eq.pulse&id=eq.world&select=doc').catch(() => []);
    const cached = row?.doc;
    if (cached?.at && Date.now() - Date.parse(cached.at) < HOUR && cached.index?.length) return json(200, cached);
    try {
      const fresh = await refresh();
      if (!fresh.index.length) throw new Error('GDELT не повернув даних');
      await keep(fresh);
      return json(200, fresh);
    } catch (e) {
      // GDELT refuses this server: the browser fetches it and sends it back (POST); meanwhile the last known index.
      return json(cached?.index?.length ? 200 : 503, { ...(cached || {}), stale: !!cached, need: 'browser', error: e.message });
    }
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}

export async function POST(req) {
  try {
    const m = await caller(req);
    if (!m) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    const body = await req.json().catch(() => ({}));
    const index = cleanIndex(body.index);
    if (index.length < 7) return json(400, { error: 'index', message: 'Замало даних' });
    const doc = { at: new Date().toISOString(), index, headlines: cleanHeadlines(body.headlines), source: 'GDELT Project', via: 'browser' };
    await keep(doc);
    return json(200, doc);
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
