// CONTEXT News: feeds with thumbnails, four or five items a section, summaries from the item's own text only,
// one issue a day at 17:00 Kyiv.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kyivDay, findReport, composeReport, SECTIONS, parseNewsFeed, pickItems, pageImage, summaryPrompt, readSummaries, itemImage, issueTime, fitItems, readPick, keyPrompt, readKeep, keepPrompt, readEvents, eventsPrompt, sameEvents, dropRepeats, checkGroups } from '../../src/lib/news.js';

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

test('the issue’s structure: key news first, then chapters 2–5, each subsection with its own sources', () => {
  assert.deepEqual(SECTIONS.map((s) => (s.title || s.part).split(' ')[0] === 'РОЗДІЛ' ? s.part.split(' |')[0] : s.title.split(' ')[0]),
    ['РОЗДІЛ 1', '2.1', '2.2', 'РОЗДІЛ 3', '4.1', '4.2', '5.1', '5.2']);
  assert.ok(SECTIONS[0].key && !SECTIONS[0].feeds.length);
  for (const s of SECTIONS.slice(1)) assert.ok(s.feeds.length >= 3 && s.feeds.every((u) => u.startsWith('https://')), s.id);
});

test('an issue a day: the latest 17:00 in Kyiv, in winter and in summer time', () => {
  assert.equal(new Date(issueTime(Date.parse('2026-10-31T14:59:00Z'))).toISOString(), '2026-10-30T15:00:00.000Z'); // 16:59 EET
  assert.equal(new Date(issueTime(Date.parse('2026-10-31T15:00:00Z'))).toISOString(), '2026-10-31T15:00:00.000Z'); // 17:00 EET
  assert.equal(new Date(issueTime(Date.parse('2026-07-01T14:30:00Z'))).toISOString(), '2026-07-01T14:00:00.000Z'); // 17:30 EEST
  assert.equal(new Date(issueTime(Date.parse('2026-07-01T00:30:00Z'))).toISOString(), '2026-06-30T14:00:00.000Z'); // 03:30 EEST
});

test('four news always, a fifth only when it fits the page', () => {
  const short = Array.from({ length: 6 }, () => ({ summary: 'x'.repeat(200) }));
  const long = Array.from({ length: 6 }, () => ({ summary: 'x'.repeat(560) }));
  assert.equal(fitItems(short).length, 5);
  assert.equal(fitItems(long).length, 4);
  assert.equal(fitItems(short.slice(0, 3)).length, 3);
});

test('key news: the model’s choice, filled up from each section’s first news when it gives too few', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ title: `N${i}` }));
  assert.match(keyPrompt(items)[1].content, /^1\. N0\n2\. N1/);
  assert.deepEqual(readPick('{"pick":[3,3,1,99]}', items, 5, [0, 4, 6, 2, 7]), [2, 0, 4, 6, 7]);
  assert.deepEqual(readPick('nonsense', items, 3, [5, 1, 7]), [5, 1, 7]);
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
  const pick = pickItems(many, now, 4, 2);
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

