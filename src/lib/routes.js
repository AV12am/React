// Readable addresses for the divisions: the division, the register and the record's own name, in Latin letters
// (Ukrainian transliteration), with the record's id at the end so the link stays exact when a name repeats or changes:
//   #/proiekty/rubint-v2~w-mvxk9oy9g088          (division «Проєкти», register «Проєкти» — said once)
//   #/rozvidka/dzherela/ministerstvo-oborony~abc  (division «Розвідка», register «Джерела»)
// Old addresses (#/divisions/prj/projects:<id>) still open.
import { DIVISIONS } from '../data/seed.js';
import { WORKSPACES } from '../data/workspaces.js';

const UA = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'e', ъ: '' };
export function slug(text, max = 60) {
  return String(text || '').toLowerCase().replace(/[’'ʼ`]/g, '')
    .replace(/[а-яёіїєґ]/g, (c) => UA[c] ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
}

const divSlug = (d) => slug(d.name);
const regs = (divId) => WORKSPACES[divId]?.registers || [];

/** The address of a route; `title` — the record's name, when it may be shown. */
export function toHash({ view, sub = null, id = null }, title = '') {
  const d = view === 'divisions' && sub ? DIVISIONS.find((x) => x.id === sub) : null;
  if (d) {
    const [regId, recId] = String(id || '').split(':');
    const reg = id ? regs(d.id).find((r) => r.id === regId) : null;
    if (!id || (reg && (!recId || /^[\w-]+$/.test(recId)))) {
      const parts = [divSlug(d)];
      if (reg && slug(reg.name) !== divSlug(d)) parts.push(slug(reg.name));
      if (reg && recId) parts.push(`${slug(title)}~${recId}`);
      return `/${parts.join('/')}`;
    }
  }
  return `/${view}${sub ? `/${encodeURIComponent(sub)}` : ''}${id ? `/${encodeURIComponent(id)}` : ''}`;
}

/** A route from the address (the readable form or the old one). */
export function fromHash(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter((p, i) => p || i === 0).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const d = DIVISIONS.find((x) => divSlug(x) === parts[0]);
  if (!d) {
    const [view = 'overview', sub = null, id = null] = parts;
    return { view: view || 'overview', sub, id };
  }
  const rest = parts.slice(1);
  const recPart = rest.find((p) => p.includes('~'));
  const regPart = rest.find((p) => !p.includes('~'));
  const reg = regPart ? regs(d.id).find((r) => slug(r.name) === regPart || r.id === regPart)
    : recPart ? regs(d.id).find((r) => slug(r.name) === divSlug(d)) : null;
  if (regPart && !reg) return { view: 'divisions', sub: d.id, id: regPart }; // a tab of the division (its own views)
  const recId = recPart ? recPart.slice(recPart.lastIndexOf('~') + 1) : '';
  return { view: 'divisions', sub: d.id, id: reg ? (recId ? `${reg.id}:${recId}` : reg.id) : null };
}
