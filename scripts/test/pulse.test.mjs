// Індекс тривожності: GDELT timelines → a daily 0–100 index, a trend continuation with a widening band,
// the platform's forecasts on the time line (within clearance), and the server's hourly cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeline, anxiety, project, levelOf, foresight, parseFeed, crisisShare, ownIndex, FEEDS, sharesByDay, parseGpr, gprIndex, GPR_URL } from '../../src/lib/pulse.js';

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

test('own measurement: feeds parsed, crisis share, index after a week', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Missile strike kills five]]></title><link>https://n.test/1</link><pubDate>Wed, 28 Oct 2026 10:00:00 GMT</pubDate></item>
    <item><title>Central bank holds rates</title><link>https://n.test/2</link><pubDate>Wed, 28 Oct 2026 09:00:00 GMT</pubDate></item>
    <item><title>Old war story</title><link>https://n.test/3</link><pubDate>Mon, 01 Jan 2024 09:00:00 GMT</pubDate></item>
    <item><title>No link</title></item></channel></rss>`;
  const items = parseFeed(xml, 'n.test');
  assert.equal(items.length, 3);
  const m = crisisShare(items, Date.parse('2026-10-28T12:00:00Z'));
  assert.equal(m.n, 2); assert.equal(m.share, 0.5); assert.equal(m.crisis[0].url, 'https://n.test/1');
  const atom = parseFeed('<feed><entry><title>Ceasefire talks</title><link href="https://a.test/x"/><updated>2026-10-28T08:00:00Z</updated></entry></feed>', 'a.test');
  assert.equal(atom[0].url, 'https://a.test/x');
  const many = [...Array.from({ length: 20 }, (_, i) => ({ title: i < 5 ? 'War update' : 'Markets', text: '', url: 'https://x.test', at: '2026-10-26T10:00:00Z' })), { title: 'War', text: '', url: 'https://x.test', at: '2026-10-27T10:00:00Z' }];
  assert.deepEqual(sharesByDay(many, Date.parse('2026-10-28T12:00:00Z')), { '2026-10-26': { share: 0.25, n: 20 } }); // days with too few items are left out
  const few = ownIndex({ '2026-10-27': { share: 0.33 }, '2026-10-28': { share: 0.5 } });
  assert.equal(few.length, 2); assert.equal(few[0].value, 50); assert.ok(few[1].value > 70); assert.ok(few[0].provisional);
  const days = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`2026-10-${String(i + 10).padStart(2, '0')}`, { share: i < 9 ? 0.3 + (i % 2) * 0.02 : 0.5 }]));
  const idx = ownIndex(days);
  assert.equal(idx.length, 10); assert.ok(!idx[0].provisional); assert.ok(idx.at(-1).value > 75);
});

test('server: own feeds always, GDELT one question at a time, kept between calls', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
  const docs = {};
  const asked = [];
  let gdeltDown = true;
  const real = globalThis.fetch;
  const rss = `<rss><item><title>Air strikes hit city</title><link>https://bbc.test/1</link><pubDate>${new Date().toUTCString()}</pubDate></item><item><title>Football results</title><link>https://bbc.test/2</link><pubDate>${new Date().toUTCString()}</pubDate></item></rss>`;
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.includes('/auth/v1/user')) return ok({ email: 'me@x.test' });
    if (u.includes('core_members?email=eq')) return ok([{ id: 'u1', email: 'me@x.test', doc: { status: 'active', clearance: 0 } }]);
    if (u.includes('core_settings')) return ok([{ value: false }]);
    if (u.includes('core_verified')) return ok([]);
    if (u.includes('kind=eq.pulse&id=eq.')) { const id = u.split('id=eq.')[1].split('&')[0]; return ok(docs[id] ? [{ doc: docs[id] }] : []); }
    if (u.includes('core_docs?on_conflict')) { const b = JSON.parse(opts.body); docs[b.id] = b.doc; return ok(null); }
    if (u.startsWith('https://api.gdeltproject.org/')) {
      asked.push(u.match(/mode=(\w+)/)[1]);
      if (gdeltDown) return new Response('Please limit requests to one every 5 seconds', { status: 429 });
      if (u.includes('artlist')) return ok({ articles: [{ title: 'G headline', url: 'https://g.test/a', domain: 'g.test' }] });
      return ok({ timeline: [{ data: Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.now() - (30 - i) * 86400000).toISOString().slice(0, 10).replace(/-/g, '') + 'T000000Z', value: u.includes('tone') ? -3 - (i % 4) * 0.3 : 1 + (i % 3) * 0.1 })) }] });
    }
    if (FEEDS.some((f) => u === f)) return new Response(rss, { status: 200 });
    throw new Error(`unexpected ${u}`);
  };
  const token = `x.${Buffer.from(JSON.stringify({ session_id: 's' })).toString('base64url')}.y`;
  try {
    const { GET, refresh } = await import('../../api/pulse.js');
    const call = async () => { const r = await GET(new Request('https://app.test/api/pulse', { headers: { authorization: `Bearer ${token}` } })); return [r.status, await r.json()]; };
    // GDELT refuses: the own measurement answers, provisional
    const [s1, d1] = await call();
    assert.equal(s1, 200); assert.equal(d1.source, 'feeds'); assert.equal(d1.index.length, 1); assert.ok(d1.provisional);
    assert.equal(d1.headlines[0].url, 'https://bbc.test/1'); // only crisis items
    assert.deepEqual(asked, ['timelinetone']);
    // within ten minutes nobody asks GDELT again
    await call();
    assert.equal(asked.length, 1);
    // later, GDELT answers one question per refresh; once tone and volume are in, its three months are shown
    gdeltDown = false;
    docs.gdelt.nextTry = null;
    let t = Date.now();
    for (let i = 0; i < 3; i++) { t += 7000; docs.gdelt.nextTry = null; await refresh(t); }
    assert.deepEqual(asked, ['timelinetone', 'timelinetone', 'timelinevol', 'artlist']);
    const done = await refresh(t + 7000);
    assert.equal(done.source, 'gdelt'); assert.equal(done.index.length, 30); assert.equal(done.headlines[0].url, 'https://g.test/a');
    assert.equal(asked.length, 4); // all fresh: nothing more asked
  } finally { globalThis.fetch = real; }
});

