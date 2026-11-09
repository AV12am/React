import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceOf, browserOf, osOf } from '../../api/_visits.js';

test('device, browser and system from the browser description', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0';
  const tab = 'Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  assert.deepEqual([deviceOf(iphone), browserOf(iphone), osOf(iphone)], ['Телефон', 'Safari', 'iOS']);
  assert.deepEqual([deviceOf(win), browserOf(win), osOf(win)], ['Комп’ютер', 'Edge', 'Windows']);
  assert.deepEqual([deviceOf(tab), browserOf(tab), osOf(tab)], ['Планшет', 'Chrome', 'Android']);
});
