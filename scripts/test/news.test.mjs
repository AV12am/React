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
  let commons = 0;
  let editorSaw = [];
  let sortCalls = 0;
  let spent = false;
  const translated = [];
  const real = globalThis.fetch;
  const now = new Date().toUTCString();
  const rss = (host) => `<rss xmlns:media="m"><item><title>${host} one</title><link>https://${host}/1</link><pubDate>${now}</pubDate><description>Text one about Ukraine and Russia’s military.</description>${host.includes('stopfake') ? '' : `<media:thumbnail url="https://img.${host}/1.jpg"/>`}</item>
    <item><title>${host} two</title><link>https://${host}/2</link><pubDate>${now}</pubDate><description>Text two on the conflict.</description></item></rss>`;
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
      ai++;
      const m = JSON.parse(opts.body).messages;
      const lines = m[1].content.split('\n').filter((l) => /^\d+\. /.test(l));
      if (m[0].content.includes('Міноборони РФ')) return ok({ success: true, result: { response: '{"count": 531, "regions": "Брянської, Курської областей та над акваторією Чорного моря"}' } });
      if (m[0].content.includes('Повітряних сил ЗСУ')) return ok({ success: true, result: { response: '{"ballistic": 6, "cruise": 0, "drones": 288, "jet": 38, "downed": 271, "downedJet": 31, "time": "09:00"}' } });
      if (m[0].content.includes('стосується теми розділу')) {
        // The editor for one section: keeps all but the news whose headline ends in «two» in Chapter 3.
        sortCalls++;
        const ch3 = m[0].content.includes('РОЗДІЛ 3');
        return ok({ success: true, result: { response: JSON.stringify({ keep: Object.fromEntries(lines.map((l, i) => [String(i + 1), ch3 && / two —/.test(l) ? 0 : 1])) }) } });
      }
      if (m[0].content.includes('Знайди групи')) {
        // One event: the first two headlines from the same feed (they share a word, so the group is trusted).
        const slug = (l) => /^\d+\. (\S+)/.exec(l)[1];
        const a = lines.findIndex((l, i) => lines.some((m2, k) => k > i && slug(m2) === slug(l)));
        const b = lines.findIndex((l, k) => k > a && slug(l) === slug(lines[a]));
        editorSaw = [lines[a], lines[b]];
        return ok({ success: true, result: { response: JSON.stringify({ same: [[a + 1, b + 1]], key: [1, 3, 5, 7, 9] }) } });
      }
      const n = (m[1].content.match(/^\d+\./gm) || []).length;
      if (m[0].content.startsWith('Translate')) {
        translated.push(...m[1].content.split('\n\n').map((l) => l.replace(/^\d+\. /, '')));
        return ok({ success: true, result: { response: JSON.stringify({ t: Array.from({ length: n }, (_, i) => `Short summary of news number ${i + 1}. It has two sentences.`), q: Array.from({ length: n }, () => 'Kyiv parliament') }) } });
      }
      return ok({ success: true, result: { response: JSON.stringify({ summaries: Array.from({ length: n }, (_, i) => `Стислий виклад новини номер ${i + 1}. Друге речення викладу. Третє речення. Четверте зайве.`) }) } });
    }
    if (u.startsWith('https://commons.wikimedia.org/')) { commons++; return ok({ query: { pages: { 1: { index: 1, imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://upload.wikimedia.org/k.jpg' }] } } } }); }
    if (u.startsWith('https://img.') || u.startsWith('https://upload.wikimedia.org/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    const feed = SECTIONS.flatMap((s) => s.feeds).find((f) => f === u);
    if (feed && /lenta\.ru/.test(feed)) return new Response(`<rss><item><title>ПВО за ночь перехватили и уничтожили 531 украинский беспилотник</title><link>https://lenta.ru/news/pvo</link><pubDate>${now}</pubDate><description>Минобороны России сообщило: над территориями Брянской, Курской областей и над акваторией Черного моря перехвачены 531 БПЛА.</description></item></rss>`, { status: 200 });
    if (feed && /ukrinform/.test(feed)) return new Response(`<rss><item><title>Повітряні сили: ППО знешкодила 271 з 288 дронів, ворог атакував шістьма балістичними ракетами</title><link>https://www.ukrinform.ua/ppo</link><pubDate>${now}</pubDate><description>У ніч противник атакував 6 балістичними ракетами та 288 ударними БпЛА.</description></item>${rss(`${new URL(feed).hostname}${new URL(feed).pathname}`.replace(/\W+/g, '')).replace(/^<rss[^>]*>/, '')}`, { status: 200 });
    if (feed) { const f = new URL(feed); return new Response(rss(`${f.hostname}${f.pathname}`.replace(/\W+/g, '')), { status: 200 }); }
    // article pages (og:image for items without a thumbnail) — StopFake's carry none
    if (u.includes('stopfake')) return new Response('<html><head></head></html>', { status: 200, headers: { 'content-type': 'text/html' } });
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
      assert.ok(s.items.length >= 4 && s.items.length <= 5, `${s.id}: ${s.items.length}`);
      assert.ok(s.items.every((x) => x.image && x.summary && x.ai));
    }
    // No news twice: the key ones leave their sections, and a feed shared by two sections feeds only one.
    const urls = j.sections.flatMap((s) => s.items.map((x) => x.url));
    assert.equal(new Set(urls).size, urls.length);
    const editor = sortCalls + 1; // the batches sorted into sections + one look over all headlines
    assert.equal(ai, editor + 18); // + 8 sections in Ukrainian and in English + the two night reports
    assert.equal(sortCalls, 7);
    assert.deepEqual({ ...j.editor, kept: undefined, pool: undefined, feeds: undefined, airHeads: undefined }, { feeds: undefined, airHeads: undefined, sections: 7, judged: 7, events: true, short: 0, translated: j.sections.flatMap((s) => s.items).length, kept: undefined, pool: undefined, reports: { ru: 'used', ua: 'used' } });
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
    const pic = j.sections[1].items.find((x) => x.image).image;
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
  assert.equal(s.text, 'Армія РФ завдала удару по Харкову. Київ вимагає перехоплювачів.');
});

test('the editor’s answers: keep or not for a section; same events; one news per event, the pictured one kept', () => {
  const items = [{ title: 'a', image: '' }, { title: 'b', image: 'https://p/b.jpg' }, { title: 'c' }, { title: 'd' }, { title: 'e' }];
  assert.deepEqual(readKeep('{"keep":{"1":1,"2":0,"3":"так","5":true}}', items), [true, false, true, undefined, true]);
  assert.equal(readKeep('no json', items), null);
  assert.equal(readKeep('{"keep":{"1":1}}', items), null); // too few answers to trust
  assert.match(keepPrompt(SECTIONS[5], items)[0].content, /4\.2 ОіВТ.*Тема розділу: озброєння/s);
  const ev = readEvents('{"same":[[1,2],[5]],"key":[2,4,77]}', items);
  assert.deepEqual(ev, { groups: [[0, 1]], key: [1, 3] });
  assert.deepEqual([...dropRepeats(items, ev.groups).drop], [0]);
  assert.match(eventsPrompt(items)[0].content, /ту саму подію/);
  // A group the model lumps together is trusted only where the headlines share a telling word.
  const heads = [{ title: 'US approves 500 Patriot missiles' }, { title: 'Zelenskyy urges faster Patriot deliveries' }, { title: 'Canada gives €500m to Ukraine' }, { title: 'Kabila turns rebel leader in Congo' }];
  assert.deepEqual(checkGroups(heads, [[0, 1, 2, 3]]), [[0, 1]]); // «500» alone ties nothing
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
  assert.equal(composeReport('ru', '{"count": 531, "regions": null}', ''), '');
  assert.equal(composeReport('ru', '{"count": 531, "regions": "Брянской области"}', ''), ''); // Russian, not Ukrainian
  assert.doesNotMatch(composeReport('ua', '{"ballistic": 0, "cruise": 0, "drones": 120, "downed": 100}', '2026-10-28T07:00:00Z'), /ракет/);
});
