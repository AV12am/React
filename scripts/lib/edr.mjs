// Зміни в ЄДР: a snapshot of each watched company from the register (via Opendatabot's API) and the
// difference from the last one. Pure functions; the fetching is done by api/edr.js (manual check) and by
// the daily job in api/watch.js. Needs EDR_API_KEY (a paid Opendatabot corporate key).

import { hashId } from './match.mjs';

export const EDR_SOURCE = { id: 'w-src-edr', name: 'ЄДР через Opendatabot', class: 'OSINT', reliability: 'A — повністю надійне', access: 'Відкриті дані', notes: 'Єдиний державний реєстр юридичних осіб, ФОП і громадських формувань — через API Opendatabot.' };
export const EDR_DEFAULT_URL = 'https://opendatabot.com/api/v2/company/{code}?apiKey={key}';
export const EDR_LIMIT = 60; // companies per daily run — the API is paid per request

const pick = (o, keys) => { for (const k of keys) if (o?.[k] != null && o[k] !== '') return o[k]; return ''; };
const text = (v) => (v == null ? '' : typeof v === 'string' ? v.trim() : typeof v === 'object' ? String(v.address || v.title || v.name || JSON.stringify(v)) : String(v));

/** The response (one company or a one-element list) → the fields we keep and compare. */
export function normalizeEdr(json) {
  const c = Array.isArray(json) ? json[0] : json?.data && !Array.isArray(json.data) ? json.data : Array.isArray(json?.data) ? json.data[0] : json;
  if (!c || typeof c !== 'object') return null;
  const owners = (pick(c, ['beneficiaries', 'founders']) || []);
  return {
    name: text(pick(c, ['full_name', 'fullName', 'name', 'short_name'])),
    status: text(pick(c, ['status', 'state'])),
    head: text(pick(c, ['ceo_name', 'ceoName', 'head', 'director', 'manager'])),
    address: text(pick(c, ['location', 'address'])),
    activity: text(Array.isArray(c.activities) ? (c.activities.find((a) => a.is_primary || a.isPrimary) || c.activities[0] || {}).name || '' : pick(c, ['activity', 'primary_activity'])),
    owners: (Array.isArray(owners) ? owners : []).map((b) => [text(b.title || b.name), b.capital != null ? String(b.capital) : ''].filter(Boolean).join(' · ')).filter(Boolean).sort(),
  };
}

const LABEL = { name: 'Назва', status: 'Стан', head: 'Керівник', address: 'Адреса', activity: 'Основний вид діяльності', owners: 'Засновники й бенефіціари' };

/** What changed between two snapshots: [{ field, label, from, to }]. */
export function diffEdr(prev, next) {
  if (!prev || !next) return [];
  const out = [];
  for (const k of Object.keys(LABEL)) {
    const a = k === 'owners' ? (prev[k] || []).join('; ') : prev[k] || '';
    const b = k === 'owners' ? (next[k] || []).join('; ') : next[k] || '';
    if (a !== b && (a || b)) out.push({ field: k, label: LABEL[k], from: a || '—', to: b || '—' });
  }
  return out;
}

export const edrUrl = (code, { url = EDR_DEFAULT_URL, key = '' } = {}) => url.replace('{code}', encodeURIComponent(code)).replace('{key}', encodeURIComponent(key));

/** Companies worth a daily check: on a watchlist or with a relation to us; most recently unchecked first. */
export function edrTargets(records, limit = EDR_LIMIT) {
  const watched = new Set(['w-list-orgs-sanctions', 'w-list-orgs-media'].flatMap((id) => String(records.find((r) => r.id === id)?.terms || '').split('\n').map((l) => l.split(';')[0].trim()).filter(Boolean)));
  return records
    .filter((r) => r.col === 'orgs' && /^\d{8}$/.test(r.code || '') && (watched.has(r.name) || (r.relation && r.relation !== 'Немає')))
    .sort((a, b) => (a.edr?.checked || '').localeCompare(b.edr?.checked || ''))
    .slice(0, limit);
}

/** The intake record a change becomes. */
export function edrIntake(org, changes, { now = new Date(), owner = null } = {}) {
  const at = now.toISOString();
  const fp = hashId(`edr|${org.id}|${changes.map((c) => `${c.field}=${c.to}`).join('|')}`);
  return {
    id: `w-auto-${fp.slice(0, 20)}`, div: 'int', col: 'intake', stage: 'Надійшло',
    title: `ЄДР: ${org.name} — змінено ${changes.map((c) => c.label.toLowerCase()).join(', ')}`.slice(0, 300),
    source: EDR_SOURCE.id, credibility: '1 — підтверджене', received: at.slice(0, 10),
    summary: changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join('\n'),
    url: `https://opendatabot.ua/c/${org.code}`, org: org.id, fingerprint: fp, origin: 'auto',
    clearance: org.clearance ?? 0, owner, at, updated: at,
  };
}
