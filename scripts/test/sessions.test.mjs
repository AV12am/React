// «Мої сеанси»: listing my confirmed sessions with their device, ending one or all the others.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('sessions: list, end one, end all others (with Auth logout)', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon' });
  const calls = [];
  const real = globalThis.fetch;
  const future = new Date(Date.now() + 3600e3).toISOString();
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    calls.push([opts.method || 'GET', u]);
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.includes('/auth/v1/user')) return ok({ email: 'me@x.test' });
    if (u.includes('/auth/v1/logout')) return ok(null);
    if (u.includes('core_members?email=eq')) return ok([{ id: 'u1', doc: { name: 'Анна', status: 'active' } }]);
    if (u.includes('core_verified?session_id=eq.s1')) return ok([{ session_id: 's1' }]);
    if (u.includes('core_verified?member_id=eq.u1&expires_at')) return ok([{ session_id: 's1', verified_at: '2026-10-10T05:00:00Z', expires_at: future }, { session_id: 's2', verified_at: '2026-10-09T05:00:00Z', expires_at: future }]);
    if (u.includes('core_docs?kind=eq.session')) return ok([{ id: 's2', doc: { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1', key: 'iPhone' } }]);
    if (opts.method === 'DELETE' || opts.method === 'POST') return ok(null);
    throw new Error(`unexpected ${u}`);
  };
  const token = `x.${Buffer.from(JSON.stringify({ session_id: 's1' })).toString('base64url')}.y`;
  try {
    const { POST } = await import(`../../api/passkey.js?t=${Date.now()}`);
    const call = async (body) => (await POST(new Request('https://app.test/api/passkey', { method: 'POST', headers: { authorization: `Bearer ${token}`, origin: 'https://app.test' }, body: JSON.stringify(body) }))).json();
    const list = await call({ op: 'sessions' });
    assert.deepEqual(list.sessions.map((s) => [s.id, s.current, s.key]), [['s1', true, ''], ['s2', false, 'iPhone']]);
    const self = await call({ op: 'end-sessions', id: 's1' });
    assert.equal(self.error, 'session');
    await call({ op: 'end-sessions', id: 's2' });
    assert.ok(calls.some(([m, u]) => m === 'DELETE' && u.includes('member_id=eq.u1&session_id=eq.s2')));
    await call({ op: 'end-sessions', all: true });
    assert.ok(calls.some(([m, u]) => m === 'DELETE' && u.includes('session_id=neq.s1')));
    assert.ok(calls.some(([m, u]) => m === 'POST' && u.includes('/auth/v1/logout?scope=others')));
  } finally { globalThis.fetch = real; }
});
