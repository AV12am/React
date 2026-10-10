// Логотипи: the best icon on a page, and addresses a server must not fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logoCandidates, isPrivateAddress, wikidataQuery, parseWikidata, commonsThumb } from '../../scripts/lib/logo.mjs';

test('candidates: apple-touch-icon, then svg, then largest icon, then fallbacks', () => {
  const html = `<head><link rel="icon" href="/fav-32.png" sizes="32x32"><link rel="icon" type="image/svg+xml" href="/logo.svg">
    <link rel='apple-touch-icon' sizes='180x180' href='https://cdn.x.ua/apple.png'><meta property="og:image" content="/banner.jpg"></head>`;
  const c = logoCandidates(html, 'https://x.ua/uk/');
  assert.deepEqual(c.slice(0, 3), ['https://cdn.x.ua/apple.png', 'https://x.ua/logo.svg', 'https://x.ua/apple-touch-icon.png']);
  assert.ok(c.includes('https://x.ua/favicon.ico'));
  assert.ok(!c.includes('https://x.ua/banner.jpg'));
});

test('private addresses refused', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '100.64.0.1']) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '2a00:1450::1']) assert.ok(!isPrivateAddress(ip), ip);
});

test('wikidata: query by EDRPOU code only; one logo trusted, several not', () => {
  assert.equal(wikidataQuery('3048721'), '');
  assert.equal(wikidataQuery('30487219; DROP'), '');
  const q = decodeURIComponent(wikidataQuery('30487219'));
  assert.match(q, /wdt:P3125 "30487219"/);
  assert.match(q, /P154/);
  const one = { results: { bindings: [{ logo: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/ATB%20logo.svg' }, site: { value: 'https://www.atbmarket.com/' } }] } };
  assert.deepEqual(parseWikidata(one), { logo: 'http://commons.wikimedia.org/wiki/Special:FilePath/ATB%20logo.svg', site: 'https://www.atbmarket.com/' });
  const two = { results: { bindings: [{ logo: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/A.svg' } }, { logo: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/B.svg' } }] } };
  assert.equal(parseWikidata(two).logo, '');
  assert.deepEqual(parseWikidata({}), { logo: '', site: '' });
});

test('commons thumbnail: https, width set, other hosts refused', () => {
  assert.equal(commonsThumb('http://commons.wikimedia.org/wiki/Special:FilePath/ATB%20logo.svg'), 'https://commons.wikimedia.org/wiki/Special:FilePath/ATB%20logo.svg?width=256');
  assert.equal(commonsThumb('https://evil.example/wiki/Special:FilePath/x.svg'), '');
  assert.equal(commonsThumb(''), '');
});
