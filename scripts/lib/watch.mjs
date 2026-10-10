// The watch conveyor: open sources in, candidate intake items out.
//
//   Медіа                  — GDELT (world news index) and optional RSS feeds, filtered by the list's terms.
//   Контрагенти й санкції  — OFAC SDN (+ aliases) and the EU consolidated list, matched by name or code.
//
// Pure functions plus `runWatch`, which is given `fetchImpl` — so tests run on fixtures and the
// same code serves the manual run (api/watch POST) and the daily job (api/watch GET).
// Only open, official or public-index sources; the list of terms is the company's, the data is not.
import { createHash } from 'node:crypto';
import { normName, parseTerms, parseCsv, blank, matchList, parseRnbo, rnboFinding, RNBO_SOURCE } from './match.mjs';

export { translit, normName, nameScore, parseTerms, parseCsv, matchList, parseRnbo, rnboFinding, hashId } from './match.mjs';

export const sha = (s) => createHash('sha256').update(s).digest('hex');


/** OFAC SDN.CSV (no header): ent_num, name, type, program, title, …, remarks (col 11). ALT.CSV: ent_num, alt_num, type, alt_name. */
export function parseOfac(sdnCsv, altCsv = '') {
  const alt = new Map();
  for (const r of parseCsv(altCsv)) {
    if (r.length < 4 || !blank(r[3])) continue;
    const k = r[0].trim();
    if (!alt.has(k)) alt.set(k, []);
    alt.get(k).push(blank(r[3]));
  }
  return parseCsv(sdnCsv).filter((r) => r.length >= 4 && /^\d+$/.test(r[0].trim())).map((r) => ({
    list: 'ofac', id: r[0].trim(), name: blank(r[1]), type: blank(r[2]) || 'entity', program: blank(r[3]),
    names: [blank(r[1]), ...(alt.get(r[0].trim()) || [])].filter(Boolean), remarks: blank(r[11] || ''),
  }));
}

/** EU consolidated list CSV (;-separated, header row): one row per name alias, grouped by Entity_LogicalId. */
export function parseEu(csv) {
  const rows = parseCsv(csv, ';');
  const head = rows.shift()?.map((h) => h.trim().replace(/^\uFEFF/, '')) || [];
  const col = (n) => head.indexOf(n);
  const [iId, iName, iType, iProg, iRem] = ['Entity_LogicalId', 'NameAlias_WholeName', 'Entity_SubjectType', 'Entity_Regulation_Programme', 'Entity_Remark'].map(col);
  if (iId < 0 || iName < 0) throw new Error('Unexpected EU list format');
  const by = new Map();
  for (const r of rows) {
    const id = (r[iId] || '').trim(); const name = blank(r[iName] || '');
    if (!id || !name) continue;
    if (!by.has(id)) by.set(id, { list: 'eu', id, name, type: blank(r[iType] || '') || 'entity', program: blank(r[iProg] || ''), names: [], remarks: blank(r[iRem] || '') });
    by.get(id).names.push(name);
  }
  return [...by.values()];
}

/* ---------- media ---------- */

