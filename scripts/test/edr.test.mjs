// Зміни в ЄДР: normalising the API answer, the difference, the intake item and the daily targets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEdr, diffEdr, edrIntake, edrTargets, edrUrl } from '../../scripts/lib/edr.mjs';

const A = [{ full_name: 'АТ «УКРАЇНСЬКА ЗАЛІЗНИЦЯ»', status: 'зареєстровано', ceo_name: 'Іваненко І. І.', location: 'м. Київ, вул. Єжи Гедройця, 5', activities: [{ name: 'Діяльність залізничного транспорту', is_primary: true }], beneficiaries: [{ title: 'Кабінет Міністрів України', capital: 100 }] }];

test('normalise: list or object, primary activity, owners sorted', () => {
  const n = normalizeEdr(A);
  assert.equal(n.head, 'Іваненко І. І.');
  assert.equal(n.activity, 'Діяльність залізничного транспорту');
  assert.deepEqual(n.owners, ['Кабінет Міністрів України · 100']);
  assert.equal(normalizeEdr(A[0]).name, n.name);
  assert.equal(normalizeEdr({ data: A[0] }).name, n.name);
});

test('diff: baseline gives nothing; a new head is one change', () => {
  const a = normalizeEdr(A);
  assert.deepEqual(diffEdr(null, a), []);
  const b = { ...a, head: 'Петренко П. П.' };
  const d = diffEdr(a, b);
  assert.deepEqual(d.map((x) => [x.label, x.from, x.to]), [['Керівник', 'Іваненко І. І.', 'Петренко П. П.']]);
  const item = edrIntake({ id: 'org-40075815', name: 'Укрзалізниця', code: '40075815', clearance: 0 }, d, { now: new Date('2026-10-10T05:00:00Z') });
  assert.match(item.title, /змінено керівник/);
  assert.equal(item.org, 'org-40075815');
  assert.equal(item.id, edrIntake({ id: 'org-40075815', name: 'Укрзалізниця', code: '40075815' }, d).id); // same change → same id
});

test('targets: watched or related companies with a code, least recently checked first', () => {
  const recs = [
    { id: 'w-list-orgs-media', col: 'watchlists', terms: 'Укрзалізниця' },
    { id: 'o1', col: 'orgs', name: 'Укрзалізниця', code: '40075815', edr: { checked: '2026-10-09' } },
    { id: 'o2', col: 'orgs', name: 'Нова пошта', code: '31316718', relation: 'Постачальник' },
    { id: 'o3', col: 'orgs', name: 'Інша', code: '12345678', relation: 'Немає' },
  ];
  assert.deepEqual(edrTargets(recs).map((r) => r.id), ['o2', 'o1']);
  assert.equal(edrUrl('40075815', { key: 'k' }), 'https://opendatabot.com/api/v2/company/40075815?apiKey=k');
});

test('daily job: snapshot stored, change filed as intake', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', CRON_SECRET: 'cs', EDR_API_KEY: 'k' });
  const prev = normalizeEdr(A);
  const writes = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.includes('opendatabot.com')) return ok([{ ...A[0], ceo_name: 'Петренко П. П.' }]);
    if (opts.method === 'PATCH' || opts.method === 'POST') { writes.push([opts.method, u, JSON.parse(opts.body)]); return ok(null); }
    if (u.includes('col=in.(orgs,watchlists)')) return ok([{ doc: { id: 'org-40075815', div: 'int', col: 'orgs', name: 'Укрзалізниця', code: '40075815', relation: 'Партнер', clearance: 0, edr: { checked: '2026-10-01', data: prev } } }]);
    if (u.includes('core_docs')) return ok([]);
    throw new Error(`unexpected ${u}`);
  };
  try {
    const { GET } = await import(`../../api/watch.js?t=${Date.now()}`);
    const res = await GET(new Request('https://app.test/api/watch', { headers: { authorization: 'Bearer cs' } }));
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.deepEqual([body.edr.checked, body.edr.changed], [1, 1]);
    const patch = writes.find(([m, u]) => m === 'PATCH' && u.includes('org-40075815'));
    assert.equal(patch[2].doc.edr.data.head, 'Петренко П. П.');
    const intake = writes.find(([m, , b]) => m === 'POST' && Array.isArray(b) && b[0]?.doc?.col === 'intake');
    assert.match(intake[2][0].doc.summary, /Керівник: Іваненко І\. І\. → Петренко П\. П\./);
  } finally { globalThis.fetch = real; }
});
