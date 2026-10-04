// Vercel Function: the watch conveyor (scripts/lib/watch.mjs).
//
// POST /api/watch  { watchlists: [...] }   Authorization: Bearer <Supabase access token>
//   A manual run from the platform. The caller sends the lists they can already read; the function only
//   fetches open sources and returns candidate findings — the app writes them as intake records itself,
//   through row-level security. Without Supabase (local demo) it runs for anyone, capped at 20 terms.
//
// GET /api/watch   Authorization: Bearer <CRON_SECRET>   (Vercel Cron, daily — see vercel.json)
//   The scheduled run: reads the active watchlists with the service key, writes new findings as
//   intake records (duplicates are skipped by id), updates each list's last run and adds an audit entry.
import { readFileSync } from 'node:fs';
import { runWatch, toIntake, sourceRecord, SOURCE_RECORDS } from '../scripts/lib/watch.mjs';

const cfg = JSON.parse(readFileSync(new URL('../scripts/watch-sources.json', import.meta.url), 'utf8'));
export const config = { maxDuration: 60 };

const env = process.env;
const SB_URL = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '';
const MAX_TERMS = 500;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

async function db(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: SERVICE, 'Content-Type': 'application/json' };
  if (SERVICE.startsWith('eyJ')) headers.Authorization = `Bearer ${SERVICE}`;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`db ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return res.status === 204 || res.status === 201 ? null : res.json().catch(() => null);
}

// A signed-in member whose session is confirmed with a passkey (same rule as the database's).
async function caller(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const email = String((await res.json()).email || '').toLowerCase();
  const sid = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString() || '{}').session_id;
  const [m] = await db(`core_members?email=eq.${encodeURIComponent(email)}&select=id,doc`);
  if (!m || m.doc?.status === 'suspended') return null;
  const [need] = await db('core_settings?key=eq.require_passkey&select=value').catch(() => []);
  if (need?.value !== false && need?.value !== 'false') {
    const ok = await db(`core_verified?session_id=eq.${encodeURIComponent(sid || '')}&member_id=eq.${encodeURIComponent(m.id)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=session_id`).catch(() => []);
    if (!ok?.length) return null;
  }
  return { id: m.id, ...m.doc };
}

const clean = (w) => ({
  id: String(w.id || ''), name: String(w.name || '').slice(0, 200), kind: w.kind, clearance: Math.max(0, Math.min(2, +w.clearance || 0)),
  terms: String(w.terms || '').slice(0, 20_000), feeds: String(w.feeds || '').slice(0, 5_000),
});
const termCount = (lists) => lists.reduce((a, w) => a + w.terms.split(/\n/).filter((l) => l.trim()).length, 0);

export async function POST(req) {
  try {
    const supabase = !!(SB_URL && SERVICE);
    if (supabase && !(await caller(req))) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    const body = await req.json().catch(() => ({}));
    const lists = (Array.isArray(body.watchlists) ? body.watchlists : []).map(clean).filter((w) => w.id && w.terms);
    const cap = supabase ? MAX_TERMS : 120; // without sign-in (local demo) a smaller cap
    if (termCount(lists) > cap) return json(400, { error: 'too_many', message: `Забагато об’єктів за один запуск (понад ${cap})` });
    const out = await runWatch({ watchlists: lists, fetchImpl: fetch, cfg });
    return json(200, { ...out, sources: SOURCE_RECORDS });
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}

export async function GET(req) {
  const secret = env.CRON_SECRET;
  if (!secret) return json(503, { error: 'not_configured', message: 'CRON_SECRET не задано' });
  if ((req.headers.get('authorization') || '') !== `Bearer ${secret}`) return json(401, { error: 'unauthorized' });
  if (!SB_URL || !SERVICE) return json(503, { error: 'not_configured', message: 'Потрібні SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY' });
  const now = new Date();
  try {
    const rows = await db(`core_docs?kind=eq.records&doc->>div=eq.int&doc->>col=eq.watchlists&select=doc`);
    const lists = rows.map((r) => r.doc).filter((w) => (w.state || 'Активний') === 'Активний').map((w) => ({ ...clean(w), owner: w.owner || null, doc: w }));
    const { findings, errors, stats } = await runWatch({ watchlists: lists, fetchImpl: fetch, cfg, now });

    // Source records the findings point at (created once, public, LUMEN).
    const used = [...new Set(findings.map((f) => f.source))];
    if (used.length) {
      await db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: used.map((k) => ({ kind: 'records', id: SOURCE_RECORDS[k].id, doc: sourceRecord(k, { now }) })) });
    }
    // New findings only: an existing id (same list, same article or list entry) is left untouched.
    if (findings.length) {
      const owner = (id) => lists.find((w) => w.id === id)?.owner || null;
      const docs = findings.map((f) => toIntake(f, { now, owner: owner(f.watchlist) }));
      const existing = new Set((await db(`core_docs?kind=eq.records&id=in.(${docs.map((d) => `"${d.id}"`).join(',')})&select=id`)).map((r) => r.id));
      const fresh = docs.filter((d) => !existing.has(d.id));
      if (fresh.length) await db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: fresh.map((d) => ({ kind: 'records', id: d.id, doc: d })) });
      for (const w of lists) w.fresh = fresh.filter((d) => d.watchlist === w.id).length;
    }
    for (const w of lists) {
      const doc = { ...w.doc, lastRun: now.toISOString(), lastFound: w.fresh || 0 };
      await db(`core_docs?kind=eq.records&id=eq.${encodeURIComponent(w.id)}`, { method: 'PATCH', prefer: 'return=minimal', body: { doc } });
    }
    const total = lists.reduce((a, w) => a + (w.fresh || 0), 0);
    const id = `a-watch-${now.getTime().toString(36)}`;
    await db('core_docs', { method: 'POST', prefer: 'return=minimal', body: { kind: 'audit', id, doc: { id, at: now.toISOString(), actor: null, type: 'work', text: `Конвеєр спостереження: ${lists.length} списків, нових надходжень ${total}${errors.length ? `, помилок джерел ${errors.length}` : ''}`, clearance: 1 } } }).catch(() => {});
    return json(200, { lists: lists.length, found: findings.length, fresh: total, stats, errors });
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
