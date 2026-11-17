// The company logo from its own site: only public host names are asked, and the best icon of a page is chosen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHost, iconsOf } from '../../api/_logo.js';

test('cleanHost keeps public host names and refuses addresses and local names', () => {
  assert.equal(cleanHost('https://www.Naftogaz.com/about'), 'www.naftogaz.com');
  assert.equal(cleanHost('dou.ua'), 'dou.ua');
  for (const bad of ['127.0.0.1', 'localhost', 'http://10.0.0.5/x', 'intra.local', 'a', 'foo.internal', 'exa mple.com', '[::1]', '']) assert.equal(cleanHost(bad), '', bad);
});

test('iconsOf: touch icon and large icons first; data:, http and foreign-scheme links dropped', () => {
  const html = `<head>
    <link rel="icon" href="/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="/i32.png">
    <link rel='apple-touch-icon' sizes='180x180' href='https://cdn.example.org/touch.png'>
    <link rel="mask-icon" href="/mask.svg">
    <link rel="icon" href="data:image/png;base64,AAAA">
    <link rel="icon" href="http://example.org/plain.png">
    <link rel="stylesheet" href="/a.css"></head>`;
  const got = iconsOf(html, 'https://example.org/');
  assert.deepEqual(got.map((x) => x.url), ['https://cdn.example.org/touch.png', 'https://example.org/i32.png', 'https://example.org/favicon.ico']);
});
