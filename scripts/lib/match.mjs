// Name matching for the watch conveyor and the sanctions lists — pure functions with no Node or browser
// dependencies, shared by the server (scripts/lib/watch.mjs, api/watch.js) and the platform (manual RNBO list).

/* ---------- names ---------- */

// Ukrainian (КМУ 2010) and Russian letters to Latin — sanctions lists are in Latin script.
const TR = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '', ё: 'e', "'": '', '’': '', 'ʼ': '',
};
export const translit = (s) => [...String(s).toLowerCase()].map((c) => (c in TR ? TR[c] : c)).join('');

// Legal forms and filler words that differ between registries and lists.
const NOISE = new Set([
  'tov', 'tzov', 'pp', 'pat', 'prat', 'at', 'vat', 'zat', 'dp', 'kp', 'fop', 'ooo', 'oao', 'zao', 'pao', 'ao', 'ip',
  'llc', 'ltd', 'limited', 'inc', 'corp', 'corporation', 'co', 'company', 'jsc', 'pjsc', 'ojsc', 'cjsc', 'plc', 'gmbh', 'ag', 'sa', 'srl', 'bv', 'nv', 'oy', 'ab', 'as',
  'the', 'of', 'and', 'group', 'holding', 'holdings',
  'tovarystvo', 'z', 'obmezhenoiu', 'vidpovidalnistiu', 'aktsionerne', 'tovarishchestvo', 'obshchestvo', 's', 'ogranichennoi', 'otvetstvennostiu', 'aktsionernoe',
]);
// Words too common to identify a company on their own.
const GENERIC = new Set(['energy', 'energiia', 'trading', 'treidynh', 'invest', 'investment', 'service', 'servis', 'international', 'global', 'industrial', 'logistics', 'lohistyka', 'capital', 'finance', 'resources', 'technologies', 'systems', 'ukraine', 'ukraina', 'bank', 'shipping', 'metal', 'agro']);
export function normName(s) {
  return translit(s).replace(/[«»"“”„'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((t) => t && !NOISE.has(t)).join(' ');
}

/** Similarity of two normalised names, 0..1. */
export function nameScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = a.split(' '), B = b.split(' ');
  const [short, long] = A.length <= B.length ? [A, new Set(B)] : [B, new Set(A)];
  if (short.every((t) => long.has(t))) {
    if (short.length >= 2) return 0.9;
    return short[0].length >= 6 && !GENERIC.has(short[0]) ? 0.75 : 0.4; // one distinctive word inside a longer name
  }
  // The leading word of either name is a distinctive shared word («Ромашка Трейдинг» ↔ «Romashka Trading»):
  // English words written in Ukrainian don't transliterate back, so the brand word carries the match. Checked by hand.
  const key = (t) => t.length >= 6 && !GENERIC.has(t);
  if ((key(A[0]) && B.includes(A[0])) || (key(B[0]) && A.includes(B[0]))) return 0.75;
  const inter = A.filter((t) => B.includes(t)).length;
  return inter / new Set([...A, ...B]).size;
}

/** «ТОВ Ромашка; 12345678» → { name, norm, code }. One per non-empty line. */
export function parseTerms(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const [name, code] = line.split(';').map((x) => x.trim());
    return { name, norm: normName(name), code: code && /^[A-Za-z0-9-]{5,20}$/.test(code) ? code.replace(/-/g, '') : null };
  }).filter((t) => t.name);
}

/* ---------- CSV ---------- */

