// Passwords set by an administrator (api/users.js): only admins; CUSTOS's only by CUSTOS; weak ones refused;
// a missing sign-in is created, an existing one changed, and the person's confirmed sessions end.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('admin sets passwords', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
  let me = { id: 'u1', email: 'boss@x.test', doc: { name: 'Бос', role: 'admin', status: 'active', clearance: 2 } };
  const members = [
    { id: 'u2', email: 'ann@x.test', doc: { name: 'Анна', code: 'V-002' } },
    { id: 'u3', email: 'new@x.test', doc: { name: 'Новий', code: 'V-003' } },
    { id: 'u9', email: 'custos@x.test', doc: { name: 'Кустос', custos: true } },
  ];
  const accounts = [{ id: 'auth-ann', email: 'ann@x.test' }, { id: 'auth-c', email: 'custos@x.test' }];
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const ok = (b, status = 200) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : status });
    if (u.includes('/auth/v1/user')) return ok({ email: me.email });
    if (u.includes('core_members?email=eq')) return ok([me]);
    if (u.includes('core_settings')) return ok([{ value: false }]);
    if (u.includes('core_members?id=eq.')) { const id = u.split('id=eq.')[1].split('&')[0]; return ok(members.filter((m) => m.id === id)); }
    if (u.includes('/auth/v1/admin/users?page=')) return ok({ users: accounts });
    if (u.includes('/auth/v1/admin/users')) { calls.push([opts.method, u.split('/auth/v1/')[1], JSON.parse(opts.body || '{}')]); return ok({ id: 'x' }); }
    if (u.includes('core_verified')) { calls.push(['DELETE', u.split('/rest/v1/')[1]]); return ok(null); }
    if (u.includes('core_docs')) { calls.push(['AUDIT', JSON.parse(opts.body).doc.text]); return ok(null); }
    throw new Error(`unexpected ${opts.method || 'GET'} ${u}`);
  };
  let token = `x.${Buffer.from(JSON.stringify({ session_id: 's1' })).toString('base64url')}.y`;
  try {
    const { POST } = await import('../../api/users.js');
    const call = async (memberId, password) => { const r = await POST(new Request('https://app.test/api/users', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ op: 'password', memberId, password }) })); return [r.status, await r.json()]; };
    assert.equal((await call('u2', 'short1'))[0], 400);
    assert.equal((await call('u2', 'onlyletterslong'))[0], 400);
    // existing sign-in: password replaced, their sessions ended, logged without the password
    assert.deepEqual(await call('u2', 'NewPassw0rd99'), [200, { ok: true, created: false }]);
    assert.deepEqual(calls.find((c) => c[0] === 'PUT'), ['PUT', 'admin/users/auth-ann', { password: 'NewPassw0rd99' }]);
    assert.ok(calls.some((c) => c[0] === 'DELETE' && c[1].startsWith('core_verified?member_id=eq.u2')));
    assert.ok(calls.some((c) => c[0] === 'AUDIT' && /Змінено пароль: V-002/.test(c[1]) && !c[1].includes('NewPassw0rd99')));
    // no sign-in yet: created, e-mail confirmed
    assert.deepEqual(await call('u3', 'Another1Pass'), [200, { ok: true, created: true }]);
    assert.deepEqual(calls.find((c) => c[0] === 'POST'), ['POST', 'admin/users', { email: 'new@x.test', password: 'Another1Pass', email_confirm: true }]);
    // CUSTOS's password: not by another admin
    assert.equal((await call('u9', 'Another1Pass'))[0], 403);
    assert.equal((await call('u404', 'Another1Pass'))[1].error, 'member');
    // not an admin
    me = { ...me, doc: { ...me.doc, role: 'lead' } };
    token = `x.${Buffer.from(JSON.stringify({ session_id: 's2' })).toString('base64url')}.y`; // a new sign-in (a known one is remembered for 30 s)
    assert.equal((await call('u2', 'NewPassw0rd99'))[0], 403);
  } finally { globalThis.fetch = real; }
});
