// SITUATION dashboards (the public workspace at /situation): the data model, parsing what people type into a
// widget, the starter templates and checking an imported file. The page itself is src/site/situation.js.

export const TYPES = {
  kpi: { name: 'Indicator', hint: '' },
  line: { name: 'Trend', hint: 'One point per line: label, value — e.g. 2026-01, 4.2' },
  bars: { name: 'Comparison', hint: 'One bar per line: label, value — e.g. Poland, 3.1' },
  table: { name: 'Table', hint: 'Comma-separated; the first line is the header.' },
  map: { name: 'Map', hint: 'One place per line: name, latitude, longitude, value (optional) — e.g. Kyiv, 50.45, 30.52, 12' },
  links: { name: 'Link graph', hint: 'One link per line: A -> B (or A, B) — e.g. Holding Ltd -> Subsidiary LLC' },
  note: { name: 'Note', hint: '' },
};

let seq = 0;
export const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const num = (s) => {
  const t = String(s ?? '').trim().replace(/\s/g, '').replace(/,(?=\d{1,2}$)/, '.');
  return t === '' ? NaN : Number(t);
};
const lines = (text) => String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
// «a, b, c»; a line with semicolons or tabs is split on those instead, so «Poland; 3,1» keeps its decimal comma.
const cells = (l) => l.split(/[;\t]/.test(l) ? /\s*[;\t]\s*/ : /\s*,\s*/);

/** label, value rows (trend and comparison). Lines that do not end in a number are skipped. */
export function parseSeries(text) {
  return lines(text).map((l) => {
    const c = cells(l);
    const value = num(c[c.length - 1]);
    return { label: c.slice(0, -1).join(', ') || '', value };
  }).filter((r) => r.label && Number.isFinite(r.value));
}

/** A table: the first line is the header; rows are padded to it. */
export function parseTable(text) {
  const ls = lines(text).map(cells);
  if (!ls.length) return { head: [], rows: [] };
  const head = ls[0];
  return { head, rows: ls.slice(1).map((r) => head.map((_, i) => r[i] ?? '')) };
}

