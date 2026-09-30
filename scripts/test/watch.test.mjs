// Watch conveyor on fixtures shaped like the real sources (synthetic data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normName, nameScore, parseTerms, parseOfac, parseEu, matchList, parseGdelt, parseFeed, mentions, runWatch, toIntake, gdeltUrl } from '../lib/watch.mjs';

const cfg = JSON.parse(readFileSync(new URL('../watch-sources.json', import.meta.url), 'utf8'));

const SDN = [
  '36,"AEROCARIBBEAN AIRLINES",-0- ,"CUBA",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"Havana, Cuba."',
  '9001,"ROMASHKA TRADING LIMITED","-0- ","RUSSIA-EO14024",-0-,-0-,-0-,-0-,-0-,-0-,-0-,"Registration ID 12345678 (Ukraine); Tax ID No. 7700000000"',
  '9002,"IVANOV, Petro","individual","UKRAINE-EO13660",-0-,-0-,-0-,-0-,-0-,-0-,-0-,"DOB 1970"',
].join('\r\n');
const ALT = '9001,101,"aka","ROMASHKA LLC",-0-\r\n9001,102,"fka","ROMASHKA HOLDING",-0-';
const EU = [
  'FileGenerationDate;Entity_LogicalId;Entity_SubjectType;Entity_Regulation_Programme;Entity_Remark;NameAlias_WholeName',
  '2026-09-01;555;enterprise;RUS;"Grain exporter";"Stepove Zerno"',
  '2026-09-01;555;enterprise;RUS;"Grain exporter";"STEPOVE ZERNO JSC"',
  '2026-09-01;777;person;UKR;;"Somebody Else"',
].join('\n');

test('names: transliteration, legal forms, similarity', () => {
  assert.equal(normName('ТОВ «Ромашка Трейдинг»'), 'romashka treidynh');
  assert.equal(normName('Romashka Trading Limited'), 'romashka trading');
  assert.equal(normName('АТ "Степове Зерно"'), 'stepove zerno');
  assert.equal(nameScore('stepove zerno', 'stepove zerno'), 1);
  assert.equal(nameScore('romashka', 'romashka holding'), 0.75);
  assert.ok(nameScore('energy', 'global energy trading') < 0.75, 'short common word is not a match');
});

test('terms with codes', () => {
  assert.deepEqual(parseTerms('ТОВ Ромашка; 12345678\n\n  Степове Зерно  ').map((t) => [t.name, t.code]), [['ТОВ Ромашка', '12345678'], ['Степове Зерно', null]]);
});

test('OFAC and EU lists parse and match', () => {
  const ofac = parseOfac(SDN, ALT);
  assert.equal(ofac.length, 3);
  assert.deepEqual(ofac[1].names, ['ROMASHKA TRADING LIMITED', 'ROMASHKA LLC', 'ROMASHKA HOLDING']);
  const eu = parseEu(EU);
  assert.equal(eu.length, 2); assert.equal(eu[0].names.length, 2);
  const m1 = matchList(parseTerms('ТОВ Ромашка; 12345678'), ofac);
  assert.equal(m1[0].how, 'код'); assert.equal(m1[0].entry.id, '9001');
  const m2 = matchList(parseTerms('АТ Степове Зерно'), eu);
  assert.equal(m2[0].how, 'назва'); assert.equal(m2[0].score, 1);
  assert.deepEqual(matchList(parseTerms('Сонячна Енергія'), [...ofac, ...eu]), []);
});

