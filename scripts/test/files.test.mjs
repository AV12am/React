// Вкладення через api/files.js: signed upload, card filed under the person's name, no reading above one's clearance.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('files API: sign, commit, read, refuse above clearance, remove', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
  const files = new Map([['x-top', { id: 'x-top', ref: 'att/int/x-top/a.pdf', clearance: 2, owner: 'u9' }]]);
  const folders = new Map();
  const storageCalls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.includes('/auth/v1/user')) return ok({ email: 'me@x.test' });
    if (u.includes('core_members?email=eq')) return ok([{ id: 'u1', email: 'me@x.test', doc: { name: 'Анна', status: 'active', role: 'analyst', clearance: 1 } }]);
    if (u.includes('core_settings')) return ok([{ value: false }]);
    if (u.includes('/storage/v1/')) { storageCalls.push([opts.method, u]); if (u.includes('/upload/sign/')) return ok({ url: `/object/upload/sign/vault/${u.split('/vault/')[1]}?token=t` }); if (u.includes('/object/sign/')) return ok({ signedURL: '/object/sign/vault/x?token=r' }); return ok({}); }
    if (opts.method === 'POST' && u.includes('vault_folders')) { const r = JSON.parse(opts.body); folders.set(r.id, r.doc); return ok(null); }
    if (opts.method === 'POST' && u.includes('vault_files')) { const r = JSON.parse(opts.body); files.set(r.id, r.doc); return ok(null); }
    if (opts.method === 'DELETE' && u.includes('vault_files?id=eq.')) { files.delete(u.split('id=eq.')[1]); return ok(null); }
    if (u.includes('vault_files?id=eq.')) { const id = u.split('id=eq.')[1].split('&')[0]; return ok(files.has(id) ? [{ doc: files.get(id) }] : []); }
    throw new Error(`unexpected ${opts.method || 'GET'} ${u}`);
  };
  const token = `x.${Buffer.from(JSON.stringify({ session_id: 's' })).toString('base64url')}.y`;
  const call = async (body) => { const r = await POST(new Request('https://app.test/api/files', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
  let POST;
  try {
    ({ POST } = await import(`../../api/files.js?t=${Date.now()}`));
    // above my clearance: refused before anything is stored
    assert.equal((await call({ op: 'sign', name: 'a.pdf', size: 10, clearance: 2, division: 'res' }))[0], 403);
    const [s1, sign] = await call({ op: 'sign', name: 'Звіт 2026.pdf', type: 'application/pdf', size: 1000, clearance: 1, division: 'res' });
    assert.equal(s1, 200);
    assert.match(sign.ref, /^att\/res\/x-[\w-]+\/[\w.-]+\.pdf$/);
    assert.match(sign.uploadUrl, /^https:\/\/sb\.test\/storage\/v1\/object\/upload\/sign\/vault\/att\/res\//);
    // commit: owner and folder set by the server, whatever the browser sent
    const [s2, c] = await call({ op: 'commit', meta: { id: sign.id, ref: sign.ref, name: 'Звіт 2026.pdf', clearance: 1, division: 'res', owner: 'someone-else', sealed: true } });
    assert.equal(s2, 200);
    assert.equal(c.meta.owner, 'u1');
    assert.equal(c.meta.sealed, false);
    assert.equal(c.meta.folder, 'f-att-res');
    assert.ok(folders.has('f-att-res'));
    // a forged ref is refused
    assert.equal((await call({ op: 'commit', meta: { id: 'x-1', ref: 'companies/../secret', clearance: 0, division: 'res' } }))[0], 400);
    // read: own card yes, a NOX card no
    const [s3, r] = await call({ op: 'url', id: sign.id });
    assert.equal(s3, 200);
    assert.match(r.url, /\/storage\/v1\/object\/sign\/vault\/x\?token=r$/);
    assert.equal((await call({ op: 'url', id: 'x-top' }))[0], 403);
    // remove: the author may
    assert.equal((await call({ op: 'remove', id: sign.id }))[0], 200);
    assert.ok(!files.has(sign.id));
    assert.ok(storageCalls.some(([m, u]) => m === 'DELETE' && u.endsWith('/object/vault')));
  } finally { globalThis.fetch = real; }
});
