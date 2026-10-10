// Shared by the server functions: environment, the service-key database call and the signed-in caller.
// Files starting with «_» are not routes on Vercel.

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
export async function caller(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const email = String((await res.json()).email || '').toLowerCase();
  const sid = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString() || '{}').session_id;
  const [m] = await db(`core_members?email=eq.${encodeURIComponent(email)}&select=id,email,doc`);
  if (!m || m.doc?.status === 'suspended') return null;
  const [need] = await db('core_settings?key=eq.require_passkey&select=value').catch(() => []);
  if (need?.value !== false && need?.value !== 'false') {
    const ok = await db(`core_verified?session_id=eq.${encodeURIComponent(sid || '')}&member_id=eq.${encodeURIComponent(m.id)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=session_id`).catch(() => []);
    if (!ok?.length) return null;
  }
  return m;
}

