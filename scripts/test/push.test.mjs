// Push: subscriptions stored out of everyone's reach; sending skips suspended members and forgets dead devices.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('push API: subscribe, send to colleagues, forget a gone device', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', VAPID_PUBLIC_KEY: 'BOr6xV3qaD3Lj_2lM1JQh-hZ5V9y3Qq6tC9t3m6XyA7rTq1w2bG8k2yCzDJkqQk0P5Zp3QwXbqgGz4b9yH8VhTg', VAPID_PRIVATE_KEY: 'x', VAPID_SUBJECT: 'mailto:a@b.test' });
  const { default: webpush } = await import('web-push');
  const sent = [];
  webpush.setVapidDetails = () => {};
  webpush.sendNotification = async (sub, payload) => { if (sub.endpoint.includes('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 }); sent.push([sub.endpoint, JSON.parse(payload)]); };
  const store = new Map([['u2', { id: 'u2', clearance: 99, subs: [{ endpoint: 'https://push.test/a', keys: { p256dh: 'p', auth: 'a' } }, { endpoint: 'https://push.test/gone', keys: { p256dh: 'p', auth: 'a' } }] }]]);
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.includes('/auth/v1/user')) return ok({ email: 'me@x.test' });
    if (u.includes('core_members?email=eq')) return ok([{ id: 'u1', email: 'me@x.test', doc: { name: 'Анна', status: 'active' } }]);
    if (u.includes('core_settings')) return ok([{ value: false }]);
    if (u.includes('core_members?id=in')) return ok([{ id: 'u2', doc: { status: 'active' } }, { id: 'u3', doc: { status: 'suspended' } }]);
    if (u.includes('kind=eq.push&id=in')) { const ids = u.split('id=in.(')[1].split(')')[0].split(',').map((x) => x.replace(/"/g, '')); return ok([...store.values()].filter((d) => ids.includes(d.id)).map((doc) => ({ id: doc.id, doc }))); }
    if (u.includes('kind=eq.push&id=eq.')) { const id = u.split('id=eq.')[1].split('&')[0]; return ok(store.has(id) ? [{ doc: store.get(id) }] : []); }
    if (opts.method === 'POST' && u.includes('core_docs?on_conflict')) { for (const r of JSON.parse(opts.body)) store.set(r.id, r.doc); return ok(null); }
    throw new Error(`unexpected ${u}`);
  };
  const token = `x.${Buffer.from(JSON.stringify({ session_id: 's' })).toString('base64url')}.y`;
  const call = (body) => POST(new Request('https://app.test/api/push', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
  let POST;
  try {
    ({ POST } = await import(`../../api/push.js?t=${Date.now()}`));
    const r1 = await call({ subscribe: { endpoint: 'https://push.test/me', keys: { p256dh: 'p', auth: 'a' } } });
    assert.equal(r1.status, 200);
    assert.equal(store.get('u1').clearance, 99);
    assert.equal(store.get('u1').subs.length, 1);
    const r2 = await call({ to: ['u2', 'u3', 'u1'], title: 'Тест', body: 'Привіт', url: '#/overview' });
    assert.equal((await r2.json()).sent, 1);
    assert.deepEqual(sent.map(([e]) => e), ['https://push.test/a']);
    assert.equal(sent[0][1].url, '/#/overview');
    assert.equal(store.get('u2').subs.length, 1); // the gone device is forgotten
  } finally { globalThis.fetch = real; }
});
