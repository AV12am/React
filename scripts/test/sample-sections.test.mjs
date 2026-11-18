// Every sample's sections: one per part, on its own page, inside the page, never empty; the parts that sit side by side
// split the width; and on every page the sections follow the order of the parts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../../src/site/services-data.js';
import { sectionBoxes } from '../../src/site/sample-sections.js';

test('sample sections: one box per part, inside its page, ordered, side-by-side parts split the width', () => {
  for (const [id, sm] of Object.entries(SAMPLES)) {
    for (const pl of Object.keys(sm.pages)) {
      const marks = sm.marks[pl];
      assert.equal(marks.length, sm.parts.length, `${id} ${pl}: a mark per part`);
      assert.equal(sm.ends[pl].length, sm.pages[pl], `${id} ${pl}: an end per page`);
      const boxes = sectionBoxes(sm, pl);
      boxes.forEach(([pg, x0, y0, x1, y1], k) => {
        const where = `${id} ${pl} part ${k + 1}`;
        assert.equal(pg, marks[k][0], where);
        assert.ok(pg < sm.pages[pl], where);
        assert.ok(x0 >= 0 && x1 <= 1 && y0 >= 0 && y1 <= 1, where);
        assert.ok(x1 - x0 > 0.2 && y1 - y0 > 0.02, `${where}: not empty`);
        assert.ok(y0 < marks[k][2] && marks[k][2] < y1, `${where}: holds its own start`);
      });
    }
  }
  // CR-001: «Scenarios» and «For your decision» begin side by side — each takes its own half
  const cr = sectionBoxes(SAMPLES['country-market-risk-brief'], 'en');
  assert.ok(cr[3][3] <= cr[4][1] && cr[3][1] < cr[4][1], 'scenarios left of the decision');
});
