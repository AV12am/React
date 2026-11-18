// A sample document's sections as boxes over its page pictures (src/site/services.js) — pure, so it can be tested.
// Each part runs from its mark to the next part's mark on the page (or the page's end); two parts side by side
// share the width; a sample may fix a box by hand (`boxes`). → [page, x0, y0, x1, y1] per part, fractions of the page.
export function sectionBoxes(sm, pl) {
  const marks = sm.marks[pl];
  const ends = sm.ends?.[pl] || [];
  const fixed = sm.boxes?.[pl] || {};
  const PAD = 0.014;
  return marks.map(([pg, x, y], k) => {
    if (fixed[k]) return fixed[k];
    const same = marks.map((m, j) => ({ m, j })).filter(({ m, j }) => j !== k && m[0] === pg);
    const beside = same.find(({ m }) => Math.abs(m[2] - y) < 0.02 && Math.abs(m[1] - x) > 0.2);
    const below = same.filter(({ m }) => m[2] > y + 0.02).map(({ m }) => m[2]);
    const y1 = Math.min(below.length ? Math.min(...below) - PAD : 1, (ends[pg] ?? 0.94) + 0.012);
    let x0 = 0.045; let x1 = 0.955;
    if (beside) { if (beside.m[1] > x) x1 = beside.m[1] - 0.022; else x0 = x - 0.022; }
    return [pg, x0, y - PAD, x1, y1];
  });
}