test('server: an issue of eight sections with summaries, kept until 17:00; only the issue’s own pictures are passed on', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', CF_AI_TOKEN: 'cf', CF_ACCOUNT_ID: 'acc' });
  const docs = {};
  let ai = 0;
  let vision = 0;
  let commons = 0;
  let editorSaw = [];
  let sortCalls = 0;
  let spent = false;
  const translated = [];
  const real = globalThis.fetch;
  const now = new Date().toUTCString();
  const rss = (host) => `<rss xmlns:media="m"><item><title>${host} strike one</title><link>https://${host}/1</link><pubDate>${now}</pubDate><description>Text one about Ukraine and Russia’s military.</description>${host.includes('meduza') ? '' : `<media:thumbnail url="https://img.${host}/1.jpg"/>`}</item>
    <item><title>${host} strike two</title><link>https://${host}/2</link><pubDate>${now}</pubDate><description>Text two on the conflict.</description></item></rss>`;
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.includes('/auth/v1/user')) return ok({ email: 'me@x.test' });
    if (u.includes('core_members?email=eq')) return ok([{ id: 'u1', email: 'me@x.test', doc: { status: 'active', clearance: 0 } }]);
    if (u.includes('core_settings')) return ok([{ value: false }]);
    if (u.includes('core_verified')) return ok([]);
    if (opts.method === 'DELETE') { for (const k of Object.keys(docs)) if (k.startsWith('make-')) delete docs[k]; return ok(null); }
    const doc = /kind=eq\.news&id=eq\.([\w-]+)/.exec(u);
    if (doc) return ok(docs[doc[1]] ? [{ doc: docs[doc[1]] }] : []);
    if (u.includes('core_docs?on_conflict')) {
      const b = JSON.parse(opts.body);
      if (!(opts.headers.Prefer.includes('ignore-duplicates') && docs[b.id])) docs[b.id] = b.doc;
      return ok(null);
    }
    if (u.includes('api.cloudflare.com') && spent) return new Response(JSON.stringify({ errors: [{ message: 'you have used up your daily free allocation of 10,000 neurons' }] }), { status: 429 });
    if (u.includes('api.cloudflare.com')) {
      const m = JSON.parse(opts.body).messages;
      if (Array.isArray(m[0].content)) { vision++; return ok({ success: true, result: { response: 'No' } }); } // the words-on-picture check
      ai++;
      const lines = m[1].content.split('\n').filter((l) => /^\d+\. /.test(l));
      if (m[0].content.includes('Міноборони РФ')) return ok({ success: true, result: { response: '{"count": 531, "regions": "Брянської, Курської областей та над акваторією Чорного моря"}' } });
      if (m[0].content.includes('Повітряних сил ЗСУ')) return ok({ success: true, result: { response: '{"ballistic": 6, "cruise": 0, "drones": 288, "jet": 38, "downed": 271, "downedJet": 31, "time": "09:00"}' } });
      if (m[0].content.includes('стосується теми розділу')) {
        // The editor for one section: keeps all but the news whose headline ends in «two» in Chapter 3.
        sortCalls++;
        const ch3 = m[0].content.includes('РОЗДІЛ 3');
        return ok({ success: true, result: { response: JSON.stringify({ keep: Object.fromEntries(lines.map((l, i) => [String(i + 1), ch3 && / two —/.test(l) ? 0 : 2])) }) } });
      }
      if (m[0].content.includes('Знайди групи')) {
        // One event: the first two headlines from the same feed (they share a word, so the group is trusted).
        const slug = (l) => /^\d+\. (\S+)/.exec(l)[1];
        const a = lines.findIndex((l, i) => lines.some((m2, k) => k > i && slug(m2) === slug(l)));
        const b = lines.findIndex((l, k) => k > a && slug(l) === slug(lines[a]));
        editorSaw = [lines[a], lines[b]];
        return ok({ success: true, result: { response: JSON.stringify({ same: [[a + 1, b + 1]], key: [1, 3, 5, 7, 9] }) } });
      }
      if (m[0].content.includes('З поданого списку')) return ok({ success: true, result: { response: JSON.stringify({ pick: [1, 2, 3, 4, 5, 6, 7] }) } }); // the key news, after the repeats
      const n = (m[1].content.match(/^\d+\./gm) || []).length;
      if (m[0].content.startsWith('Translate')) {
        translated.push(...m[1].content.split('\n\n').map((l) => l.replace(/^\d+\. /, '')));
        return ok({ success: true, result: { response: JSON.stringify({ t: Array.from({ length: n }, (_, i) => `Short summary of news number ${i + 1}. It has two sentences.`), q: Array.from({ length: n }, () => 'Kyiv parliament') }) } });
      }
      return ok({ success: true, result: { response: JSON.stringify({ summaries: Array.from({ length: n }, (_, i) => `Стислий виклад новини номер ${i + 1}. Друге речення викладу. Третє речення. Четверте зайве.`) }) } });
    }
    if (u.startsWith('https://commons.wikimedia.org/')) { commons++; return ok({ query: { pages: { 1: { index: 1, title: 'File:Kyiv parliament building.jpg', imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://upload.wikimedia.org/k.jpg' }] } } } }); }
    if (u.startsWith('https://img.') || u.startsWith('https://upload.wikimedia.org/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    const feed = SECTIONS.flatMap((s) => s.feeds).find((f) => f === u);
    if (feed && /lenta\.ru/.test(feed)) return new Response(`<rss><item><title>ПВО за ночь перехватили и уничтожили 531 украинский беспилотник</title><link>https://lenta.ru/news/pvo</link><pubDate>${now}</pubDate><description>Минобороны России сообщило: над территориями Брянской, Курской областей и над акваторией Черного моря перехвачены 531 БПЛА.</description></item>${rss(`${new URL(feed).hostname}${new URL(feed).pathname}`.replace(/\W+/g, '')).replace(/^<rss[^>]*>/, '')}`, { status: 200 });
    if (feed && /ukrinform/.test(feed)) return new Response(`<rss><item><title>Повітряні сили: ППО знешкодила 271 з 288 дронів, ворог атакував шістьма балістичними ракетами</title><link>https://www.ukrinform.ua/ppo</link><pubDate>${now}</pubDate><description>У ніч противник атакував 6 балістичними ракетами та 288 ударними БпЛА.</description></item>${rss(`${new URL(feed).hostname}${new URL(feed).pathname}`.replace(/\W+/g, '')).replace(/^<rss[^>]*>/, '')}`, { status: 200 });
    if (feed) { const f = new URL(feed); return new Response(rss(`${f.hostname}${f.pathname}`.replace(/\W+/g, '')), { status: 200 }); }
    // article pages (og:image for items without a thumbnail) — Meduza's carry none in this test
    if (u.includes('meduza')) return new Response('<html><head></head></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response('<html><head><meta property="og:image" content="https://img.page/og.jpg"></head></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const token = `x.${Buffer.from(JSON.stringify({ session_id: 's' })).toString('base64url')}.y`;
  const call = (q = '') => import(`../../api/pulse.js?t=${Date.now()}`).then(({ GET }) => GET(new Request(`https://app.test/api/pulse?news=1${q.replace(/^\?/, '&')}`, { headers: { authorization: `Bearer ${token}` } })));
  try {
    const r = await call();
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.deepEqual(j.sections.map((s) => s.id), SECTIONS.map((s) => s.id));
    assert.equal(j.for, new Date(issueTime()).toISOString());
    for (const s of j.sections) {
      assert.ok(s.items.length >= 3 && s.items.length <= 5, `${s.id}: ${s.items.length}`); // two news a feed here: a key news may leave its section three
      assert.ok(s.items.every((x) => x.image && x.summary && x.ai));
    }
    // No news twice: the key ones leave their sections, and a feed shared by two sections feeds only one.
    const urls = j.sections.flatMap((s) => s.items.map((x) => x.url));
    assert.equal(new Set(urls).size, urls.length);
    const editor = sortCalls + 2; // the batches sorted into sections + one look over all headlines + the key news
    assert.equal(ai, editor + 18); // + 8 sections in Ukrainian and in English + the two night reports
    // every picture but the two leads' own is looked at for words on it
    assert.equal(vision, j.sections.flatMap((s) => s.items).filter((x) => x.image && !x.lead).length);
    assert.equal(j.sections.find((s) => s.id === 'infospace').items[0].image, '/news-img/lead-ru.jpg');
    assert.equal(sortCalls, 7);
    assert.deepEqual({ ...j.editor, kept: undefined, pool: undefined, feeds: undefined, airHeads: undefined, secs: undefined, neurons: undefined, neuronsAll: undefined, claude: undefined, claudeCents: undefined, bySec: undefined, repeats: undefined, noImage: undefined, unfit: undefined, plain: undefined, keyPick: undefined, said: undefined, from: undefined }, { feeds: undefined, airHeads: undefined, sections: 7, judged: 7, events: true, short: 0, textPics: 0, picsChecked: true, secs: undefined, neurons: undefined, neuronsAll: undefined, claude: undefined, claudeCents: undefined, bySec: undefined, repeats: undefined, noImage: undefined, unfit: undefined, plain: undefined, keyPick: undefined, said: undefined, from: undefined, translated: j.sections.flatMap((s) => s.items).length, kept: undefined, pool: undefined, reports: { ru: 'used', ua: 'used' } });
    // The night's reports open 2.1 and 2.2, in the fixed wording, with the day's own numbers.
    const [ru] = j.sections.find((s) => s.id === 'infospace').items;
    const [ua] = j.sections.find((s) => s.id === 'media').items;
    assert.equal(ru.lead, 'ru');
    assert.equal(ru.summary, 'Протягом минулої ночі черговими силами ППО рф було перехоплено та знищено 531 українських безпілотних літальних апаратів літакового типу над територіями Брянської, Курської областей та над акваторією Чорного моря.');
    assert.equal(ua.lead, 'ua');
    assert.match(ua.summary, new RegExp(`^У ніч на ${kyivDay(Date.now()).text} противник атакував 6 балістичними ракетами та 288 ударними БпЛА типу Shahed \\(38 із них — реактивні\\), Гербера, дронами-імітаторами типу «Пародія»\\. За попередніми даними, станом на 09:00, протиповітряною обороною збито/подавлено 271 ворожих БпЛА`));
    // …and the same reports do not turn up again elsewhere in the issue.
    assert.equal(j.sections.flatMap((s) => s.items).filter((x) => /ППО|ПВО/.test(x.title)).length, 2);
    assert.ok(j.sections.find((s) => s.id === 'agenda').items.every((x) => / one$/.test(x.title))); // the editor said no to the others
    assert.ok(j.sections.every((s) => s.en?.part && s.items.every((x) => /^Short summary/.test(x.summary_en))));
    // Two or three sentences — the fourth is cut; the English is the Ukrainian translated.
    assert.ok(j.sections.every((s) => s.items.every((x) => x.lead || x.summary.endsWith('Третє речення.'))));
    assert.ok(translated.length && translated.every((t) => /^(У ніч|Протягом)/.test(t) || t.endsWith('Третє речення.')));
    // Only outlets on a section's verified list: every news sits in a section whose feeds carry its outlet.
    for (const s of j.sections.filter((x) => x.id !== 'key')) {
      const sites = SECTIONS.find((x) => x.id === s.id).feeds.map((f) => new URL(f).hostname.replace(/^(www|feeds|rss|news)\./, ''));
      assert.ok(s.items.every((x) => sites.some((h) => x.url.includes(h.split('.')[0].replace(/\W/g, '')))), s.id);
    }
    // The editor said these two are one event: only one of them is in the issue.
    const twin = editorSaw.slice(0, 2).map((l) => /^\d+\. (.+)$/.exec(l)[1]);
    assert.equal(j.sections.flatMap((s) => s.items).filter((x) => twin.includes(x.title)).length, 1);
    // No picture in the feed or on the page: a photo from Wikimedia Commons.
    const fromCommons = j.sections.flatMap((s) => s.items).filter((x) => x.imageFrom === 'commons');
    assert.ok(commons > 0 && fromCommons.length && fromCommons.every((x) => x.image === 'https://upload.wikimedia.org/k.jpg'));
    const again = await (await call()).json(); // until the next 17:00: the same issue, the model not asked again
    assert.equal(again.at, j.at); assert.equal(ai, editor + 18);
    const pic = j.sections[1].items.find((x) => x.image && !x.image.startsWith('/')).image;
    assert.equal((await call(`?img=${encodeURIComponent(pic)}`)).status, 200);
    assert.equal((await call(`?img=${encodeURIComponent('https://evil.test/x.jpg')}`)).status, 404);
    // Open to anyone with the link, and nothing anyone sends makes it anew before 17:00.
    const anon = (q) => import(`../../api/pulse.js?u=${Date.now()}`).then(({ GET }) => GET(new Request(`https://app.test/api/pulse?news=1${q}`)));
    assert.equal((await anon('')).status, 200);
    assert.equal((await anon(`&img=${encodeURIComponent(pic)}`)).status, 200);
    assert.equal((await (await anon('&refresh=1')).json()).at, j.at);
    // An issue from before the latest 17:00 is made anew — once, even when two readers come at the same time.
    docs.issue = { ...docs.issue, for: new Date(issueTime() - 86400000).toISOString() };
    const [x, y] = await Promise.all([anon(''), anon('')]).then((rs) => Promise.all(rs.map((q) => q.json())));
    assert.equal(ai, 2 * (editor + 18));
    assert.ok([x, y].some((v) => v.for === new Date(issueTime()).toISOString()));
    // The model's daily allowance spent: the good issue stays, marked to be made again; nothing worse replaces it.
    const good = docs.issue;
    spent = true;
    docs.issue = { ...good, for: new Date(issueTime() - 86400000).toISOString() };
    for (const k of Object.keys(docs)) if (k.startsWith('make-')) delete docs[k];
    const z = await (await anon('')).json();
    assert.equal(z.at, good.at);
    assert.equal(docs.issue.at, good.at);
    assert.ok(Date.parse(docs.issue.for) < issueTime()); // to be made again once the model answers
    // The morning capture keeps the day's two reports with their articles — no model needed.
    const cap = await (await anon('&capture=1')).json();
    assert.match(cap.ru, /ПВО/); assert.match(cap.ua, /Повітряні сили/);
    assert.equal(docs.reports.ua.url, 'https://www.ukrinform.ua/ppo');
    assert.ok('article' in docs.reports.ua);
  } finally { globalThis.fetch = real; }
});

test('off-topic news, emoji pictures and empty phrases stay out', async () => {
  const { offTopic } = await import('../../src/lib/news.js');
  assert.ok(offTopic({ title: 'Черный шар — фильм, который может победить на «Оскарах»' }));
  assert.ok(offTopic({ title: 'France braces for Halloween protests' }));
  assert.ok(offTopic({ title: 'Захищено: Британський лучник проти стерв’ятників' }));
  assert.ok(offTopic({ title: 'كيف يمكن للقطيعة بين الجزائر والإمارات' }));
  assert.ok(!offTopic({ title: 'US approves sale of 500 Patriot missiles to Ukraine' }));
  assert.ok(offTopic({ title: 'Hear me out: maybe Norway should give the prize', url: 'https://www.theguardian.com/commentisfree/2026/oct/31/x' }));
  assert.equal(itemImage('<item><media:thumbnail url="https://s.w.org/images/core/emoji/17.0.2/72x72/25ab.png"/></item>'), '');
  const [s] = readSummaries('{"summaries":["Армія РФ завдала удару по Харкову. Це сталося в Харкові. Київ вимагає更多 перехоплювачів."]}', [{ title: 'x' }]);
  assert.equal(s.text, 'Армія рф завдала удару по Харкову. Київ вимагає перехоплювачів.');
});

test('the editor’s answers: keep or not for a section; same events; one news per event, the pictured one kept', () => {
  const items = [{ title: 'a', image: '' }, { title: 'b', image: 'https://p/b.jpg' }, { title: 'c' }, { title: 'd' }, { title: 'e' }];
  assert.deepEqual(readKeep('{"keep":{"1":2,"2":0,"3":"так","5":true}}', items), [true, false, true, undefined, true]);
  assert.deepEqual(readKeep('{"keep":{"1":1,"2":2,"3":0,"4":1,"5":2}}', items), ['maybe', true, false, 'maybe', true]); // 1: partly on topic
  assert.equal(readKeep('no json', items), null);
  assert.equal(readKeep('{"keep":{"1":1}}', items), null); // too few answers to trust
  assert.match(keepPrompt(SECTIONS[5], items)[0].content, /4\.2 ОіВТ.*Тема розділу: озброєння/s);
  const ev = readEvents('{"same":[[1,2],[5]],"key":[2,4,77]}', items);
  assert.deepEqual(ev, { groups: [[0, 1]], key: [1, 3] });
  assert.deepEqual([...dropRepeats(items, ev.groups).drop], [0]);
  assert.match(eventsPrompt(items)[0].content, /ту саму подію/);
  // A group the model lumps together is trusted only where the headlines share a telling word.
  const heads = [{ title: 'US approves 500 Patriot missiles' }, { title: 'Washington approves Patriot missiles sale' }, { title: 'Canada gives €500m to Ukraine' }, { title: 'Zelenskyy urges faster Patriot deliveries' }];
  assert.deepEqual(checkGroups(heads, [[0, 1, 2, 3]]), [[0, 1]]); // two telling words tie; «500» or «Patriot» alone does not
  assert.deepEqual(checkGroups([...heads, ...heads], [[0, 1, 2, 3, 4, 5]]), []); // a whole topic lumped together: not one event
});

test('same event without the model: headlines in different languages that share telling words', () => {
  const items = [
    { title: 'Люди з Олешок прилетіли в Білорусь: вони їдуть до України' },
    { title: 'Hundreds evacuated from Russian-occupied Oleshky during rare Ukraine ceasefire' },
    { title: 'Евакуйовані з Олешок українці за кілька годин будуть в Україні' },
    { title: 'US approves sale of 500 Patriot missiles to Ukraine' },
    { title: 'Постачання Україні 500 ракет до Patriot почнеться не раніше 2030 року' },
    { title: 'Канада виділить €500 мільйонів на підтримку України' },
    { title: 'Навроцький заявив про порушення конституційного ладу Польщі' },
  ];
  const groups = sameEvents(items).map((g) => g.sort());
  assert.ok(groups.some((g) => g.includes(3) && g.includes(4)), JSON.stringify(groups));
  assert.ok(groups.some((g) => g.includes(1) && g.includes(2)), JSON.stringify(groups)); // «Oleshky … evacuated» meets «Евакуйовані з Олешок»
  assert.ok(!groups.some((g) => g.includes(5) || g.includes(6)), JSON.stringify(groups));
});

test('a summary is two or three sentences', async () => {
  const { shape } = await import('../../src/lib/news.js');
  assert.deepEqual(shape('Перше речення. Друге — про США. Третє! Четверте?'), { text: 'Перше речення. Друге — про США. Третє!', n: 3 });
  assert.equal(shape('Лише одне речення про «Patriot».').n, 1);
  assert.deepEqual(shape('Перше речення. Друге речення. Третє обірване на кшталт контенту,'), { text: 'Перше речення. Друге речення.', n: 2 });
  assert.equal(shape('Delegations met on 30 Oct. 2026 in Geneva. Talks go on.').n, 2);
});

test('a summary not in Ukrainian never stands in for one', async () => {
  const { isUkrainian } = await import('../../src/lib/news.js');
  assert.ok(isUkrainian('Канада виділить 500 млн євро на підтримку України.'));
  assert.ok(!isUkrainian('Посол по особым поручениям МИД России обвинил Украину.'));
  assert.ok(!isUkrainian('The announcement comes amid heightened tensions.'));
  const [r] = readSummaries('', [{ title: 'x', text: 'The announcement comes amid heightened tensions between Kyiv and Washington.' }]);
  assert.equal(r.n, 0);
});

test('a summary reply cut off at the length limit keeps the summaries it finished', () => {
  const items = [{ title: 'a' }, { title: 'b' }, { title: 'c' }];
  const raw = '{"summaries": ["Перша новина про «Нептун». Друге речення.", "Друга новина повністю. І ще одне.", "Третя обірв';
  const s = readSummaries(raw, items);
  assert.deepEqual(s.map((x) => x.ai), [true, true, false]);
  assert.equal(s[0].text, 'Перша новина про «Нептун». Друге речення.');
});

test('night reports: only the day’s own, and nothing composed without the numbers', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const items = [
    { title: 'Повітряні сили: ППО збила 250 з 300 дронів', url: 'https://u/1', at: '2026-10-27T07:00:00Z' }, // yesterday
    { title: 'Повітряні сили: ППО знешкодила 271 з 288 дронів', url: 'https://u/2', at: '2026-10-28T07:10:00Z' },
    { title: 'Повітряні сили: уточнення — 275 з 288', url: 'https://u/3', at: '2026-10-28T09:00:00Z' },
    { title: 'ПВО за ночь сбила 531 беспилотник', url: 'https://r/1', at: '2026-10-28T05:00:00Z', text: 'Минобороны России' },
  ];
  assert.equal(findReport(items, 'ua', now).url, 'https://u/2'); // the morning report, not yesterday's or a later update
  assert.equal(findReport(items, 'ru', now).url, 'https://r/1');
  assert.equal(findReport(items.slice(0, 1), 'ua', now), null);
  assert.equal(composeReport('ua', '{"drones": null, "downed": 100}', '2026-10-28T07:00:00Z'), '');
  // No regions named (or named in Russian): the claim is told without them, never with Russian forms.
  const bare = 'Протягом минулої ночі черговими силами ППО рф було перехоплено та знищено 531 українських безпілотних літальних апаратів літакового типу.';
  assert.equal(composeReport('ru', '{"count": 531, "regions": null}', ''), bare);
  assert.equal(composeReport('ru', '{"count": 531, "regions": "Брянской области"}', ''), bare);
  assert.equal(composeReport('ru', '{"count": null, "regions": "Брянської області"}', ''), '');
  assert.doesNotMatch(composeReport('ua', '{"ballistic": 0, "cruise": 0, "drones": 120, "downed": 100}', '2026-10-28T07:00:00Z'), /ракет/);
});

test('night reports: the headlines the media actually give them', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const at = '2026-10-31T06:30:00Z';
  for (const title of [
    'Цієї ночі уражено 69 ворожих БпЛА зі 101 – Повітряні сили',
    'Вночі Сили оборони ліквідували 126 зі 142 ворожих безпілотників',
    'За ніч ППО знешкодила 66 зі 100 ворожих БПЛА',
    'Повітряні сили ЗСУ: противник вночі атакував 70 БпЛА різних типів',
  ]) assert.ok(findReport([{ title, url: 'https://u/x', at }], 'ua', now), title);
  for (const title of [
    'Минобороны заявило об уничтожении 31 беспилотника за ночь',
    'Над Россией сбили 111 украинских беспилотников за ночь',
    'Силы ПВО уничтожили за ночь 121 украинский беспилотник над 14 регионами России',
  ]) assert.ok(findReport([{ title, url: 'https://r/x', at }], 'ru', now), title);
});

test('words on a picture: yes and no told apart; unknown keeps the picture; the site’s own pictures are not asked about', async () => {
  const { hasText } = await import('../../api/_news.js');
  const fetchImage = async () => ({ type: 'image/jpeg', buf: new Uint8Array([1, 2, 3]).buffer });
  let seen;
  const ask = (a) => async (m) => { seen = m; return a; };
  assert.equal(await hasText('https://x/1.jpg', { fetchImage, ask: ask('Yes.') }), true);
  assert.ok(seen[0].content.some((c) => c.type === 'image_url' && c.image_url.url.startsWith('data:image/jpeg;base64,')));
  assert.equal(await hasText('https://x/2.jpg', { fetchImage, ask: ask('no') }), false);
  assert.equal(await hasText('https://x/3.jpg', { fetchImage, ask: ask('maybe') }), null);
  assert.equal(await hasText('/news-img/lead-ru.jpg', { fetchImage, ask: ask('yes') }), null);
});

test('the allowance running out half-way: nothing more is asked that day, and the thin issue is made again later', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', CF_AI_TOKEN: 'cf', CF_ACCOUNT_ID: 'acc' });
  const { makeIssue, resetSpent, aiSpent } = await import('../../api/_news.js');
  const { SECTIONS } = await import('../../src/lib/news.js');
  resetSpent();
  const real = globalThis.fetch;
  const now = new Date().toUTCString();
  let calls = 0, after = 0, retried = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://sb.test')) return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('api.cloudflare.com')) {
      calls++;
      if (aiSpent()) after++;
      const m = JSON.parse(opts.body).messages;
      // the editor's first round answers (one passing 503 asked again); everything after it finds the allowance gone
      if (typeof m[0].content === 'string' && m[0].content.includes('стосується теми розділу')) {
        if (!retried++) return new Response('{}', { status: 503 });
        const n = (m[1].content.match(/^\d+\./gm) || []).length;
        return new Response(JSON.stringify({ result: { response: JSON.stringify({ keep: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), 2])) }) } }), { status: 200 });
      }
      return new Response(JSON.stringify({ errors: [{ message: 'you have used up your daily free allocation of 10,000 neurons' }] }), { status: 429 });
    }
    const feed = SECTIONS.flatMap((s) => s.feeds).find((f) => f === u);
    if (feed) {
      const h = new URL(feed).hostname.replace(/\W+/g, '');
      return new Response(`<rss>${Array.from({ length: 6 }, (_, i) => `<item><title>${h} news ${i} about Ukraine and Russia’s war</title><link>https://${h}.test/${i}</link><pubDate>${now}</pubDate><description>Text ${i} about Ukraine and Russia’s military and the war.</description></item>`).join('')}</rss>`, { status: 200 });
    }
    return new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  try {
    const issue = await makeIssue();
    assert.ok(aiSpent());
    assert.equal(after, 0, 'no request goes out once the allowance is known spent');
    assert.ok(retried >= 2, 'a passing 5xx is asked once more');
    assert.equal(issue.degraded, true);
    assert.match(issue.editor.err, /neurons|429/);
    assert.equal(issue.editor.picsChecked, false);
  } finally { globalThis.fetch = real; resetSpent(); }
});