/** Places: name, lat, lon, value? — only real coordinates. */
export function parsePlaces(text) {
  return lines(text).map((l) => {
    const c = cells(l);
    return { name: c[0], lat: num(c[1]), lon: num(c[2]), value: c[3] === undefined ? null : num(c[3]) };
  }).filter((p) => p.name && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

/** Links: «A -> B», «A → B» or «A, B»; the nodes with how many links each has. */
export function parseLinks(text) {
  const edges = lines(text).map((l) => l.split(/\s*(?:->|→|—>|,|;|\t)\s*/)).filter((p) => p.length >= 2 && p[0] && p[1]).map((p) => [p[0], p[1]]);
  const deg = new Map();
  for (const [a, b] of edges) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
  return { edges, nodes: [...deg].map(([id, n]) => ({ id, n })) };
}

export const widget = (type, title, data, size = 1) => ({ id: uid(), type, title, size, data });
export const blankWidget = (type) => widget(type, TYPES[type].name, type === 'kpi' ? { value: '', unit: '', change: '', note: '' } : type === 'note' ? { text: '' } : { rows: '' }, type === 'map' || type === 'table' ? 2 : 1);
export const board = (name, widgets = [], sample = false) => ({ id: uid(), name, sample, widgets });

// Starter boards: the structure of a country, a company and a sector view, filled with example values that the
// page marks as examples until they are replaced.
export const TEMPLATES = {
  country: () => board('Country overview', [
    widget('kpi', 'Inflation', { value: '9.1', unit: '%', change: '-0.4', note: 'Year on year, latest month' }),
    widget('kpi', 'Policy rate', { value: '15.5', unit: '%', change: '0', note: 'Central bank' }),
    widget('kpi', 'Exchange rate', { value: '41.8', unit: 'per USD', change: '+0.3', note: 'Official' }),
    widget('line', 'Industrial output, index', { rows: '2026-01, 98\n2026-02, 99\n2026-03, 101\n2026-04, 100\n2026-05, 103\n2026-06, 104\n2026-07, 103\n2026-08, 106' }, 2),
    widget('bars', 'Trade partners, share %', { rows: 'Partner A, 18\nPartner B, 12\nPartner C, 9\nPartner D, 7\nPartner E, 5' }, 2),
    widget('map', 'Places to watch', { rows: 'Kyiv, 50.45, 30.52, 3\nLviv, 49.84, 24.03, 1\nOdesa, 46.48, 30.72, 2\nKharkiv, 49.99, 36.23, 2' }, 3),
    widget('note', 'Assessment', { text: 'What changed this week, what it means, and what to watch next.' }, 3),
  ], true),
  company: () => board('Company check', [
    widget('kpi', 'Revenue', { value: '12.4', unit: 'm', change: '+8', note: 'Last reported year' }),
    widget('kpi', 'Court cases', { value: '3', unit: '', change: '+1', note: 'Open' }),
    widget('kpi', 'Sanctions hits', { value: '0', unit: '', change: '0', note: 'Lists checked' }),
    widget('links', 'Owners and links', { rows: 'Owner One -> Company\nHolding Ltd -> Company\nHolding Ltd -> Sister Co\nCompany -> Subsidiary\nDirector -> Company\nDirector -> Sister Co' }, 2),
    widget('table', 'Tenders won', { rows: 'Date, Buyer, Amount\n2026-03-14, Buyer A, 1.2m\n2026-05-02, Buyer B, 0.4m\n2026-08-21, Buyer C, 2.9m' }, 2),
    widget('note', 'Conclusion', { text: 'Risk level, the reasons for it, and what to check before signing.' }, 3),
  ], true),
  sector: () => board('Sector monitor', [
    widget('line', 'Price index', { rows: 'Jan, 100\nFeb, 102\nMar, 101\nApr, 105\nMay, 109\nJun, 108\nJul, 112\nAug, 115' }, 2),
    widget('kpi', 'Market size', { value: '3.2', unit: 'bn', change: '+5', note: 'Estimate' }),
    widget('bars', 'Market share, %', { rows: 'Leader, 31\nSecond, 22\nThird, 14\nOthers, 33' }),
    widget('table', 'Regulation calendar', { rows: 'Date, Measure, Status\n2026-12-01, New licence rules, Draft\n2027-01-01, Tax change, Adopted\n2027-07-01, Market law in force, Expected' }, 2),
    widget('note', 'Signals to watch', { text: '▲ what would raise the outlook\n▼ what would lower it' }, 3),
  ], true),
};

/** The saved state, or a fresh one. Anything malformed is dropped rather than breaking the page. */
export function readState(raw) {
  let s = null;
  try { s = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { s = null; }
  const boards = Array.isArray(s?.boards) ? s.boards.map(cleanBoard).filter(Boolean) : [];
  return { v: 1, boards, current: boards.some((b) => b.id === s?.current) ? s.current : boards[0]?.id || null };
}
export function cleanBoard(b) {
  if (!b || typeof b !== 'object') return null;
  const widgets = (Array.isArray(b.widgets) ? b.widgets : []).filter((w) => w && TYPES[w.type]).map((w) => ({
    id: String(w.id || uid()), type: w.type, title: String(w.title ?? TYPES[w.type].name).slice(0, 120),
    size: [1, 2, 3].includes(w.size) ? w.size : 1, edited: Boolean(w.edited),
    data: Object.fromEntries(Object.entries(w.data && typeof w.data === 'object' ? w.data : {}).map(([k, v]) => [k, String(v ?? '').slice(0, 20000)])),
  }));
  return { id: String(b.id || uid()), name: String(b.name || 'Dashboard').slice(0, 80), sample: Boolean(b.sample), widgets };
}
