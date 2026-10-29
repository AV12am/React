// Індекс тривожності: GDELT timelines → a daily 0–100 index, a trend continuation with a widening band,
// the platform's forecasts on the time line (within clearance), and the server's hourly cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeline, anxiety, project, levelOf, foresight } from '../../src/lib/pulse.js';

const days = (n, f) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 1) + i * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
  return { date: `${d}T000000Z`, value: f(i) };
});

test('index: tone and volume → 0–100, 50 is the usual level, worse news is higher', () => {
  const tone = timeline({ timeline: [{ data: [...days(60, () => -3), ...days(60, () => -3).map((p) => ({ ...p, date: p.date.replace('T000000Z', 'T120000Z') }))] }] });
  assert.equal(tone.length, 60); // two points a day → one
  const calm = Array.from({ length: 60 }, (_, i) => (i < 50 ? -2.5 - (i % 3) * 0.1 : -5));
  const vol = Array.from({ length: 60 }, (_, i) => (i < 50 ? 1 + (i % 2) * 0.05 : 2));
  const idx = anxiety(timeline({ timeline: [{ data: days(60, (i) => calm[i]) }] }), timeline({ timeline: [{ data: days(60, (i) => vol[i]) }] }));
  assert.equal(idx.length, 60);
  assert.ok(idx.every((p) => p.value >= 0 && p.value <= 100));
  assert.ok(idx.at(-1).value > 75, `last ${idx.at(-1).value}`);
  assert.ok(idx[10].value < 50);
  assert.equal(levelOf(idx.at(-1).value).id, 'high');
  assert.deepEqual(anxiety([], []), []);
});

test('trend continuation: straight on, the band widens', () => {
  const s = Array.from({ length: 20 }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10), value: 40 + i + (i % 2) }));
  const a = project(s, 14);
  assert.equal(a.length, 14);
  assert.equal(a[0].date, '2026-10-21');
  assert.ok(a[13].value > a[0].value);
  assert.ok(a[13].hi - a[13].lo > a[0].hi - a[0].lo);
  assert.ok(a.every((p) => p.value <= 100 && p.lo >= 0));
});

test('foresight: open forecasts ahead, resolved ones behind, nothing above clearance', () => {
  const recs = [
    { id: 'j1', col: 'judgments', kind: 'Прогноз', statement: 'Ціни зростуть', probability: 70, due: '2026-11-20', outcome: 'Відкрито', clearance: 0 },
    { id: 'j2', col: 'judgments', kind: 'Прогноз', statement: 'Угода буде', probability: 30, due: '2026-10-01', outcome: 'Не сталося', resolvedAt: '2026-10-02T10:00:00Z', clearance: 0 },
    { id: 'j3', col: 'judgments', kind: 'Прогноз', statement: 'NOX', probability: 50, due: '2026-11-01', clearance: 2 },
    { id: 'p1', col: 'products', title: 'Бриф', due: '2026-11-05', stage: 'Чернетка', clearance: 0 },
    { id: 'j4', col: 'judgments', kind: 'Оцінка', statement: 'не прогноз', due: '2026-11-01', clearance: 0 },
  ];
  const m = foresight(recs, { clearance: 1 });
  assert.deepEqual(m.map((x) => [x.id, x.kind, x.date]), [['j2', 'resolved', '2026-10-02'], ['p1', 'due', '2026-11-05'], ['j1', 'risk', '2026-11-20']]);
});

test('server: GDELT asked once an hour for the team, last known index if GDELT fails', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
  let cache = null;
  let gdelt = 0;
  let down = false;
  const real = globalThis.fetch;
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => realTimeout(fn, 0); // no 5-second pauses in the test
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.includes('/auth/v1/user')) return ok({ email: 'me@x.test' });
    if (u.includes('core_members?email=eq')) return ok([{ id: 'u1', email: 'me@x.test', doc: { status: 'active', clearance: 0 } }]);
    if (u.includes('core_settings')) return ok([{ value: false }]);
    if (u.includes('core_verified')) return ok([]);
    if (u.includes('kind=eq.pulse')) return ok(cache ? [{ doc: cache }] : []);
    if (u.includes('core_docs?on_conflict')) { cache = JSON.parse(opts.body).doc; return ok(null); }
    if (u.startsWith('https://api.gdeltproject.org/')) {
      gdelt++;
      if (down) return new Response('Please limit requests', { status: 429 });
      if (u.includes('mode=artlist')) return ok({ articles: [{ title: 'Headline', url: 'https://news.test/a', domain: 'news.test', sourcecountry: 'UK' }] });
      return ok({ timeline: [{ data: days(30, (i) => (u.includes('timelinetone') ? -3 - (i % 5) * 0.2 : 1 + (i % 3) * 0.1)) }] });
    }
    throw new Error(`unexpected ${u}`);
  };
  const token = `x.${Buffer.from(JSON.stringify({ session_id: 's' })).toString('base64url')}.y`;
  try {
    const { GET } = await import('../../api/pulse.js');
    const call = async () => { const r = await GET(new Request('https://app.test/api/pulse', { headers: { authorization: `Bearer ${token}` } })); return [r.status, await r.json()]; };
    const [s1, d1] = await call();
    assert.equal(s1, 200); assert.equal(d1.index.length, 30); assert.equal(d1.headlines[0].domain, 'news.test');
    assert.equal(gdelt, 3);
    await call();
    assert.equal(gdelt, 3); // from the hour's cache
    cache.at = new Date(Date.now() - 2 * 3600000).toISOString();
    down = true;
    const [s3, d3] = await call();
    assert.equal(s3, 200); assert.equal(d3.stale, true); assert.equal(d3.index.length, 30);
  } finally { globalThis.fetch = real; globalThis.setTimeout = realTimeout; }
});
