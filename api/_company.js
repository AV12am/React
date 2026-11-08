// A company by its ЄДРПОУ code, from the open sources that know it — for SITUATION's «Перевірка контрагента»:
//   · the state register (ЄДР) through Opendatabot — the head, founders and beneficiaries, capital, activities
//     (needs EDR_API_KEY, paid per request: a company is asked once a week at most, and 150 times a day in all);
//   · GLEIF (free, no key) — the company's LEI and its group: direct and ultimate parents, subsidiaries;
//   · Wikidata (free, no key) — chief executive, owner, parent, subsidiaries, staff, website.
// GET /api/pulse?company=CODE → { code, card, people: [...], tree: [...], sources: [...], notes: [...] }.
// Nothing is invented: a source that does not answer is named in `notes`, its part stays empty.
import { env, db } from './_core.js';
import { edrUrl, EDR_DEFAULT_URL } from '../scripts/lib/edr.mjs';

const UA = 'ReactionCore/1.0 (+https://reactioncore.uk; company card from open registers)';
const KEY = env.EDR_API_KEY || '';
const URL_T = env.EDR_API_URL || EDR_DEFAULT_URL;
const WEEK = 7 * 86400000;
const DAILY = 150;

const pick = (o, keys) => { for (const k of keys) { const v = k.split('.').reduce((x, p) => x?.[p], o); if (v != null && v !== '') return v; } return ''; };
const text = (v) => (v == null ? '' : typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : typeof v === 'object' ? String(v.address || v.title || v.name || v.full_name || '') : String(v));
const get = async (url, ms = 12000, headers = {}) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
};
const read = async (id) => (await db(`core_docs?kind=eq.pulse&id=eq.${encodeURIComponent(id)}&select=doc`).catch(() => []))[0]?.doc || null;
const keep = (id, doc) => db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { kind: 'pulse', id, doc: { ...doc, id, clearance: 0 } } }).catch(() => {});

// ── ЄДР through Opendatabot ──────────────────────────────────────────────────────────────────────────────────────
async function budget() {
  const day = new Date().toISOString().slice(0, 10);
  const b = await read('edr-budget');
  const n = b?.day === day ? b.n || 0 : 0;
  if (n >= DAILY) return false;
  await keep('edr-budget', { day, n: n + 1 });
  return true;
}
export function registerOf(json) {
  const c = Array.isArray(json) ? json[0] : json?.data && !Array.isArray(json.data) ? json.data : Array.isArray(json?.data) ? json.data[0] : json;
  if (!c || typeof c !== 'object') return null;
  const acts = Array.isArray(c.activities) ? c.activities : [];
  const main = acts.find((a) => a.is_primary || a.isPrimary || a.primary) || acts[0];
  const card = {
    name: text(pick(c, ['full_name', 'fullName', 'name', 'short_name'])),
    short: text(pick(c, ['short_name', 'shortName'])),
    status: text(pick(c, ['status', 'state'])),
    head: text(pick(c, ['ceo_name', 'ceoName', 'head', 'director', 'manager'])),
    address: text(pick(c, ['location', 'address'])),
    activity: main ? [text(main.code), text(main.name)].filter(Boolean).join(' ') : text(pick(c, ['activity', 'primary_activity'])),
    capital: text(pick(c, ['authorised_capital', 'authorized_capital', 'capital', 'registration.capital'])),
    registered: text(pick(c, ['registration.date', 'registration_date', 'registrationDate', 'date_registration'])).slice(0, 10),
  };
  const people = [];
  const head = card.head;
  if (head) people.push({ role: 'Керівник', name: head, share: '', country: '', source: 'ЄДР' });
  for (const h of Array.isArray(c.heads) ? c.heads : []) {
    const name = text(h.name || h.title);
    if (name && name !== head) people.push({ role: text(h.role) || 'Керівник', name, share: '', country: '', source: 'ЄДР' });
  }
  for (const [list, role] of [[c.founders, 'Засновник'], [c.beneficiaries, 'Бенефіціар']]) {
    for (const b of Array.isArray(list) ? list : []) {
      const name = text(b.title || b.name);
      if (!name) continue;
      const r = text(b.role);
      people.push({ role: /бенефіц/i.test(r) ? 'Бенефіціар' : /засн|учасн/i.test(r) ? 'Засновник' : role, name, share: [b.capital != null && b.capital !== '' ? `${b.capital} грн` : '', b.amount_percent != null ? `${b.amount_percent}%` : ''].filter(Boolean).join(' · '), country: text(b.country || b.location?.country || ''), source: 'ЄДР' });
    }
  }
  return card.name ? { card, people } : null;
}
async function register(code, notes) {
  if (!KEY) { notes.push('ЄДР (керівник, засновники, бенефіціари): не підключено — потрібен ключ Opendatabot (EDR_API_KEY у Vercel).'); return null; }
  if (!(await budget())) { notes.push('ЄДР: денний ліміт запитів вичерпано, спробуйте завтра.'); return null; }
  try {
    const out = registerOf(await get(edrUrl(code, { url: URL_T, key: KEY }), 15000));
    if (!out) notes.push('ЄДР: порожня відповідь реєстру.');
    return out;
  } catch (e) {
    notes.push(`ЄДР: ${e.status === 404 ? 'компанію не знайдено' : e.status === 401 || e.status === 403 ? 'ключ API не прийнято' : e.message}.`);
    return null;
  }
}

