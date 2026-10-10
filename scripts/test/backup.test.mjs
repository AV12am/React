// Резервна копія: round trip, a wrong passphrase fails, the weekly job writes to Storage and keeps 8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup } from '../../scripts/lib/backup.mjs';

test('encrypt → decrypt; wrong key and tampering are refused', () => {
  const obj = { tables: { core_docs: [{ kind: 'records', id: 'r1', doc: { title: 'Таємне' } }] } };
  const enc = encryptBackup(obj, 'довга-фраза-для-копій-2026');
  assert.ok(!enc.includes(Buffer.from('Таємне')));
  assert.deepEqual(decryptBackup(enc, 'довга-фраза-для-копій-2026'), obj);
  assert.throws(() => decryptBackup(enc, 'інша-фраза-для-копій-2026'));
  const bad = Buffer.from(enc); bad[bad.length - 1] ^= 1;
  assert.throws(() => decryptBackup(bad, 'довга-фраза-для-копій-2026'));
  assert.throws(() => encryptBackup(obj, 'коротка'), /16 символів/);
});

test('weekly job: all tables, upload, keep the last 8', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', CRON_SECRET: 'cs', BACKUP_KEY: 'довга-фраза-для-копій-2026' });
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    calls.push([opts.method || 'GET', u, opts.body]);
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.includes('/rest/v1/core_docs?select')) return ok([{ kind: 'records', id: 'r1', doc: { title: 'x' } }]);
    if (u.includes('/rest/v1/') && (opts.method || 'GET') === 'GET') return ok([]);
    if (u.includes('/storage/v1/object/list/')) return ok(Array.from({ length: 10 }, (_, i) => ({ name: `rc-2026-0${i}-01.json.enc` })));
    return ok(null);
  };
  try {
    const { GET } = await import(`../../api/backup.js?t=${Date.now()}`);
    const res = await GET(new Request('https://app.test/api/backup', { headers: { authorization: 'Bearer cs' } }));
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.match(body.name, /^backups\/rc-\d{4}-\d{2}-\d{2}\.json\.enc$/);
    assert.equal(body.counts.core_docs, 1);
    assert.ok(calls.some(([m, u]) => m === 'POST' && u.includes('/storage/v1/object/vault/backups/rc-')));
    assert.ok(calls.some(([m, u]) => m === 'GET' && u.includes('kind=not.in.(push,session)')));
    const del = calls.find(([m, u]) => m === 'DELETE' && u.includes('/storage/v1/object/vault'));
    assert.equal(JSON.parse(del[2]).prefixes.length, 2);
  } finally { globalThis.fetch = real; }
});
