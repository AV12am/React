// CONTEXT News: feeds with thumbnails, four fresh items a section, summaries from the item's own text only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, parseNewsFeed, pickItems, pageImage, summaryPrompt, readSummaries, itemImage } from '../../src/lib/news.js';

const RSS = `<rss xmlns:media="http://search.yahoo.com/mrss/"><channel>
<item><title>Talks resume in Geneva</title><link>https://www.bbc.co.uk/news/1</link><pubDate>Fri, 30 Oct 2026 08:00:00 GMT</pubDate>
<description><![CDATA[<p>Delegations met for the first time since March.</p>]]></description><media:thumbnail width="240" url="https://ichef.bbci.co.uk/a.jpg"/></item>
<item><title>Port reopens</title><link>https://www.theguardian.com/world/2</link><pubDate>Fri, 30 Oct 2026 07:00:00 GMT</pubDate>
<media:content url="https://i.guim.co.uk/b.jpg" medium="image" width="460"/></item>
<item><title>Budget passed</title><link>https://www.ukrinform.ua/3</link><pubDate>Fri, 30 Oct 2026 06:00:00 GMT</pubDate><enclosure url="https://static.ukrinform.com/c.jpg" type="image/jpeg" length="1"/></item>
<item><title>Analysis without a picture</title><link>https://www.atlanticcouncil.org/4</link><pubDate>Fri, 30 Oct 2026 05:00:00 GMT</pubDate>
<content:encoded><![CDATA[<p><img src="https://www.atlanticcouncil.org/d.png" /> Text</p>]]></content:encoded></item>
<item><title>Old news</title><link>https://www.bbc.co.uk/news/5</link><pubDate>Mon, 20 Oct 2026 08:00:00 GMT</pubDate></item>
</channel></rss>`;

test('three sections, each with its own sources', () => {
  assert.equal(SECTIONS.length, 3);
  for (const s of SECTIONS) assert.ok(s.feeds.length >= 2 && s.feeds.every((u) => u.startsWith('https://')), s.id);
});

test('feeds give title, link, date, text and the thumbnail in any of its forms', () => {
  const items = parseNewsFeed(RSS);
  assert.equal(items.length, 5);
  assert.deepEqual(items.map((x) => x.image), ['https://ichef.bbci.co.uk/a.jpg', 'https://i.guim.co.uk/b.jpg', 'https://static.ukrinform.com/c.jpg', 'https://www.atlanticcouncil.org/d.png', '']);
  assert.equal(items[0].text, 'Delegations met for the first time since March.');
  assert.equal(items[0].domain, 'bbc.co.uk');
  assert.equal(itemImage('<item><media:content url="javascript:alert(1)" medium="image"/></item>'), '');
});

test('four freshest, pictures first, no older than two days, a source at most twice', () => {
  const now = Date.parse('2026-10-30T10:00:00Z');
  const items = parseNewsFeed(RSS);
  const many = [...items, ...[6, 7, 8].map((n) => ({ title: `BBC ${n}`, url: `https://www.bbc.co.uk/news/${n}`, domain: 'bbc.co.uk', at: '2026-10-30T09:00:00Z', image: 'https://x/p.jpg' }))];
  const pick = pickItems(many, now);
  assert.equal(pick.length, 4);
  assert.ok(!pick.some((x) => x.title === 'Old news'));
  assert.ok(pick.filter((x) => x.domain === 'bbc.co.uk').length <= 2);
  assert.ok(pick.every((x) => x.image));
});

test('the page’s own preview picture when the feed has none', () => {
  assert.equal(pageImage('<head><meta property="og:image" content="https://site/x.jpg"></head>'), 'https://site/x.jpg');
  assert.equal(pageImage('<meta content="https://site/y.jpg" property="og:image">'), 'https://site/y.jpg');
  assert.equal(pageImage('<p>nothing</p>'), '');
});

