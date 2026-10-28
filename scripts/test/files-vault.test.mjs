// The Vault through api/files.js: bodies signed for the caller, cards filed under the caller, nothing above
// one's clearance listed, filed or put in a folder above it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Vault through the files API', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
  const files = new Map([
    ['x-top', { id: 'x-top', ref: 'vault/x-top/a.pdf', clearance: 2, owner: 'u9', folder: 'f-1' }],
    ['x-seal', { id: 'x-seal', ref: 'vault/x-seal/b.pdf', clearance: 1, sealed: true, owner: 'u9', text: 'секрет', folder: 'f-1' }],
  ]);
  const folders = new Map([['f-1', { id: 'f-1', name: 'Спільне', clearance: 0 }], ['f-top', { id: 'f-top', name: 'Вище', clearance: 2 }]]);
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.includes('vault_files?select=size')) return new Response(JSON.stringify([...files.values()].map((d) => ({ size: d.size, store: d.store }))));
    if (u.includes('/auth/v1/user')) return ok({ email: 'me@x.test' });
    if (u.includes('core_members?email=eq')) return ok([{ id: 'u1', email: 'me@x.test', doc: { name: 'Анна', status: 'active', role: 'analyst', clearance: 1 } }]);
    if (u.includes('core_settings')) return ok([{ value: false }]);
    if (u.includes('/upload/sign/')) return ok({ url: `/object/upload/sign/vault/${u.split('/vault/')[1]}?token=t` });
    if (opts.method === 'POST' && u.includes('vault_folders')) { const r = JSON.parse(opts.body); if (!folders.has(r.id)) folders.set(r.id, r.doc); return ok(null); }
    if (opts.method === 'POST' && u.includes('vault_files')) { const r = JSON.parse(opts.body); files.set(r.id, r.doc); return ok(null); }
    if (u.includes('vault_folders?id=eq.')) { const id = u.split('id=eq.')[1].split('&')[0]; return ok(folders.has(id) ? [{ doc: folders.get(id) }] : []); }
    if (u.includes('vault_files?id=eq.')) { const id = u.split('id=eq.')[1].split('&')[0]; return ok(files.has(id) ? [{ doc: files.get(id) }] : []); }
    if (u.includes('vault_files?select=doc')) return ok([...files.values()].map((doc) => ({ doc })));
    if (u.includes('vault_folders?select=doc')) return ok([...folders.values()].map((doc) => ({ doc })));
    throw new Error(`unexpected ${opts.method || 'GET'} ${u}`);
  };
  const token = `x.${Buffer.from(JSON.stringify({ session_id: 's' })).toString('base64url')}.y`;
  try {
    const { POST } = await import('../../api/files.js');
    const call = async (body) => { const r = await POST(new Request('https://app.test/api/files', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
    // a Vault body: the browser's id, its own directory, nothing climbing out
    const [s1, sign] = await call({ op: 'sign', id: 'x-new1', dir: '../companies/12345678', name: 'Логотип.png', type: 'image/png', size: 10, clearance: 1 });
    assert.equal(s1, 200);
    assert.match(sign.ref, /^companies\/12345678\/x-new1\/[\w.-]+\.png$/);
    assert.equal(sign.store, 'supabase');
    assert.equal((await call({ op: 'sign', id: 'x-top', dir: 'vault', name: 'a', size: 1 }))[0], 409);
    // filed under the caller, whatever the browser says
    const meta = { id: 'x-new1', ref: sign.ref, name: 'Логотип.png', clearance: 1, folder: 'f-1', owner: 'u9', at: '2000-01-01' };
    const [s2, filed] = await call({ op: 'index', meta });
    assert.equal(s2, 200);
    assert.equal(filed.meta.owner, 'u1');
    assert.notEqual(filed.meta.at, '2000-01-01');
    // an update keeps owner and address; lowering is fine, above my clearance is not
    const [, upd] = await call({ op: 'index', meta: { ...meta, ref: 'vault/x-new1/other.png', clearance: 0, owner: 'u9' } });
    assert.equal(upd.meta.ref, sign.ref); assert.equal(upd.meta.owner, 'u1'); assert.equal(upd.meta.clearance, 0);
    assert.equal((await call({ op: 'index', meta: { ...meta, clearance: 2 } }))[0], 403);
    assert.equal((await call({ op: 'index', meta: { id: 'x-top', ref: 'vault/x-top/a.pdf', clearance: 0 } }))[0], 403); // someone else's card above me
    assert.equal((await call({ op: 'index', meta: { ...meta, id: 'x-n2', ref: 'vault/x-n2/a.png', folder: 'f-top' } }))[0], 403);
    assert.equal((await call({ op: 'index', meta: { ...meta, id: 'x-n3', ref: 'vault/other/a.png' } }))[0], 400);
    // list: nothing above my clearance; a sealed card without its text
    const [, list] = await call({ op: 'list' });
    assert.deepEqual(list.files.map((f) => f.id).sort(), ['x-new1', 'x-seal']);
    assert.equal(list.files.find((f) => f.id === 'x-seal').text, undefined);
    assert.equal(list.folders.length, 2);
    // folders
    assert.equal((await call({ op: 'folder', folder: { id: 'f-2', name: 'Нова', clearance: 2 } }))[0], 403);
    assert.equal((await call({ op: 'folder', folder: { id: 'f-2', name: 'Нова', clearance: 1 } }))[0], 200);
    assert.ok(folders.has('f-2'));
    assert.equal((await call({ op: 'info' }))[1].store, 'supabase');
  } finally { globalThis.fetch = real; }
});
