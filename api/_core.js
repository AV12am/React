// Shared by the server functions: environment, the service-key database call and the signed-in caller.
// Files starting with «_» are not routes on Vercel.
import { ipAllowed, clientIp } from '../src/lib/ip.js';

export const env = process.env;
export const SB_URL = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
export const ANON = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
export const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '';

export const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function db(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: SERVICE, 'Content-Type': 'application/json' };
  if (SERVICE.startsWith('eyJ')) headers.Authorization = `Bearer ${SERVICE}`;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`db ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return res.status === 204 || res.status === 201 ? null : res.json().catch(() => null);
}

// A signed-in member whose session is confirmed with a passkey (same rule as the database's).
// Two round trips instead of four: who the token is, then the member, the passkey setting and the session's
// confirmation together. A warm function remembers the answer for a token for 30 seconds — the IP check runs
// every time, and a suspension or an ended session takes effect within that half-minute. A session confirmed
// with the person's passkey is let in from any address: the key, not the address, proves the device.
const seen = new Map(); // token → { m, at }
const FRESH = 30000;
export async function caller(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const hit = seen.get(token);
  const m = hit && Date.now() - hit.at < FRESH ? hit.m : await lookup(token);
  if (!hit || hit.m !== m) { if (seen.size > 500) seen.clear(); if (m) seen.set(token, { m, at: Date.now() }); }
  if (!m) return null;
  if (!m.viaKey && !ipAllowed(m.doc, clientIp(req))) return null; // the person's access is limited to their devices' addresses
  return m;
}
async function lookup(token) {
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const email = String((await res.json()).email || '').toLowerCase();
  const sid = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString() || '{}').session_id;
  const [[m], [need], ok] = await Promise.all([
    db(`core_members?email=eq.${encodeURIComponent(email)}&select=id,email,doc`),
    db('core_settings?key=eq.require_passkey&select=value').catch(() => []),
    db(`core_verified?session_id=eq.${encodeURIComponent(sid || '')}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=member_id`).catch(() => []),
  ]);
  if (!m || m.doc?.status === 'suspended') return null;
  const viaKey = (ok || []).some((r) => r.member_id === m.id);
  if (need?.value !== false && need?.value !== 'false' && !viaKey) return null;
  return { ...m, viaKey };
}