test('pictures from Russian sites are known by their address', async () => {
  const { ruPicture } = await import('../../src/lib/news.js');
  assert.ok(ruPicture('https://icdn.lenta.ru/images/x.jpg'));
  assert.ok(ruPicture('https://cdnn21.img.ria.ru/images/x.jpg'));
  assert.ok(!ruPicture('https://static.themoscowtimes.com/x.jpg'));
  assert.ok(!ruPicture('https://meduza.io/imgly/x'));
  assert.ok(!ruPicture('https://www.pravda.com.ua/x.jpg'));
  assert.ok(!ruPicture('/news-img/lead-ru.jpg'));
});

test('the night report, not a tally of the month or the day; one saying «за ніч» comes first', async () => {
  const { findReport, nightReport } = await import('../../src/lib/news.js');
  const now = Date.now();
  const at = (m) => new Date(now - m * 60000).toISOString();
  const pick = (items, side) => findReport(items.map(([title, m, url]) => ({ title, text: '', url, at: at(m) })), side, now)?.url || null;
  assert.equal(pick([['ПВО за октябрь сбила почти 28 тысяч украинских БПЛА над Россией', 60, 'm']], 'ru'), null);
  assert.equal(pick([['ПВО за октябрь сбила почти 28 тысяч украинских БПЛА', 60, 'm'], ['Средства ПВО за ночь уничтожили 120 украинских беспилотников', 30, 'n']], 'ru'), 'n');
  assert.equal(pick([['Противник упродовж суботи атакував Україну 168 БпЛА, збито 124 з них', 60, 'd']], 'ua'), null);
  assert.equal(pick([['Повітряні сили: ППО знешкодила 271 з 288 дронів', 90, 'p'], ['Сили ППО перехопили за ніч 105 ворожих БПЛА, 49 з яких — реактивні', 30, 'n']], 'ua'), 'n');
  assert.ok(!nightReport({ title: 'ПВО за октябрь сбила почти 28 тысяч украинских БПЛА' }, 'ru'));
  assert.equal(pick([['Группировка "Север" за ночь уничтожила 183 беспилотника ВСУ', 60, 'g']], 'ru'), null);
  assert.ok(!nightReport({ title: 'Группировка "Север" за ночь уничтожила 183 беспилотника ВСУ' }, 'ru'));
  assert.equal(pick([['Дежурные средства ПВО перехватили и уничтожили 57 украинских БПЛА над территориями пяти областей', 50, 'm']], 'ru'), 'm');
  assert.ok(nightReport({ title: 'Силы ПВО за ночь уничтожили 433 украинских беспилотника' }, 'ru'));
});

