// The CONTEXT News deck: a news address with «&» must not leave the PowerPoint file malformed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { newsPptx, xmlAttr } from '../../src/lib/newsExport.js';

const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='), (c) => c.charCodeAt(0));

test('a news link with «&» is written escaped: every XML part of the deck is well formed', async () => {
  assert.equal(xmlAttr('https://x.com/a?b=1&c=2&amp;d="3"'), 'https://x.com/a?b=1&amp;c=2&amp;d=&quot;3&quot;');
  const issue = { sections: [{ part: 'РОЗДІЛ 1', title: '', items: [{ url: 'https://www.bbc.co.uk/news/1?at_medium=RSS&at_campaign=rss', image: 'p', summary: 'Текст\u000b новини & <тест>' }] }] };
  const blob = await newsPptx(issue, new Map([['p', { bytes: JPEG }]]));
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  for (const [name, bytes] of Object.entries(files)) {
    if (!/\.(xml|rels)$/.test(name)) continue;
    const xml = strFromU8(bytes);
    assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(xml), `${name}: a bare «&»`);
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml), `${name}: a control character`);
  }
  const rels = strFromU8(files['ppt/slides/_rels/slide1.xml.rels']);
  assert.ok(rels.includes('at_medium=RSS&amp;at_campaign=rss'));
});
