// Логотипи: the best icon on a page, and addresses a server must not fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logoCandidates, isPrivateAddress } from '../../scripts/lib/logo.mjs';

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