/** GDELT DOC 2.0 query: the terms as quoted phrases joined by OR (GDELT needs 3+ letter phrases). */
export const GDELT_BATCH = 12; // phrases per request (GDELT limits query length)
export function gdeltUrl(cfg, terms) {
  const phrases = terms.map((t) => t.name.replace(/"/g, '')).filter((p) => p.length >= 3).slice(0, GDELT_BATCH);
  if (!phrases.length) return null;
  const q = phrases.length === 1 ? `"${phrases[0]}"` : `(${phrases.map((p) => `"${p}"`).join(' OR ')})`;
  const p = new URLSearchParams({ query: q, mode: 'artlist', format: 'json', maxrecords: String(cfg.max || 25), timespan: cfg.timespan || '1d', sort: 'datedesc' });
  return `${cfg.url}?${p}`;
}
/** GDELT seendate «20260928T101500Z» → ISO. */
const gdeltDate = (s) => (/^\d{8}T\d{6}Z$/.test(s || '') ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z` : null);
export function parseGdelt(json) {
  return (json?.articles || []).filter((a) => a.url && a.title).map((a) => ({
    url: a.url, title: a.title.trim(), at: gdeltDate(a.seendate), outlet: a.domain || '', lang: a.language || '', country: a.sourcecountry || '',
  }));
}

// CDATA out, entities decoded, then markup (which may have been escaped) stripped.
const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml); return m ? decode(m[1]) : ''; };
/** RSS 2.0 items and Atom entries → { title, url, at, text }. */
export function parseFeed(xml) {
  const items = [...String(xml).matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  if (items.length) return items.map((x) => ({ title: tag(x, 'title'), url: tag(x, 'link') || tag(x, 'guid'), at: Date.parse(tag(x, 'pubDate')) ? new Date(tag(x, 'pubDate')).toISOString() : null, text: tag(x, 'description') }));
  return [...String(xml).matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0]).map((x) => ({
    title: tag(x, 'title'), url: (/<link[^>]*href="([^"]+)"/i.exec(x) || [])[1] || '', at: tag(x, 'updated') || tag(x, 'published') || null, text: tag(x, 'summary') || tag(x, 'content'),
  }));
}
/** Does the text mention a term (as written, or transliterated)? */
export function mentions(text, term) {
  const t = String(text).toLowerCase();
  const name = term.name.toLowerCase();
  if (name.length >= 3 && t.includes(name)) return true;
  return !!term.norm && term.norm.length >= 4 && ` ${normName(text)} `.includes(` ${term.norm} `);
}

/* ---------- run ---------- */

export const SOURCE_RECORDS = {
  gdelt: { id: 'w-src-gdelt', name: 'GDELT — світові новини', class: 'OSINT', reliability: 'F — не можна оцінити', access: 'Відкриті дані', notes: 'Індекс новин GDELT: надійність залежить від конкретного видання.' },
  rss: { id: 'w-src-rss', name: 'RSS-стрічки медіа', class: 'OSINT', reliability: 'F — не можна оцінити', access: 'Відкриті дані', notes: 'Стрічки зі списків спостереження.' },
  ofac: { id: 'w-src-ofac', name: 'OFAC SDN (США)', class: 'FININT', reliability: 'A — повністю надійне', access: 'Відкриті дані', notes: 'Офіційний санкційний список Мінфіну США.' },
  rnbo: RNBO_SOURCE,
  eu: { id: 'w-src-eu', name: 'Санкційний список ЄС', class: 'FININT', reliability: 'A — повністю надійне', access: 'Відкриті дані', notes: 'Consolidated list of financial sanctions, Єврокомісія.' },
};

async function getText(fetchImpl, url, ua) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': ua, Accept: '*/*' }, signal: AbortSignal.timeout?.(40_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
  return res.text();
}

/**
 * watchlists: [{ id, name, kind, terms, feeds, clearance }] → { findings, errors, stats }.
 * A finding: { fingerprint, watchlist, source, title, url, summary, received, credibility, clearance }.
 */
export async function runWatch({ watchlists, fetchImpl, cfg, now = new Date() }) {
  const findings = []; const errors = []; const stats = {};
  const ua = cfg.userAgent;
  const day = now.toISOString().slice(0, 10);
  let lists = null;
  let gdeltCalls = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const loadLists = async () => {
    if (lists) return lists;
    lists = {};
    const s = cfg.sanctions;
    if (s.ofac?.enabled) {
      try { lists.ofac = parseOfac(await getText(fetchImpl, s.ofac.sdn, ua), await getText(fetchImpl, s.ofac.alt, ua).catch(() => '')); } catch (e) { errors.push({ source: 'ofac', message: e.message }); }
    }
    if (s.eu?.enabled) {
      try { lists.eu = parseEu(await getText(fetchImpl, s.eu.url, ua)); } catch (e) { errors.push({ source: 'eu', message: e.message }); }
    }
    // The RNBO register sits behind a browser check: from a server it may answer 403. The platform then
    // matches against the file a person downloaded (Конвеєр → «Список РНБО»).
    if (s.rnbo?.enabled) {
      try { lists.rnbo = parseRnbo(await getText(fetchImpl, s.rnbo.url, ua)); } catch (e) {
        errors.push({ source: 'rnbo', message: /HTTP 403/.test(e.message) ? 'реєстр РНБО пускає лише браузер — оновіть список вручну в «Конвеєрі»' : e.message });
      }
    }
    return lists;
  };

  for (const w of watchlists) {
    const terms = parseTerms(w.terms);
    let n = 0;
    const add = (f) => { findings.push({ watchlist: w.id, clearance: w.clearance ?? 1, received: day, ...f }); n++; };
    if (w.kind === 'Контрагенти й санкції') {
      const L = await loadLists();
      for (const [key, entries] of Object.entries(L)) {
        for (const m of matchList(terms, entries, cfg.match?.report ?? 0.75)) {
          if (key === 'rnbo') { const f = rnboFinding(w, m, day); findings.push(f); n++; continue; }
          const listName = cfg.sanctions[key].name;
          add({
            fingerprint: sha(`${w.id}|${key}|${m.entry.id}|${m.term.norm}`),
            source: key,
            title: `${m.term.name}: ${m.how === 'назва' || m.how === 'код' ? 'збіг' : 'можливий збіг'} у списку «${listName}»`,
            url: key === 'ofac' ? 'https://sanctionssearch.ofac.treas.gov/' : 'https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions',
            summary: [
              `Об’єкт спостереження: ${m.term.name}${m.term.code ? ` (код ${m.term.code})` : ''}.`,
              `Запис у списку: ${m.entry.name}${m.entry.names.length > 1 ? ` (також: ${m.entry.names.slice(1, 4).join('; ')})` : ''}; тип: ${m.entry.type}; програма: ${m.entry.program || '—'}; ідентифікатор ${m.entry.id}.`,
              `Збіг за: ${m.how}, оцінка ${Math.round(m.score * 100)}%. Перевірте вручну: однакова назва ще не означає ту саму особу.`,
            ].join('\n'),
            credibility: m.score === 1 ? '2 — імовірно правдиве' : '3 — можливо правдиве',
          });
        }
      }
    } else {
      if (cfg.gdelt?.enabled) {
        // A long list goes in batches of 12 phrases, spaced as GDELT asks; the run's time budget caps the batches.
        for (let i = 0; i < terms.length; i += GDELT_BATCH) {
          if (gdeltCalls >= (cfg.gdelt.maxCalls || 8)) {
            errors.push({ source: 'gdelt', watchlist: w.id, message: `Перевірено ${i} з ${terms.length} об’єктів за цей запуск; решта — наступного` });
            break;
          }
          const url = gdeltUrl(cfg.gdelt, terms.slice(i, i + GDELT_BATCH));
          if (!url) continue;
          if (gdeltCalls++ > 0) await wait(cfg.gdelt.spacingMs ?? 5000);
          try {
            for (const a of parseGdelt(JSON.parse(await getText(fetchImpl, url, ua)))) {
              add({
                fingerprint: sha(`${w.id}|url|${a.url}`), source: 'gdelt', title: a.title, url: a.url,
                summary: [`Видання: ${a.outlet}${a.country ? ` (${a.country})` : ''}${a.lang ? `, мова: ${a.lang}` : ''}.`, a.at ? `Зафіксовано GDELT: ${a.at}.` : '', 'Автоматично знайдено за списком спостереження; достовірність не оцінено.'].filter(Boolean).join('\n'),
                credibility: '6 — не можна оцінити',
              });
            }
          } catch (e) { errors.push({ source: 'gdelt', watchlist: w.id, message: e.message }); }
        }
      }
      for (const feed of String(w.feeds || '').split(/\s+/).filter((u) => /^https?:\/\//.test(u))) {
        try {
          for (const it of parseFeed(await getText(fetchImpl, feed, ua))) {
            const hit = terms.find((t) => mentions(`${it.title} ${it.text}`, t));
            if (!hit || !it.url) continue;
            add({
              fingerprint: sha(`${w.id}|url|${it.url}`), source: 'rss', title: it.title || it.url, url: it.url,
              summary: [`Стрічка: ${new URL(feed).host}. Згадка: «${hit.name}».`, it.at ? `Опубліковано: ${it.at}.` : '', it.text.slice(0, 400)].filter(Boolean).join('\n'),
              credibility: '6 — не можна оцінити',
            });
          }
        } catch (e) { errors.push({ source: 'rss', watchlist: w.id, message: `${new URL(feed).host}: ${e.message}` }); }
      }
    }
    stats[w.id] = n;
  }
  // One finding per fingerprint.
  const seen = new Set();
  return { findings: findings.filter((f) => (seen.has(f.fingerprint) ? false : seen.add(f.fingerprint))), errors, stats };
}

/** The intake record a finding becomes (same shape the app writes). */
export function toIntake(f, { now = new Date(), owner = null } = {}) {
  const at = now.toISOString();
  return {
    id: `w-auto-${f.fingerprint.slice(0, 20)}`, div: 'int', col: 'intake', stage: 'Надійшло',
    title: f.title.slice(0, 300), source: SOURCE_RECORDS[f.source].id, credibility: f.credibility, received: f.received,
    summary: f.summary, url: f.url, watchlist: f.watchlist, fingerprint: f.fingerprint, origin: 'auto',
    clearance: f.clearance, owner, at, updated: at,
  };
}
export function sourceRecord(key, { now = new Date(), clearance = 0 } = {}) {
  const at = now.toISOString();
  const { id, ...rest } = SOURCE_RECORDS[key];
  return { id, div: 'int', col: 'sources', state: 'Активне', ...rest, clearance, owner: null, at, updated: at };
}