test('GDELT and feeds', () => {
  assert.match(gdeltUrl(cfg.gdelt, parseTerms('Степове Зерно\nRomashka')), /query=%28%22%D0%A1/);
  const g = parseGdelt({ articles: [{ url: 'https://news.example/a', title: ' Port closed ', seendate: '20260928T101500Z', domain: 'news.example', language: 'English', sourcecountry: 'Ukraine' }, { title: 'no url' }] });
  assert.deepEqual(g[0], { url: 'https://news.example/a', title: 'Port closed', at: '2026-09-28T10:15:00Z', outlet: 'news.example', lang: 'English', country: 'Ukraine' });
  const rss = parseFeed('<rss><channel><item><title><![CDATA[Степове Зерно купує елеватор]]></title><link>https://m.example/1</link><pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Текст&lt;/p&gt;</description></item></channel></rss>');
  assert.equal(rss[0].title, 'Степове Зерно купує елеватор'); assert.equal(rss[0].text, 'Текст');
  const atom = parseFeed('<feed><entry><title>Stepove Zerno expands</title><link href="https://a.example/2"/><updated>2026-09-28T09:00:00Z</updated><summary>x</summary></entry></feed>');
  assert.equal(atom[0].url, 'https://a.example/2');
  const [t] = parseTerms('Степове Зерно');
  assert.ok(mentions(rss[0].title, t)); assert.ok(mentions(atom[0].title, t), 'transliterated mention');
});

test('runWatch: sanctions and media, deduplicated, errors reported', async () => {
  const routes = {
    'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV': SDN,
    'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV': ALT,
    'https://webgate.ec.europa.eu/': EU,
    'https://api.gdeltproject.org/': JSON.stringify({ articles: [{ url: 'https://news.example/a', title: 'Stepove Zerno news', seendate: '20260928T101500Z', domain: 'news.example' }, { url: 'https://news.example/a', title: 'dup', seendate: '20260928T101500Z' }] }),
    'https://feed.example/rss': '<rss><item><title>Про Степове Зерно</title><link>https://feed.example/p/1</link></item><item><title>Інше</title><link>https://feed.example/p/2</link></item></rss>',
  };
  const fetchImpl = async (url) => {
    const k = Object.keys(routes).find((x) => url.startsWith(x));
    if (!k) return { ok: false, status: 503, text: async () => '' };
    return { ok: true, status: 200, text: async () => routes[k] };
  };
  const lists = [
    { id: 'wl1', kind: 'Контрагенти й санкції', terms: 'ТОВ Ромашка; 12345678\nСтепове Зерно', clearance: 1 },
    { id: 'wl2', kind: 'Медіа', terms: 'Степове Зерно', feeds: 'https://feed.example/rss https://down.example/rss', clearance: 1 },
  ];
  const r = await runWatch({ watchlists: lists, fetchImpl, cfg, now: new Date('2026-09-28T12:00:00Z') });
  assert.equal(r.stats.wl1, 2);
  assert.equal(r.stats.wl2, 3); // two GDELT (same url) + one feed item, deduplicated below
  assert.equal(r.findings.filter((f) => f.watchlist === 'wl2').length, 2);
  assert.ok(r.errors.some((e) => e.source === 'rss' && /down\.example/.test(e.message)));
  const ofacHit = r.findings.find((f) => f.source === 'ofac');
  assert.match(ofacHit.title, /ТОВ Ромашка: збіг у списку «OFAC SDN/);
  const rec = toIntake(ofacHit, { now: new Date('2026-09-28T12:00:00Z') });
  assert.equal(rec.col, 'intake'); assert.equal(rec.source, 'w-src-ofac'); assert.equal(rec.stage, 'Надійшло'); assert.equal(rec.origin, 'auto');
  assert.equal(rec.id, toIntake(ofacHit).id, 'stable id across runs');
});

test('api/watch POST works without Supabase for small lists', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, status: 200, text: async () => (String(url).includes('gdelt') ? JSON.stringify({ articles: [{ url: 'https://n.example/1', title: 'Stepove Zerno' }] }) : '') });
  try {
    const { POST } = await import('../../api/watch.js');
    const res = await POST(new Request('http://x/api/watch', { method: 'POST', body: JSON.stringify({ watchlists: [{ id: 'w', kind: 'Медіа', terms: 'Степове Зерно' }] }) }));
    const body = await res.json();
    assert.equal(res.status, 200); assert.equal(body.findings.length, 1); assert.ok(body.sources.gdelt);
    const big = await POST(new Request('http://x/api/watch', { method: 'POST', body: JSON.stringify({ watchlists: [{ id: 'w', kind: 'Медіа', terms: Array.from({ length: 30 }, (_, i) => `term ${i}`).join('\n') }] }) }));
    assert.equal(big.status, 400);
  } finally { globalThis.fetch = saved; }
});
