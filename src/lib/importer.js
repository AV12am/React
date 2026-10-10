// Імпорт у реєстр з CSV або Excel: the table is read in the browser, columns are matched to the
// register's fields by name, and every value is checked against its field (options, people, dates).

import { parseCsv } from '../../scripts/lib/match.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[«»"'’ʼ`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/* ---------- reading ---------- */

function readCsv(text) {
  const t = text.replace(/^\uFEFF/, '');
  const first = t.slice(0, t.indexOf('\n') + 1 || t.length);
  const sep = [';', ',', '\t'].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  return parseCsv(t, sep).filter((r) => r.some((c) => String(c).trim()));
}

const xmlDecode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

async function readXlsx(buf) {
  const { unzipSync } = await import('fflate');
  const z = unzipSync(new Uint8Array(buf));
  const dec = (k) => (z[k] ? new TextDecoder().decode(z[k]) : '');
  const shared = [...dec('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlDecode([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join('')));
  // The first sheet in workbook order.
  const rid = /<sheet [^>]*r:id="([^"]+)"/.exec(dec('xl/workbook.xml'))?.[1];
  const target = rid && new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(dec('xl/_rels/workbook.xml.rels'))?.[1];
  const sheet = dec(target ? `xl/${target.replace(/^\/?xl\//, '')}` : 'xl/worksheets/sheet1.xml');
  const rows = [];
  for (const rm of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]; const inner = cm[2] || '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1];
      let val = '';
      if (type === 's') val = shared[+v] ?? '';
      else if (type === 'inlineStr') val = xmlDecode([...inner.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join(''));
      else if (v != null) val = xmlDecode(v);
      row[ref ? colIndex(ref) : row.length] = val;
    }
    if (row.some((c) => String(c ?? '').trim())) rows.push(Array.from(row, (c) => c ?? ''));
  }
  return rows;
}

/** A file → { head: string[], rows: string[][] }. */
export async function readTable(file) {
  const name = (file.name || '').toLowerCase();
  const rows = name.endsWith('.xlsx') ? await readXlsx(await file.arrayBuffer()) : readCsv(await file.text());
  if (rows.length < 2) throw new Error('У файлі немає рядків з даними (перший рядок — назви стовпців)');
  const [head, ...body] = rows;
  return { head: head.map((h) => String(h).trim()), rows: body.slice(0, 2000) };
}

/* ---------- matching and checking ---------- */

const IMPORTABLE = new Set(['text', 'longtext', 'select', 'user', 'ref', 'date', 'number', 'percent', 'url', 'coords', 'links']);
export const importableFields = (reg) => reg.fields.filter((f) => !f.hidden && IMPORTABLE.has(f.type));

/** Column for each field, by the field's label or id appearing in the header. */
export function autoMap(reg, head) {
  const h = head.map(norm);
  const map = {};
  for (const f of importableFields(reg)) {
    const keys = [norm(f.label), norm(f.id)];
    let i = h.findIndex((x) => keys.includes(x));
    if (i < 0) i = h.findIndex((x) => x && (x.includes(keys[0]) || keys[0].includes(x)) && x.length >= 3);
    if (i >= 0 && !Object.values(map).includes(i)) map[f.id] = i;
  }
  return map;
}

const pad = (n) => String(n).padStart(2, '0');
export function toDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  if (/^\d{4,5}(\.\d+)?$/.test(s)) { // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{2})$/.exec(s);
  if (m) return `20${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

/**
 * One table row → { record fields, problems[] }.
 * look: { users: [{id,name}], recordsOf(col) → records, titleOf(record) }
 */
export function rowToRecord(reg, row, map, look) {
  const out = {}; const problems = [];
  for (const f of importableFields(reg)) {
    const i = map[f.id];
    if (i == null || i < 0) continue;
    const raw = String(row[i] ?? '').trim();
    if (!raw) continue;
    switch (f.type) {
      case 'select': {
        const o = f.options.find((x) => norm(x) === norm(raw)) || f.options.find((x) => norm(x).startsWith(norm(raw)) || norm(raw).startsWith(norm(x).split(' ')[0]));
        if (o) out[f.id] = o; else problems.push(`${f.label}: «${raw}» немає серед варіантів`);
        break;
      }
      case 'user': {
        const u = look.users.find((x) => norm(x.name) === norm(raw) || norm(x.email) === norm(raw) || norm(x.code) === norm(raw));
        if (u) out[f.id] = u.id; else problems.push(`${f.label}: людину «${raw}» не знайдено`);
        break;
      }
      case 'ref': case 'links': {
        const names = f.type === 'links' ? raw.split(/[;\n]/).map((x) => x.trim()).filter(Boolean) : [raw];
        const cols = f.type === 'links' ? (f.refs || []).map(([, c]) => c) : [f.ref];
        const ids = names.map((n) => cols.flatMap((c) => look.recordsOf(c)).find((r) => norm(look.titleOf(r)) === norm(n))?.id).filter(Boolean);
        if (ids.length) out[f.id] = f.type === 'links' ? ids : ids[0];
        if (ids.length < names.length) problems.push(`${f.label}: не знайдено ${names.length - ids.length} з ${names.length}`);
        break;
      }
      case 'date': {
        const d = toDate(raw);
        if (d) out[f.id] = d; else problems.push(`${f.label}: дата «${raw}» не розпізнана`);
        break;
      }
      case 'number': case 'percent': {
        const n = Number(raw.replace(/\s/g, '').replace(',', '.').replace(/%$/, ''));
        if (Number.isFinite(n)) out[f.id] = f.type === 'percent' ? Math.max(0, Math.min(100, Math.round(n <= 1 && raw.includes('.') ? n * 100 : n))) : n;
        else problems.push(`${f.label}: «${raw}» не число`);
        break;
      }
      default: out[f.id] = raw;
    }
  }
  for (const f of reg.fields) if (f.required && (out[f.id] == null || out[f.id] === '')) problems.push(`Немає обов’язкового поля «${f.label}»`);
  return { fields: out, problems };
}
