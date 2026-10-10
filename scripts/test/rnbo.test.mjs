// РНБО: the register's CSV is parsed by column meaning; matches by name and by code; a 403 is reported plainly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRnbo, matchList, parseTerms, rnboFinding, hashId } from '../../scripts/lib/match.mjs';
import { runWatch } from '../../scripts/lib/watch.mjs';

const CSV = '﻿id;name_ukr;name_lat;synonyms;tax_id;decree\n'
  + '101;ТОВ "РОМАШКА ТРЕЙД";ROMASHKA TRADE LLC;ромашка-трейд;12345678;Указ №1/2024\n'
  + '102;АТ «Степове Зерно»;STEPOVE ZERNO JSC;;87654321;Указ №2/2025\n'
  + '103;;;;;\n';

test('parse: names, aliases, codes, program; empty rows dropped; delimiter detected', () => {
  const e = parseRnbo(CSV);
  assert.equal(e.length, 2);
  assert.equal(e[0].id, '101');
  assert.ok(e[0].names.includes('ROMASHKA TRADE LLC'));
  assert.match(e[0].remarks, /12345678/);
  assert.match(e[1].program, /Указ/);
  assert.equal(parseRnbo(CSV.replace(/;/g, ',')).length, 2);
  assert.throws(() => parseRnbo('a,b\n1,2\n'), /стовпця з назвою/);
});

test('match: by code and by transliterated name; stable fingerprint', () => {
  const e = parseRnbo(CSV);
  const m = matchList(parseTerms('Інша Назва; 87654321\nРомашка Трейд'), e);
  assert.deepEqual(m.map((x) => [x.entry.id, x.how]), [['102', 'код'], ['101', 'назва']]);
  const w = { id: 'w1', clearance: 1 };
  const f = rnboFinding(w, m[0], '2026-10-10');
  assert.equal(f.source, 'rnbo');
  assert.equal(f.fingerprint, rnboFinding(w, m[0], '2026-10-11').fingerprint);
  assert.equal(hashId('x').length, 32);
});

test('server run: RNBO 403 is a plain message, other sources still run', async () => {
  const cfg = { userAgent: 't', match: { report: 0.75 }, sanctions: { rnbo: { enabled: true, name: 'РНБО', url: 'https://drs.test/legal.csv' } } };
  const fetchImpl = async () => new Response('challenge', { status: 403 });
  const out = await runWatch({ watchlists: [{ id: 'w1', kind: 'Контрагенти й санкції', terms: 'Ромашка' }], fetchImpl, cfg });
  assert.equal(out.findings.length, 0);
  assert.match(out.errors[0].message, /лише браузер/);
  const ok = await runWatch({ watchlists: [{ id: 'w1', kind: 'Контрагенти й санкції', terms: 'Ромашка Трейд' }], fetchImpl: async () => new Response(CSV), cfg });
  assert.equal(ok.findings.length, 1);
  assert.equal(ok.findings[0].source, 'rnbo');
});
