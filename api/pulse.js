// Vercel Function: the world anxiety index (src/lib/pulse.js) from GDELT — open data on world news, free,
// no key. Three questions to GDELT (the tone of coverage about war, conflict, crisis, attacks, sanctions…,
// its share of all world coverage, and the most relevant articles of the last day), asked at most once an
// hour for the whole team: the answer is kept in core_docs (kind 'pulse') — GDELT asks for one request
// every five seconds.
//
// GET /api/pulse   Authorization: Bearer <Supabase access token>  → { at, index, headlines }
import { json, db, caller } from './_core.js';
import { timeline, anxiety } from '../src/lib/pulse.js';

export const config = { maxDuration: 45 };

const HOUR = 3600000;
const QUERY = '(war OR conflict OR crisis OR attack OR sanctions OR terrorism OR recession OR cyberattack OR "state of emergency") sourcelang:english';
const GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const ask = async (params) => {
  const res = await fetch(`${GDELT}?${new URLSearchParams({ query: QUERY, format: 'json', ...params })}`, { headers: { 'User-Agent': 'ReactionCore/1.0 (anxiety index)' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`GDELT ${res.status}`);
  try { return JSON.parse(text); } catch { throw new Error(`GDELT: ${text.slice(0, 120)}`); }
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function refresh() {
  const tone = timeline(await ask({ mode: 'timelinetone', timespan: '3months', TIMELINESMOOTH: '3' }));
  await pause(5500);
  const volume = timeline(await ask({ mode: 'timelinevol', timespan: '3months', TIMELINESMOOTH: '3' }));
  await pause(5500);
  const arts = await ask({ mode: 'artlist', timespan: '24h', maxrecords: '8', sort: 'hybridrel' }).catch(() => ({}));
  const headlines = (arts.articles || []).slice(0, 8).map((a) => ({ title: String(a.title || '').slice(0, 200), url: a.url, domain: a.domain, country: a.sourcecountry, at: a.seendate }))
    .filter((a) => /^https?:\/\//.test(a.url || ''));
  return { at: new Date().toISOString(), index: anxiety(tone, volume), headlines, source: 'GDELT Project' };
}

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
      await db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { kind: 'pulse', id: 'world', doc: { ...fresh, id: 'world', clearance: 0 } } }).catch(() => {});
      return json(200, fresh);
    } catch (e) {
      // GDELT busy or down: the last known index, marked as such.
      if (cached?.index?.length) return json(200, { ...cached, stale: true, error: e.message });
      return json(502, { error: 'gdelt', message: `Немає даних від GDELT: ${e.message}` });
    }
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
