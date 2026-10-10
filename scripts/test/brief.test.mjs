// Ранковий бриф: sections, clearance, e-mail redaction, and the cron handler end to end with mocked services.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBrief, briefHtml } from '../../src/lib/brief.js';

const NOW = Date.parse('2026-10-10T05:00:00Z');
const RECS = [
  { id: 'w-list-orgs-sanctions', div: 'int', col: 'watchlists', name: 'Організації — санкції', terms: 'Укрзалізниця; 40075815', clearance: 0 },
  { id: 'org-40075815', div: 'int', col: 'orgs', name: 'Укрзалізниця', clearance: 0, at: '2026-01-01', updated: '2026-10-09T20:00:00Z' },
  { id: 'a1', div: 'int', col: 'intake', title: 'Санкційний збіг', origin: 'auto', watchlist: 'w-list-orgs-sanctions', org: 'org-40075815', at: '2026-10-09T06:00:00Z', clearance: 0 },
  { id: 'a2', div: 'int', col: 'intake', title: 'Таємне надходження', at: '2026-10-09T07:00:00Z', clearance: 2 },
  { id: 'a3', div: 'int', col: 'intake', title: 'Старе', at: '2026-10-01T07:00:00Z', clearance: 0 },
  { id: 'j1', div: 'ana', col: 'judgments', statement: 'Ціни зростуть', kind: 'Прогноз', due: '2026-10-09', clearance: 1 },
  { id: 'p1', div: 'ana', col: 'products', title: 'Довідка', stage: 'Чернетка', due: '2026-10-11', clearance: 0 },
  { id: 'p2', div: 'ana', col: 'products', title: 'Видана', stage: 'Видано', due: '2026-10-11', clearance: 0 },
];
const sec = (b, id) => b.sections.find((s) => s.id === id);

test('sections pick the right records; old and finished ones stay out', () => {
  const b = buildBrief({ records: RECS, me: { id: 'u', role: 'analyst', clearance: 2 }, now: NOW });
  assert.deepEqual(sec(b, 'watch').items.map((i) => i.id), ['a1']);
  assert.deepEqual(sec(b, 'intake').items.map((i) => i.id), ['a2']);
  assert.equal(sec(b, 'due').items[0].id, 'j1');
  assert.match(sec(b, 'due').items[0].note, /настала/);
  assert.deepEqual(sec(b, 'deadlines').items.map((i) => i.id), ['p1']);
  assert.equal(sec(b, 'orgs').total, 2);
  assert.equal(sec(b, 'requests'), undefined); // only for those who decide
});

test('a reader never sees records above their clearance', () => {
  const b = buildBrief({ records: RECS, me: { id: 'u', role: 'analyst', clearance: 0 }, now: NOW });
  assert.equal(sec(b, 'intake').total, 0);
  assert.equal(sec(b, 'due').total, 0);
});

test('e-mail: titles above LUMEN are not named', () => {
  const b = buildBrief({ records: RECS, me: { id: 'u', role: 'admin', clearance: 2 }, now: NOW, nameUpTo: 0 });
  const html = briefHtml(b, { name: 'Адмін' });
  assert.ok(html.includes('Санкційний збіг'));
  assert.ok(!html.includes('Таємне надходження'));
  assert.ok(!html.includes('Ціни зростуть'));
  assert.ok(html.includes('запис вищого грифа'));
});

test('cron: sends one letter per active member with news, respects opt-out', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', RESEND_API_KEY: 're', BRIEF_FROM: 'RC <b@x.test>', CRON_SECRET: 'cs' });
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const ok = (body) => new Response(JSON.stringify(body), { status: 200 });
    if (u.includes('core_members')) return ok([
      { id: 'u1', email: 'a@x.test', doc: { status: 'active', role: 'admin', clearance: 2, name: 'Анна' } },
      { id: 'u2', email: 'b@x.test', doc: { status: 'active', role: 'analyst', clearance: 0, brief: false } },
      { id: 'u3', email: 'c@x.test', doc: { status: 'suspended', clearance: 2 } },
    ]);
    if (u.includes('core_docs')) return ok(RECS.map((doc) => ({ kind: 'records', doc })));
    if (u.includes('api.resend.com')) { sent.push(JSON.parse(opts.body)); return ok({ id: 'm1' }); }
    throw new Error(`unexpected ${u}`);
  };
  try {
    const { GET } = await import(`../../api/brief.js?t=${Date.now()}`);
    const denied = await GET(new Request('https://app.test/api/brief'));
    assert.equal(denied.status, 401);
    const res = await GET(new Request('https://app.test/api/brief', { headers: { authorization: 'Bearer cs' } }));
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.sent, 1);
    assert.deepEqual(sent[0].to, ['a@x.test']);
    assert.match(sent[0].subject, /Ранковий бриф/);
    assert.ok(!sent[0].html.includes('Таємне надходження'));
  } finally { globalThis.fetch = realFetch; }
});