test('GPR: the daily series read in any date form, mapped to the panel scale', () => {
  const head = ['DAY', 'N10D', 'GPRD', 'GPRD_ACT', 'GPRD_THREAT', 'date', 'GPRD_MA7'];
  const rows = [['Geopolitical Risk Index'], head,
    ...Array.from({ length: 20 }, (_, i) => [19850101 + i, 30, 100, 90, 110, new Date(Date.UTC(1985, 0, 1 + i)), 100])];
  const a = parseGpr(rows);
  assert.equal(a.length, 20); assert.equal(a[0].date, '1985-01-01'); assert.equal(a[0].value, 100);
  const serial = parseGpr([['date', 'GPRD'], ...Array.from({ length: 12 }, (_, i) => [45000 + i, 200])]);
  assert.equal(serial[0].date, '2023-03-15');
  assert.deepEqual(parseGpr([['nothing']]), []);
  const idx = gprIndex([...Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-0${i + 1}`, value: 100 })), ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${10 + i}`, value: 200 }))]);
  assert.equal(idx[6].value, 50); assert.equal(idx[6].raw, 100);
  assert.equal(idx[13].value, 75); assert.equal(idx[13].raw, 200);
});

test('server: GPR first, read once a day from its .xls', async () => {
  const XLSX = await import('xlsx');
  const days = Array.from({ length: 60 }, (_, i) => new Date(Date.now() - (62 - i) * 86400000));
  const sheet = XLSX.utils.aoa_to_sheet([['DAY', 'GPRD', 'date'], ...days.map((d, i) => [Number(d.toISOString().slice(0, 10).replace(/-/g, '')), 100 + i * 3, d])]);
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
  const xls = XLSX.write(book, { type: 'buffer', bookType: 'biff8' });
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
  const docs = {};
  let gprAsked = 0;
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.includes('kind=eq.pulse&id=eq.')) { const id = u.split('id=eq.')[1].split('&')[0]; return ok(docs[id] ? [{ doc: docs[id] }] : []); }
    if (u.includes('core_docs?on_conflict')) { const b = JSON.parse(opts.body); docs[b.id] = b.doc; return ok(null); }
    if (u === GPR_URL) { gprAsked++; return new Response(xls, { status: 200 }); }
    if (u.startsWith('https://api.gdeltproject.org/')) return new Response('Please limit requests', { status: 429 });
    if (FEEDS.includes(u)) return new Response('<rss></rss>', { status: 200 });
    throw new Error(`unexpected ${u}`);
  };
  try {
    const { refresh } = await import(`../../api/pulse.js?gpr=${Date.now()}`);
    const r = await refresh(Date.now());
    assert.equal(r.source, 'gpr'); assert.equal(r.index.length, 60); assert.ok(!r.provisional);
    assert.ok(r.index.at(-1).value > r.index[0].value); assert.ok(r.index.at(-1).raw > 200);
    await refresh(Date.now() + 3600000);
    assert.equal(gprAsked, 1); // once a day
  } finally { globalThis.fetch = real; }
});