test('Claude Haiku first (Cloudflare spent too): the same requests answered, pictures sent as image blocks', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', CF_AI_TOKEN: 'cf', CF_ACCOUNT_ID: 'acc', ANTHROPIC_API_KEY: 'test-key' });
  const { makeIssue, resetSpent, toClaude, hasText } = await import('../../api/_news.js');
  const { SECTIONS } = await import('../../src/lib/news.js');
  resetSpent();
  const real = globalThis.fetch;
  const now = new Date().toUTCString();
  let cf = 0, claude = 0, sawImage = false;
  const answer = (text) => new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://sb.test')) return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('api.cloudflare.com')) { cf++; return new Response(JSON.stringify({ errors: [{ message: 'you have used up your daily free allocation of 10,000 neurons' }] }), { status: 429 }); }
    if (u.includes('api.anthropic.com')) {
      claude++;
      const b = JSON.parse(opts.body);
      assert.equal(b.model, 'claude-haiku-5-5');
      assert.equal(b.thinking.type, 'disabled');
      const c = b.messages[0].content;
      if (Array.isArray(c) && c.some((x) => x.type === 'image')) { sawImage = true; return answer('No'); }
      const sys = String(b.system || '');
      const text = typeof c === 'string' ? c : '';
      const n = (text.match(/^\d+\./gm) || []).length;
      if (sys.includes('стосується теми розділу')) return answer(JSON.stringify({ keep: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), 2])) }));
      if (sys.includes('Знайди групи')) return answer('{"same": [], "key": [1, 2, 3, 4, 5]}');
      if (sys.startsWith('Translate')) return answer(JSON.stringify({ t: Array.from({ length: n }, (_, i) => `Summary ${i + 1}. Second sentence.`), q: Array.from({ length: n }, () => 'Kyiv') }));
      // a long list answered only in part (as a reply cut short): the rest must be asked again
      return answer(JSON.stringify({ summaries: Array.from({ length: n > 3 ? 2 : n }, (_, i) => `Стислий виклад новини ${i + 1}. Друге речення викладу.`) }));
    }
    if (/commons\.wikimedia|upload\.wikimedia/.test(u)) return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.startsWith('https://img.')) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    const feed = SECTIONS.flatMap((s) => s.feeds).find((f) => f === u);
    if (feed) {
      const h = new URL(feed).hostname.replace(/\W+/g, '');
      // 5.2 reads only the conflicts away from Ukraine: two of its feeds give those
      const far = /news\.un\.org/.test(feed);
      const away = ['Sudan clashes', 'Gaza ceasefire', 'Myanmar junta', 'Haiti gangs', 'Somalia militants', 'Congo rebels'];
      return new Response(`<rss xmlns:media="m">${Array.from({ length: 6 }, (_, i) => `<item><title>${far ? `${away[i]} ${i}` : `${h} news ${i} about Ukraine and Russia’s war`}</title><link>https://${h}.test/${i}</link><pubDate>${now}</pubDate><description>${far ? `Text ${i} on ${away[i]}.` : `Text ${i} about Ukraine and Russia’s military and the war.`}</description><media:thumbnail url="https://img.${h}/${i}.jpg"/></item>`).join('')}</rss>`, { status: 200 });
    }
    return new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  try {
    const conv = toClaude([{ role: 'system', content: 'S' }, { role: 'user', content: [{ type: 'text', text: 'T' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA=' } }] }]);
    assert.equal(conv.system, 'S');
    assert.deepEqual(conv.messages[0].content[1], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA=' } });
    const issue = await makeIssue();
    assert.ok(claude > 10, `cf ${cf}, claude ${claude}`);
    assert.ok(issue.editor.claudeCents >= 0 && issue.editor.claudeCents <= 3);
    assert.ok(!issue.degraded, JSON.stringify(issue.editor).slice(0, 300));
    assert.equal(issue.editor.judged, 7);
    assert.ok(issue.editor.claude > 10);
    assert.ok(sawImage, 'pictures checked through Claude');
    assert.ok(issue.sections.filter((s) => s.id !== 'key').every((s) => s.items.length >= 4), JSON.stringify(issue.sections.map((s) => s.items.length)));
    assert.ok(!(issue.editor.sumErrs || []).some((e) => /without a retelling/.test(e)), JSON.stringify(issue.editor.sumErrs));
    assert.equal(await hasText('https://img.x/1.jpg'), false);
  } finally { globalThis.fetch = real; resetSpent(); delete process.env.ANTHROPIC_API_KEY; }
});

test('sentences about the text, not the news, are left out of a summary', async () => {
  const { shape } = await import('../../src/lib/news.js');
  const r = shape('Трамп заявив, що мирна угода наближається. Конкретних кроків чи строків у наданому тексті не зазначено. Він говорив у Маямі.');
  assert.equal(r.text, 'Трамп заявив, що мирна угода наближається. Він говорив у Маямі.');
  assert.equal(r.n, 2);
  assert.equal(shape('Росіяни атакували Вінниччину. Джерело не уточнює масштаби руйнувань.').n, 1);
  // the model thinking aloud
  assert.equal(shape('Канцлер Меркель... Merz під час поїздки до Азії говорив про безпеку Європи. Його пропозиція натрапляє на перешкоди.').text, 'Merz під час поїздки до Азії говорив про безпеку Європи. Його пропозиція натрапляє на перешкоди.');
  assert.equal(shape('КПК провела з 1 по 4 жовтня... — ні, у тексті сказано, що форум був наприкінці жовтня. На нього прибули представники 97 країн.').n, 1);
});

test('only the day’s news: dated, within 24 hours, no analysis, explainers or interviews', async () => {
  const { offTopic } = await import('../../src/lib/news.js');
  const now = Date.parse('2026-11-01T15:00:00Z');
  const items = [
    { title: 'Fresh', url: 'https://a/1', domain: 'a', at: '2026-11-01T10:00:00Z' },
    { title: 'Yesterday morning', url: 'https://a/2', domain: 'a', at: '2026-10-31T09:00:00Z' },
    { title: 'Undated report', url: 'https://a/3', domain: 'a', at: null },
  ];
  assert.deepEqual(pickItems(items, now, 5, 5).map((x) => x.title), ['Fresh']);
  assert.ok(offTopic({ title: 'Analysis: what Russia wants from the talks', url: 'https://x/1' }));
  assert.ok(offTopic({ title: 'Що відомо про нову ракету', url: 'https://x/2' }));
  assert.ok(offTopic({ title: 'Ukraine talks', url: 'https://www.bbc.com/news/articles/analysis/x' }));
  assert.ok(!offTopic({ title: 'Ukraine strikes refinery in Ryazan', url: 'https://x/3' }));
});

test('a long chain of headlines sharing a word or two is a topic, not one event', () => {
  const items = [
    'Russian drones hit Odesa port overnight', 'Odesa port fire after drone attack', 'Drone attack on Kharkiv port depot',
    'Kharkiv depot burns after attack', 'Depot near Dnipro burns overnight', 'Dnipro bridge damaged overnight',
  ].map((title) => ({ title }));
  const groups = sameEvents(items);
  assert.ok(groups.every((g) => g.length <= 4), JSON.stringify(groups));
});

test('an archive photo must fit the news as well as carry no words', async () => {
  const { hasText } = await import('../../api/_news.js');
  const deps = (answer) => ({ ask: async () => answer, fetchImage: async () => ({ type: 'image/jpeg', buf: new Uint8Array([1]) }) });
  assert.equal(await hasText('https://x/k.jpg', deps('No, no.'), 'Global Governance Forum opens in Beijing'), true); // the Kremlin for China
  assert.equal(await hasText('https://x/k.jpg', deps('no yes'), 'Global Governance Forum opens in Beijing'), false);
  assert.equal(await hasText('https://x/k.jpg', deps('yes yes'), 'x'), true);
  assert.equal(await hasText('https://x/k.jpg', deps('No'), ''), false);
});

test('of two news on one event the one in the thinner section stays', () => {
  const items = [{ title: 'a', image: 'https://p/a.jpg', at: '2026-11-01T10:00:00Z' }, { title: 'b', image: '', at: '2026-11-01T09:00:00Z' }];
  assert.deepEqual([...dropRepeats(items, [[0, 1]]).drop], [1]);
  assert.deepEqual([...dropRepeats(items, [[0, 1]], (i) => [9, 2][i]).drop], [0]);
});

test('«рф», «росія», «путін» with a small letter, a capital only where a sentence begins', async () => {
  const { lowerRu } = await import('../../src/lib/news.js');
  assert.equal(lowerRu('Удар по Росії. Путін заявив, що РФ і Росія готові; за словами Путіна, ВС РФ наступають.'), 'Удар по росії. Путін заявив, що рф і росія готові; за словами путіна, ВС рф наступають.');
  assert.equal(lowerRu('Росіяни й Російська мова'), 'Росіяни й Російська мова'); // only the three words
});

test('the brief goes to the address given for letters; the sign-in address only when none is given', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
  const { mailOf } = await import('../../api/brief.js');
  assert.equal(mailOf({ email: 'login@reaction.local', doc: { mailTo: 'me@example.com' } }), 'me@example.com');
  assert.equal(mailOf({ email: 'me@example.com', doc: {} }), 'me@example.com');
  assert.equal(mailOf({ email: 'x@y.com', doc: { mailTo: 'broken' } }), ''); // a wrong address is not swapped for the login
});

test('readable addresses: division, register and the record’s name, the old form still opens', async () => {
  const { toHash, fromHash, slug } = await import('../../src/lib/routes.js');
  const r = { view: 'divisions', sub: 'prj', id: 'projects:w-mvxk9oy9g088' };
  assert.equal(toHash(r, 'rubINT v.2'), '/proiekty/rubint-v-2~w-mvxk9oy9g088');
  assert.deepEqual(fromHash('#/proiekty/rubint-v-2~w-mvxk9oy9g088'), r);
  assert.deepEqual(fromHash('#/proiekty/any-new-name~w-mvxk9oy9g088'), r); // renamed: the id still finds it
  assert.deepEqual(fromHash('#/divisions/prj/projects%3Aw-mvxk9oy9g088'), r);
  assert.equal(toHash({ view: 'divisions', sub: 'int', id: 'sources' }), '/rozvidka/dzherela');
  assert.deepEqual(fromHash('#/rozvidka/dzherela'), { view: 'divisions', sub: 'int', id: 'sources' });
  assert.equal(toHash({ view: 'divisions', sub: 'prj', id: 'projects:x1' }, ''), '/proiekty/~x1'); // a classified one: no name
  assert.deepEqual(fromHash('#/settings'), { view: 'settings', sub: null, id: null });
  assert.equal(slug('Щастя Їжака'), 'shchastia-izhaka');
});

test('the brief’s analysis: activity, projects to develop, a forecast — no classified name ever', async () => {
  const { buildInsights, plainConclusions, readInsights, insightsHtml, insightsPrompt } = await import('../../src/lib/brief.js');
  const now = Date.parse('2026-11-02T08:00:00Z');
  const records = [
    { id: 'p1', div: 'prj', col: 'projects', name: 'rubINT v.2', state: 'Триває', clearance: 1, at: '2026-10-01T00:00:00Z', updated: '2026-10-20T00:00:00Z', deadline: '2026-11-10' },
    { id: 'p2', div: 'prj', col: 'projects', name: 'Atlas', state: 'Триває', clearance: 0, at: '2026-10-25T00:00:00Z', updated: '2026-11-01T00:00:00Z', entries: [{ at: '2026-10-30T00:00:00Z' }, { at: '2026-10-31T00:00:00Z' }, { at: '2026-11-01T00:00:00Z' }] },
  ];
  const ins = buildInsights({ records, tasks: [{ id: 't', assignee: 'u', status: 'open', due: '2026-10-30', at: '2026-10-29T00:00:00Z' }], me: { id: 'u', clearance: 2 }, now, nameUpTo: 0 });
  assert.equal(ins.activity.length, 7);
  assert.deepEqual(ins.develop.map((x) => x.title), ['засекречений проєкт 1', 'Atlas']);
  assert.equal(ins.tasks.overdue, 1);
  assert.ok(plainConclusions(ins).some((c) => /Прострочених завдань: 1/.test(c)));
  const all = JSON.stringify(insightsPrompt(ins)) + insightsHtml(ins);
  assert.ok(!all.includes('rubINT'), 'a classified project’s name goes neither to the model nor into the letter');
  const ai = readInsights('{"conclusions":["Активність зросла втричі за тиждень."],"forecast":"Черга зросте.","develop":[{"project":"Atlas","next":"Призначити наступний етап"},{"project":"Вигадка","next":"x"}]}', ins);
  assert.deepEqual(ai.develop, [{ project: 'Atlas', next: 'Призначити наступний етап' }]); // only projects it was given
  assert.ok(insightsHtml(ins, ai).includes('Наступний крок: Призначити наступний етап'));
});

test('the brief as a PDF: pages with charts, and no classified name in it', async () => {
  const { readFileSync } = await import('node:fs');
  const { buildBrief, buildInsights } = await import('../../src/lib/brief.js');
  const { briefPdf } = await import('../../src/lib/briefPdf.js');
  const { PDFDocument } = await import('pdf-lib');
  const now = Date.parse('2026-11-02T08:00:00Z');
  const records = [{ id: 'p1', div: 'prj', col: 'projects', name: 'TopSecretName', state: 'Триває', clearance: 1, at: '2026-10-01T00:00:00Z', updated: '2026-10-20T00:00:00Z' }];
  const me = { id: 'u', role: 'admin', clearance: 2 };
  const fonts = ['Regular', 'Bold'].map((w) => readFileSync(new URL(`../../public/fonts/NotoSerif-${w}.ttf`, import.meta.url)));
  const bytes = await briefPdf({ brief: buildBrief({ records, me, now, nameUpTo: 0 }), insights: buildInsights({ records, me, now, nameUpTo: 0 }), fonts });
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 3);
  assert.ok(!Buffer.from(bytes).toString('latin1').includes('TopSecretName'));
});

test('air-defence tallies told apart: the day’s one stays beside the night report', async () => {
  const { airTally } = await import('../../src/lib/news.js');
  assert.ok(airTally({ title: 'ППО в неділю знешкодила 274 ударних дрони і всі "Бандеролі" – Повітряні сили' }));
  assert.ok(airTally({ title: 'ПВО за день сбила 47 украинских беспилотников' }));
  assert.ok(!airTally({ title: "Зеленський: Сили оборони уразили російські об'єкти ППО на $70 млн та ракетний завод" }));
  assert.ok(!airTally({ title: 'Группировка "Север" за ночь уничтожила 183 беспилотника' }));
  assert.ok(airTally({ title: 'ПВО за день сбила 47 украинских беспилотников' }, true)); // the day's: stays
  assert.ok(!airTally({ title: 'Повітряні сили ЗСУ знищили й подавили 154 ворожі БпЛА цієї ночі' }, true)); // the night's: a repeat of the lead
});

test('the brief’s security picture: alert hours by oblast, GPR week against month', async () => {
  const { hoursUnder } = await import('../../api/_alerts.js');
  const { alertTiles, gprPicture, worldHtml } = await import('../../src/lib/brief.js');
  const now = Date.parse('2026-11-02T08:00:00Z'); const H = 3600e3;
  const list = [
    { alert_type: 'air_raid', started_at: new Date(now - 30 * H).toISOString(), finished_at: new Date(now - 20 * H).toISOString() }, // 6 h inside the last 24 h
    { alert_type: 'air_raid', started_at: new Date(now - 2 * H).toISOString(), finished_at: null }, // still on: 2 h
    { alert_type: 'artillery_shelling', started_at: new Date(now - 5 * H).toISOString(), finished_at: new Date(now - 4 * H).toISOString() },
  ];
  assert.equal(hoursUnder(list, now - 24 * H, now), 6);
  assert.equal(hoursUnder(list, now - 7 * 24 * H, now), 12);
  const tiles = alertTiles({ byOblast: { 'Харківська область': { h7: 80 }, 'м. Київ': { h7: 20 } } });
  assert.equal(tiles.find((t) => t.key === 'Харківська').h7, 80);
  assert.equal(tiles.find((t) => t.key === 'Київ').h7, 20);
  assert.ok(tiles.find((t) => t.key === 'Крим').occupied);
  const g = gprPicture(Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, value: i < 23 ? 100 : 200 })));
  assert.equal(g.week, 200);
  assert.ok(worldHtml({ gpr: [], alerts: null }) === ''); // nothing to show: no section
});

test('oblast names from any source meet one key (for the map)', async () => {
  const { uaKeyOf } = await import('../../src/lib/brief.js');
  assert.equal(uaKeyOf('Kharkiv Oblast'), 'Харківська');
  assert.equal(uaKeyOf('Kyiv Oblast'), 'Київська');
  assert.equal(uaKeyOf('Kyiv'), 'Київ');
  assert.equal(uaKeyOf('Autonomous Republic of Crimea'), 'Крим');
  assert.equal(uaKeyOf('Zaporizhzhia Oblast'), 'Запорізька');
  assert.equal(uaKeyOf('Івано-Франківська область'), 'Івано-Франківська');
});