// ── GLEIF: the legal entity identifier and the group ─────────────────────────────────────────────────────────────
const GLEIF = 'https://api.gleif.org/api/v1';
const entity = (r) => ({ lei: r?.id || r?.attributes?.lei || '', name: r?.attributes?.entity?.legalName?.name || '', country: r?.attributes?.entity?.legalAddress?.country || '', status: r?.attributes?.entity?.status || '' });
async function gleif(code, notes) {
  try {
    const found = await get(`${GLEIF}/lei-records?filter[entity.registeredAs]=${code}&filter[entity.legalAddress.country]=UA&page[size]=1`, 10000, { Accept: 'application/vnd.api+json' });
    const rec = found?.data?.[0];
    if (!rec) return null; // most Ukrainian companies have no LEI: not an error
    const me = entity(rec);
    const rel = async (path, relation) => {
      const j = await get(`${GLEIF}/lei-records/${me.lei}/${path}`, 10000, { Accept: 'application/vnd.api+json' }).catch(() => null);
      const list = Array.isArray(j?.data) ? j.data : j?.data ? [j.data] : [];
      return list.map(entity).filter((x) => x.name).map((x) => ({ relation, ...x, source: 'GLEIF' }));
    };
    const [parent, top, kids] = await Promise.all([rel('direct-parent', 'Материнська'), rel('ultimate-parent', 'Кінцева материнська'), rel('direct-children?page[size]=100', 'Дочірня')]);
    const tree = [...parent, ...top.filter((t) => !parent.some((p) => p.lei === t.lei)), ...kids];
    return { me, tree };
  } catch (e) {
    notes.push(`GLEIF не відповів: ${e.message}.`);
    return null;
  }
}

// ── Wikidata: what the encyclopaedia knows of the company (found by its LEI or its ЄДРПОУ) ─────────────────────
let edrpouProp = null; // Wikidata's property for the ЄДРПОУ code, looked up once
async function edrpouProperty() {
  if (edrpouProp !== null) return edrpouProp;
  const j = await get('https://www.wikidata.org/w/api.php?action=wbsearchentities&search=EDRPOU&type=property&language=en&format=json&limit=1', 8000).catch(() => null);
  edrpouProp = j?.search?.[0]?.id || '';
  return edrpouProp;
}
async function wikidata(code, lei, notes) {
  try {
    const prop = await edrpouProperty();
    const by = [prop && `{ ?item wdt:${prop} "${code}" }`, lei && `{ ?item wdt:P1278 "${lei}" }`].filter(Boolean).join(' UNION ');
    if (!by) return null;
    const q = `SELECT ?item ?itemLabel ?rel ?vLabel ?emp ?empAt ?site WHERE {
      ${by}
      # Only what holds now: a statement with an end date (a former head, a sold stake) is left out.
      OPTIONAL { { ?item p:P169 ?s. ?s ps:P169 ?v. BIND("ceo" AS ?rel) } UNION { ?item p:P127 ?s. ?s ps:P127 ?v. BIND("owner" AS ?rel) } UNION { ?item p:P749 ?s. ?s ps:P749 ?v. BIND("parent" AS ?rel) } UNION { ?item p:P355 ?s. ?s ps:P355 ?v. BIND("sub" AS ?rel) } UNION { ?item p:P488 ?s. ?s ps:P488 ?v. BIND("chair" AS ?rel) } UNION { ?item p:P112 ?s. ?s ps:P112 ?v. BIND("founder" AS ?rel) }
        FILTER NOT EXISTS { ?s pq:P582 ?ended } }
      OPTIONAL { ?item p:P1128 ?es. ?es ps:P1128 ?emp. OPTIONAL { ?es pq:P585 ?empAt } } OPTIONAL { ?item wdt:P856 ?site }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "uk,en". } } LIMIT 2000`;
    const j = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, 15000, { Accept: 'application/sparql-results+json' });
    const rows = j?.results?.bindings || [];
    if (!rows.length) return null;
    const v = (r, k) => r[k]?.value || '';
    const item = v(rows[0], 'item');
    const facts = { name: v(rows[0], 'itemLabel'), url: item, employees: rows.filter((r) => v(r, 'emp')).sort((a, b) => v(b, 'empAt').localeCompare(v(a, 'empAt')))[0]?.emp?.value || '', website: rows.map((r) => v(r, 'site')).find(Boolean) || '' };
    const seen = new Set();
    const people = [];
    const tree = [];
    for (const r of rows) {
      const rel = v(r, 'rel');
      const name = v(r, 'vLabel');
      if (!rel || !name || /^Q\d+$/.test(name) || seen.has(`${rel}|${name}`)) continue;
      seen.add(`${rel}|${name}`);
      if (rel === 'ceo') people.push({ role: 'Керівник', name, share: '', country: '', source: 'Wikidata' });
      if (rel === 'chair') people.push({ role: 'Голова ради', name, share: '', country: '', source: 'Wikidata' });
      if (rel === 'founder') people.push({ role: 'Засновник', name, share: '', country: '', source: 'Wikidata' });
      if (rel === 'owner') people.push({ role: 'Власник', name, share: '', country: '', source: 'Wikidata' });
      if (rel === 'parent') tree.push({ relation: 'Материнська', name, country: '', lei: '', status: '', source: 'Wikidata' });
      if (rel === 'sub') tree.push({ relation: 'Дочірня', name, country: '', lei: '', status: '', source: 'Wikidata' });
    }
    return { facts, people, tree };
  } catch (e) {
    notes.push(`Wikidata не відповіла: ${e.message}.`);
    return null;
  }
}

