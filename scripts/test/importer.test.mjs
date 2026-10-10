// Імпорт: CSV and Excel are read, columns matched by name, values checked against their fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { readTable, autoMap, rowToRecord, toDate } from '../../src/lib/importer.js';
import { registerOf } from '../../src/data/workspaces.js';

const reg = registerOf('ops', 'suppliers');
const look = { users: [{ id: 'u1', name: 'Олена Коваль', code: 'V-002' }], recordsOf: () => [], titleOf: (r) => r.name };
const file = (name, data) => ({ name, text: async () => data, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });

test('dates: ISO, dd.mm.yyyy, Excel serial', () => {
  assert.equal(toDate('2026-10-12'), '2026-10-12');
  assert.equal(toDate('5.3.2026'), '2026-03-05');
  assert.equal(toDate('46307'), '2026-10-12');
  assert.equal(toDate('завтра'), null);
});

test('CSV with ; — columns mapped by field label, select values checked', async () => {
  const head = reg.fields.filter((f) => !f.hidden).slice(0, 3).map((f) => f.label);
  const t = await readTable(file('s.csv', `﻿${head.join(';')}\nТОВ Тест;x;y\n`));
  assert.equal(t.rows.length, 1);
  const map = autoMap(reg, t.head);
  assert.equal(map[reg.title], 0);
  const r = rowToRecord(reg, t.rows[0], map, look);
  assert.equal(r.fields[reg.title], 'ТОВ Тест');
});

test('Excel .xlsx: shared strings and numbers from the first sheet', async () => {
  const xml = (s) => strToU8(s);
  const zip = zipSync({
    'xl/workbook.xml': xml('<workbook><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': xml('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': xml('<sst><si><t>Назва</t></si><si><t>Код</t></si><si><t>ТОВ «Ромашка»</t></si></sst>'),
    'xl/worksheets/sheet1.xml': xml('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>12345678</v></c></row></sheetData></worksheet>'),
  });
  const t = await readTable(file('s.xlsx', zip));
  assert.deepEqual(t.head, ['Назва', 'Код']);
  assert.deepEqual(t.rows[0], ['ТОВ «Ромашка»', '12345678']);
});