test('summaries: asked from the items’ own text; missing ones fall back to that text, never invented', () => {
  const items = [{ title: 'A', text: 'First item text that is long enough.' }, { title: 'B', text: '' }];
  const msgs = summaryPrompt(items);
  assert.match(msgs[0].content, /ЛИШЕ на наданий заголовок і текст/);
  assert.match(msgs[1].content, /1\. A\nFirst item/);
  const s = readSummaries('{"summaries": ["Перша новина: делегації зустрілися вперше з березня."]}', items);
  assert.equal(s[0].ai, true);
  assert.equal(s[1].ai, false); assert.equal(s[1].text, 'B');
  assert.deepEqual(readSummaries('not json', items).map((x) => x.ai), [false, false]);
});

test('server: an issue of three sections with summaries, kept an hour; only the issue’s own pictures are passed on', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', CF_AI_TOKEN: 'cf', CF_ACCOUNT_ID: 'acc' });
  const docs = {};
  let ai = 0;
  const real = globalThis.fetch;
  const now = new Date().toUTCString();
  const rss = (host) => `<rss xmlns:media="m"><item><title>${host} one</title><link>https://${host}/1</link><pubDate>${now}</pubDate><description>Text one.</description><media:thumbnail url="https://img.${host}/1.jpg"/></item>
    <item><title>${host} two</title><link>https://${host}/2</link><pubDate>${now}</pubDate><description>Text two.</description></item></rss>`;
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.includes('/auth/v1/user')) return ok({ email: 'me@x.test' });
    if (u.includes('core_members?email=eq')) return ok([{ id: 'u1', email: 'me@x.test', doc: { status: 'active', clearance: 0 } }]);
    if (u.includes('core_settings')) return ok([{ value: false }]);
    if (u.includes('core_verified')) return ok([]);
    if (u.includes('kind=eq.news&id=eq.issue')) return ok(docs.issue ? [{ doc: docs.issue }] : []);
    if (u.includes('core_docs?on_conflict')) { const b = JSON.parse(opts.body); docs[b.id] = b.doc; return ok(null); }
    if (u.includes('api.cloudflare.com')) { ai++; const n = (JSON.parse(opts.body).messages[1].content.match(/^\d+\./gm) || []).length; return ok({ success: true, result: { response: JSON.stringify({ summaries: Array.from({ length: n }, (_, i) => `Стислий виклад новини номер ${i + 1}.`) }) } }); }
    if (u.startsWith('https://img.')) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    const feed = SECTIONS.flatMap((s) => s.feeds).find((f) => f === u);
    if (feed) return new Response(rss(new URL(feed).hostname), { status: 200 });
    // article pages (og:image for items without a thumbnail)
    return new Response('<html><head><meta property="og:image" content="https://img.page/og.jpg"></head></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const token = `x.${Buffer.from(JSON.stringify({ session_id: 's' })).toString('base64url')}.y`;
  const call = (q = '') => import(`../../api/pulse.js?t=${Date.now()}`).then(({ GET }) => GET(new Request(`https://app.test/api/pulse?news=1${q.replace(/^\?/, '&')}`, { headers: { authorization: `Bearer ${token}` } })));
  try {
    const r = await call();
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.deepEqual(j.sections.map((s) => s.id), ['world', 'ukraine', 'analysis']);
    for (const s of j.sections) {
      assert.equal(s.items.length, 4);
      assert.ok(s.items.every((x) => x.image && x.summary && x.ai));
    }
    assert.equal(ai, 3);
    const again = await (await call()).json(); // within the hour: the kept issue, the model not asked again
    assert.equal(again.at, j.at); assert.equal(ai, 3);
    const pic = j.sections[0].items.find((x) => x.image).image;
    assert.equal((await call(`?img=${encodeURIComponent(pic)}`)).status, 200);
    assert.equal((await call(`?img=${encodeURIComponent('https://evil.test/x.jpg')}`)).status, 404);
    assert.equal((await import(`../../api/pulse.js?u=${Date.now()}`).then(({ GET }) => GET(new Request('https://app.test/api/pulse?news=1')))).status, 401);
  } finally { globalThis.fetch = real; }
});
