// Vercel Function: sign in by name instead of e-mail.
//
// POST /api/signin  { name, password }  → the Supabase session (as /auth/v1/token returns it)
//
// The name is matched, with the service key, against the team (core_members): the person's name, their
// code (V-001) or the part of their e-mail before «@», ignoring case. Only one match signs in; an unknown
// or ambiguous name gets the same answer as a wrong password, so the form does not reveal who is on the team.
// The password is checked by Supabase Auth itself, and the passkey step still follows as before.
import { json, db, SB_URL, ANON, SERVICE } from './_core.js';
import { ipAllowed, clientIp } from '../src/lib/ip.js';

export const config = { maxDuration: 10 };

const norm = (s) => String(s || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const WRONG = { error: 'invalid_credentials', message: 'Invalid login credentials' };

export async function POST(req) {
  if (!SB_URL || !SERVICE || !ANON) return json(503, { error: 'not_configured', message: 'Sign-in by name is not configured' });
  try {
    const body = await req.json().catch(() => ({}));
    const name = norm(body.name);
    const password = String(body.password || '');
    if (!name || !password || name.length > 120) return json(400, WRONG);
    let email = name.includes('@') ? name : '';
    if (!email) {
      const rows = await db('core_members?select=email,doc');
      const hits = (rows || []).filter((r) => r.email && r.doc?.status !== 'suspended'
        && [r.doc?.name, r.doc?.code, r.email.split('@')[0]].some((v) => norm(v) === name));
      if (hits.length !== 1) return json(400, WRONG);
      email = hits[0].email;
    }
    const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json', 'X-Forwarded-For': req.headers.get('x-forwarded-for') || '' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json(res.status === 429 ? 429 : 400, res.status === 429 ? { error: 'over_request_rate_limit', message: 'Too many attempts' } : WRONG);
    // Only after the right password: is this device's address allowed for the person? If not, and they have
    // no passkey to confirm the sign-in with, the new session is ended at once and never handed out.
    const ip = clientIp(req);
    const [m] = await db(`core_members?email=eq.${encodeURIComponent(email)}&select=id,doc`);
    const keyed = async () => ((await db(`core_passkeys?member_id=eq.${encodeURIComponent(m.id)}&select=id&limit=1`).catch(() => [])) || []).length > 0;
    if (m && !ipAllowed(m.doc, ip) && !(await keyed())) {
      await fetch(`${SB_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${data.access_token}` } }).catch(() => {});
      return json(403, { error: 'ip', message: `Вхід з адреси ${ip || 'невідомої'} для цього доступу не дозволено`, ip });
    }
    return json(200, data);
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
