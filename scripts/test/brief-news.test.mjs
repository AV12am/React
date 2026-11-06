// The morning brief's key news: the first section of the current CONTEXT News issue, whole, with its pictures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBrief, buildInsights, insightsHtml, insightsText } from '../../src/lib/brief.js';
import { briefPdf } from '../../src/lib/briefPdf.js';

const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='), (c) => c.charCodeAt(0));
const news = [
  { text: 'Перша новина повністю. Друге речення теж лишається.', url: 'https://example.com/a?x=1&y=2', domain: 'example.com', image: 'https://app.test/api/pulse?news=1&img=x', bytes: JPEG, type: 'jpg' },
  { text: 'Друга новина без фото.', url: '', domain: 'b.ua', image: '', bytes: null, type: '' },
];

test('the letter shows each key news whole, its picture and its outlet', () => {
  const ins = buildInsights({ records: [], tasks: [], now: Date.now(), me: { id: 'u', role: 'admin', clearance: 2 } });
  const html = insightsHtml(ins, null, news);
  assert.ok(html.includes('Друге речення теж лишається.'));
  assert.ok(html.includes('<img src="https://app.test/api/pulse?news=1&amp;img=x"'));
  assert.ok(html.includes('example.com'));
  assert.ok(insightsText(ins, null, news).includes('Перша новина повністю.'));
});

test('the PDF puts the picture beside the summary', async () => {
  const ins = buildInsights({ records: [], tasks: [], now: Date.now(), me: { id: 'u', role: 'admin', clearance: 2 } });
  const brief = buildBrief({ records: [], tasks: [], comments: [], me: { id: 'u', role: 'admin', clearance: 2 }, now: Date.now() });
  const fonts = ['Regular', 'Bold'].map((w) => readFileSync(new URL(`../../public/fonts/NotoSerif-${w}.ttf`, import.meta.url)));
  const bytes = await briefPdf({ brief, insights: ins, news, fonts });
  const raw = Buffer.from(bytes).toString('latin1');
  assert.ok(/\/Subtype\s*\/Image/.test(raw), 'the picture is in the PDF');
});