const norm = (s) => String(s || '').toLowerCase().replace(/["«»'’.,]/g, '').replace(/\s+/g, ' ').trim();
/** Everything known of the company; kept for a week so the paid register is not asked again. */
export async function companyProfile(code, { fresh = false } = {}) {
  const id = `co2-${code}`; // co2: only current heads and owners (a former head was kept by co-)
  const cached = await read(id);
  if (!fresh && cached?.at && Date.now() - Date.parse(cached.at) < WEEK) return cached;
  const notes = [];
  const [reg, gl] = await Promise.all([register(code, notes), gleif(code, notes)]);
  const wd = await wikidata(code, gl?.me?.lei || '', notes);
  const card = {
    name: reg?.card.name || gl?.me.name || wd?.facts.name || '', code,
    status: reg?.card.status || '', head: reg?.card.head || wd?.people.find((p) => p.role === 'Керівник')?.name || '',
    address: reg?.card.address || '', activity: reg?.card.activity || '', capital: reg?.card.capital || '', registered: reg?.card.registered || '',
    lei: gl?.me.lei || '', employees: wd?.facts.employees || '', website: wd?.facts.website || '',
    owners: [...new Set([...(reg?.people || []), ...(wd?.people || [])].filter((p) => /Бенефіц|Власник/.test(p.role)).map((p) => p.name))].slice(0, 6).join('; '),
  };
  // One person or company once per role, whichever source named them first (the register before Wikidata).
  const uniq = (list, key) => { const s = new Set(); return list.filter((x) => { const k = key(x); if (s.has(k)) return false; s.add(k); return true; }); };
  const people = uniq([...(reg?.people || []), ...(wd?.people || [])], (p) => `${p.role}|${norm(p.name)}`);
  const tree = uniq([...(gl?.tree || []), ...(wd?.tree || [])], (t) => `${t.relation}|${norm(t.name)}`);
  const sources = [reg && { name: 'ЄДР (Opendatabot)', url: `https://opendatabot.ua/c/${code}` }, gl && { name: 'GLEIF', url: `https://search.gleif.org/#/record/${gl.me.lei}` }, wd && { name: 'Wikidata', url: wd.facts.url }].filter(Boolean);
  if (!gl && !notes.some((n) => n.startsWith('GLEIF'))) notes.push('GLEIF: компанія не має міжнародного ідентифікатора LEI — структуру групи там не знайдено.');
  const out = { at: new Date().toISOString(), code, card, people, tree, sources, notes };
  // A week's keeping only when the paid register answered or is not connected; a passing failure is asked again.
  if (reg || !KEY) await keep(id, out);
  return out;
}
