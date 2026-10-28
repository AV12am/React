// Attachments in Cloudflare R2 (api/_r2.js): signed PUT / GET / DELETE addresses, the card remembers its store,
// and cards filed earlier in Supabase keep opening from Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('files API with R2', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'kid', R2_SECRET_ACCESS_KEY: 'sec', R2_BUCKET: 'reaction' });
  const files = new Map([['x-old', { id: 'x-old', ref: 'att/int/x-old/a.pdf', clearance: 0, owner: 'u1' }]]);
  const r2 = [];
  let stored = 100; // what R2 says it holds
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.startsWith('https://acc.r2.cloudflarestorage.com/')) {
      r2.push([opts.method, u]);
      if (opts.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': String(stored) } });
      return new Response(null, { status: 204 });
    }
    if (u.includes('vault_files?select=size')) return new Response(JSON.stringify([...files.values()].map((d) => ({ size: d.size, store: d.store }))));
    if (u.includes('/auth/v1/user')) return ok({ email: 'me@x.test' });
    if (u.includes('core_members?email=eq')) return ok([{ id: 'u1', email: 'me@x.test', doc: { name: 'Анна', status: 'active', role: 'analyst', clearance: 1 } }]);
    if (u.includes('core_settings')) return ok([{ value: false }]);
    if (u.includes('/storage/v1/object/sign/')) return ok({ signedURL: '/object/sign/vault/old?token=r' });
    if (opts.method === 'POST' && u.includes('vault_folders')) return ok(null);
    if (opts.method === 'POST' && u.includes('vault_files')) { const r = JSON.parse(opts.body); files.set(r.id, r.doc); return ok(null); }
    if (opts.method === 'DELETE' && u.includes('vault_files?id=eq.')) { files.delete(u.split('id=eq.')[1]); return ok(null); }
    if (u.includes('vault_files?id=eq.')) { const id = u.split('id=eq.')[1].split('&')[0]; return ok(files.has(id) ? [{ doc: files.get(id) }] : []); }
    throw new Error(`unexpected ${opts.method || 'GET'} ${u}`);
  };
  const token = `x.${Buffer.from(JSON.stringify({ session_id: 's' })).toString('base64url')}.y`;
  try {
    const { POST } = await import('../../api/files.js');
    const call = async (body) => { const r = await POST(new Request('https://app.test/api/files', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
    const [s1, sign] = await call({ op: 'sign', name: 'Фото 1.png', type: 'image/png', size: 100, clearance: 1, division: 'prj' });
    assert.equal(s1, 200);
    assert.equal(sign.store, 'r2');
    assert.match(sign.uploadUrl, /^https:\/\/acc\.r2\.cloudflarestorage\.com\/reaction\/att\/prj\/x-[\w-]+\/[\w.-]+\.png\?X-Amz-Algorithm=AWS4-HMAC-SHA256&.*X-Amz-Expires=900.*&X-Amz-Signature=[0-9a-f]{64}$/);
    assert.doesNotMatch(sign.uploadUrl, /sec/); // the secret is never in the address
    const [, c] = await call({ op: 'commit', meta: { id: sign.id, ref: sign.ref, store: 'r2', name: 'Фото 1.png', clearance: 1, division: 'prj', size: 1 } });
    assert.equal(c.meta.store, 'r2');
    assert.equal(c.meta.size, 100); // the size R2 holds, not the one the browser said
    // the 9,75 ГБ limit: refused before upload, and checked again against what was really stored
    const GiB = 1024 ** 3;
    files.set('x-big', { id: 'x-big', ref: 'att/int/x-big/a', store: 'r2', size: 9.75 * GiB - 20 * 1024 ** 2, clearance: 0, owner: 'u1' });
    assert.deepEqual((await call({ op: 'sign', name: 'v.mp4', type: 'video/mp4', size: 40 * 1024 ** 2, clearance: 0, division: 'prj' }))[0], 507);
    const [s3, small] = await call({ op: 'sign', name: 'a.txt', type: 'text/plain', size: 10, clearance: 0, division: 'prj' });
    assert.equal(s3, 200);
    stored = 40 * 1024 ** 2; // the browser lied about the size
    const [s4, over] = await call({ op: 'commit', meta: { id: small.id, ref: small.ref, store: 'r2', name: 'a.txt', clearance: 0, division: 'prj', size: 10 } });
    assert.equal(s4, 507); assert.equal(over.error, 'full');
    assert.ok(r2.some(([m, u]) => m === 'DELETE' && u.includes(small.id)));
    assert.ok(!files.has(small.id));
    const [, info] = await call({ op: 'info' });
    assert.equal(info.quota, 9.75 * GiB); assert.ok(info.used >= 9.7 * GiB);
    files.delete('x-big'); stored = 100;
    const [, r] = await call({ op: 'url', id: sign.id });
    assert.match(r.url, /^https:\/\/acc\.r2\.cloudflarestorage\.com\/reaction\/att\/prj\/.*X-Amz-Expires=600/);
    // earlier files stay in Supabase
    const [, old] = await call({ op: 'url', id: 'x-old' });
    assert.match(old.url, /^https:\/\/sb\.test\/storage\/v1\/object\/sign\//);
    assert.equal((await call({ op: 'remove', id: sign.id }))[0], 200);
    assert.ok(r2.some(([m, u]) => m === 'DELETE' && u.includes(`/reaction/att/prj/${sign.id}/`)));
    assert.ok(!files.has(sign.id));
  } finally { globalThis.fetch = real; }
});
