// Vercel Function: live conflict data for the Map, fetched on demand and cached at the edge.
//
// GET /api/conflicts → { manifest, deepstate, isw, acled } — the same shapes the map reads from
// public/data/conflicts/ (written by scripts/update-conflicts.mjs on a self-hosted server).
// The CDN keeps a response for 3 hours and serves the previous one while it refreshes,
// so the sources are asked at most a few times a day. ACLED is used only when its
// credentials are set in the project's environment variables.
import config from '../scripts/conflict-sources.json' with { type: 'json' };
import { fetchDeepState, fetchIsw, fetchAcled, NotConfigured } from '../scripts/update-conflicts.mjs';

const ADAPTERS = { deepstate: fetchDeepState, isw: fetchIsw, acled: fetchAcled };

export async function GET() {
  const now = new Date();
  const manifest = { updatedAt: null, checkedAt: now.toISOString(), sources: {}, via: 'api' };
  const body = { manifest, deepstate: null, isw: null, acled: null };

  await Promise.all(Object.entries(ADAPTERS).map(async ([id, adapter]) => {
    const cfg = config[id];
    const base = { attribution: cfg.attribution, file: null, updatedAt: null, sourceDate: null };
    if (!cfg.enabled) { manifest.sources[id] = { ...base, status: 'disabled' }; return; }
    try {
      const { data, meta } = await adapter({ fetchImpl: fetch, cfg, config, env: process.env, now });
      body[id] = data;
      manifest.sources[id] = { ...base, ...meta, status: 'ok', updatedAt: now.toISOString(), error: null };
      manifest.updatedAt = now.toISOString();
    } catch (e) {
      manifest.sources[id] = { ...base, status: e instanceof NotConfigured ? 'not_configured' : 'error', error: e.message };
    }
  }));

  const anyData = body.deepstate || body.isw || body.acled;
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Good data: 3 h at the edge, stale up to a day while refreshing. Nothing usable: retry soon.
      'Cache-Control': anyData ? 'public, max-age=900, s-maxage=10800, stale-while-revalidate=86400' : 'public, max-age=60, s-maxage=300',
    },
  });
}
