// Sign-in by name (api/signin.js): one match signs in with that person's e-mail; unknown or ambiguous names
// and suspended people get the same answer as a wrong password.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('signin by name', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon' });
  const members = [
    { email: 'anna@x.test', doc: { name: 'Анна Коваль', code: 'V-001', status: 'active' } },
    { email: 'ivan@x.test', doc: { name: 'Іван', code: 'V-002', status: 'active' } },
    { email: 'ivan2@x.test', doc: { name: 'Іван', code: 'V-003', status: 'active' } },
    { email: 'old@x.test', doc: { name: 'Олег', code: 'V-004', status: 'suspended' } },
  ];
  const tried = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('core_members')) return new Response(JSON.stringify(members));
    if (u.includes('/auth/v1/token')) {
      const b = JSON.parse(opts.body); tried.push(b.email);
      return b.password === 'right' ? new Response(JSON.stringify({ access_token: 't', user: { email: b.email } })) : new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    }
    throw new Error(`unexpected ${u}`);
  };
  try {
    const { POST } = await import(`../../api/signin.js?t=${Date.now()}`);
    const call = async (name, password = 'right') => { const r = await POST(new Request('https://app.test/api/signin', { method: 'POST', body: JSON.stringify({ name, password }) })); return [r.status, await r.json()]; };
    assert.equal((await call('  анна   коваль '))[1].user.email, 'anna@x.test');
    assert.equal((await call('v-001'))[1].user.email, 'anna@x.test');
    assert.equal((await call('anna'))[1].user.email, 'anna@x.test');
    assert.equal((await call('Anna@X.test'))[1].user.email, 'anna@x.test');
    const n = tried.length;
    for (const name of ['Іван', 'Олег', 'Хтось']) assert.deepEqual(await call(name), [400, { error: 'invalid_credentials', message: 'Invalid login credentials' }]);
    assert.equal(tried.length, n); // nobody's password was tried for those
    assert.equal((await call('Анна Коваль', 'wrong'))[1].error, 'invalid_credentials');
  } finally { globalThis.fetch = real; }
});