export function parseCsv(text, sep = ',') {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
export const blank = (v) => (v == null || v.trim() === '' || v.trim() === '-0-' ? '' : v.trim());

/** Best match of each term against a list: [{ term, entry, score, how }]. */
export function matchList(terms, entries, threshold = 0.75) {
  const prepared = entries.map((e) => ({ e, norms: [...new Set(e.names.map(normName).filter(Boolean))], text: `${e.remarks} ${e.names.join(' ')}` }));
  const out = [];
  for (const t of terms) {
    let best = null;
    for (const { e, norms, text } of prepared) {
      if (t.code && text.replace(/[\s-]/g, '').includes(t.code)) { best = { entry: e, score: 1, how: 'код' }; break; }
      for (const n of norms) {
        const s = nameScore(t.norm, n);
        if (s >= threshold && (!best || s > best.score)) best = { entry: e, score: s, how: s === 1 ? 'назва' : 'схожа назва' };
      }
    }
    if (best) out.push({ term: t, ...best });
  }
  return out;
}

/* ---------- Ukraine: State Register of Sanctions (РНБО) ---------- */

// The register's CSV export (drs.nsdc.gov.ua → «Юридичні особи» → CSV). Column names are found by meaning,
// not position, so a changed export still parses: names (Ukrainian, Latin, other), tax / registration codes.
const NAME_COL = /name|назв|найменув|піб|прізвищ|title|alias|синонім/i;
const CODE_COL = /tax|код|єдрпоу|іпн|inn|ogrn|огрн|registration|реєстрац|identif/i;
const ID_COL = /^(id|ідентифікатор|номер запису|subject_?id)$/i;
const PROG_COL = /decree|указ|рішення|підстав|basis|appendix|додат/i;
export function parseRnbo(text) {
  const t = String(text || '').replace(/^\uFEFF/, '');
  const first = t.slice(0, t.indexOf('\n') + 1 || t.length);
  const sep = [';', ',', '\t'].map((c) => [c, first.split(c).length]).sort((x, y) => y[1] - x[1])[0][0];
  const rows = parseCsv(t, sep);
  const head = (rows.shift() || []).map((h) => h.trim());
  const nameCols = head.map((h, i) => (NAME_COL.test(h) ? i : -1)).filter((i) => i >= 0);
  const codeCols = head.map((h, i) => (CODE_COL.test(h) ? i : -1)).filter((i) => i >= 0);
  const idCol = head.findIndex((h) => ID_COL.test(h));
  const progCol = head.findIndex((h) => PROG_COL.test(h));
  if (!nameCols.length) throw new Error('Не знайдено стовпця з назвою — це експорт «Юридичні особи» з drs.nsdc.gov.ua?');
  const out = [];
  rows.forEach((r, i) => {
    const names = [...new Set(nameCols.flatMap((c) => String(r[c] || '').split(/\s*[;|]\s*/)).map((x) => x.trim()).filter((x) => x.length > 1))];
    if (!names.length) return;
    const codes = codeCols.map((c) => String(r[c] || '').replace(/[^\dA-Za-z]/g, '')).filter((x) => x.length >= 5);
    out.push({ list: 'rnbo', id: idCol >= 0 && r[idCol] ? String(r[idCol]).trim() : `row-${i + 1}`, name: names[0], names, type: 'entity', program: progCol >= 0 ? blank(r[progCol] || '') : '', remarks: codes.join(' ') });
  });
  return out;
}

/** A short stable id from text (FNV-1a, 128 bits as hex) — same on the server and in the browser. */
export function hashId(s) {
  let out = '';
  for (const seed of [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]) {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    out += h.toString(16).padStart(8, '0');
  }
  return out;
}

export const RNBO_SOURCE = { id: 'w-src-rnbo', name: 'Державний реєстр санкцій (РНБО)', class: 'FININT', reliability: 'A — повністю надійне', access: 'Відкриті дані', notes: 'drs.nsdc.gov.ua — офіційний реєстр санкцій України, Апарат РНБО.' };

/** The finding a match against the RNBO register becomes (server run and manual upload alike). */
export function rnboFinding(w, m, day) {
  return {
    watchlist: w.id, clearance: w.clearance ?? 1, received: day,
    fingerprint: hashId(`${w.id}|rnbo|${m.entry.id}|${m.term.norm}`),
    source: 'rnbo',
    title: `${m.term.name}: ${m.how === 'назва' || m.how === 'код' ? 'збіг' : 'можливий збіг'} у Державному реєстрі санкцій (РНБО)`,
    url: 'https://drs.nsdc.gov.ua/',
    summary: [
      `Об’єкт спостереження: ${m.term.name}${m.term.code ? ` (код ${m.term.code})` : ''}.`,
      `Запис у реєстрі: ${m.entry.name}${m.entry.names.length > 1 ? ` (також: ${m.entry.names.slice(1, 4).join('; ')})` : ''}${m.entry.remarks ? `; коди: ${m.entry.remarks}` : ''}${m.entry.program ? `; підстава: ${m.entry.program}` : ''}; запис ${m.entry.id}.`,
      `Збіг за: ${m.how}, оцінка ${Math.round(m.score * 100)}%. Перевірте вручну на drs.nsdc.gov.ua: однакова назва ще не означає ту саму особу.`,
    ].join('\n'),
    credibility: m.score === 1 ? '2 — імовірно правдиве' : '3 — можливо правдиве',
  };
}
