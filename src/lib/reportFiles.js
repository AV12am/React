// What a record page adds to its report: description, data, working entries, the cover photo and every
// attached file as an appendix — photos as pictures, PDF / Word / Excel / text as their text.
// Only what the reader may see and what is not above the record's own classification goes in.
import { bodyOf, kindOf } from './attach.js';
import { extractText } from './textract.js';

const MAX_SIDE = 1600;
const TABLE_ROWS = 200;
const REPORT_TEXT = 60000; // characters of a document's text in the report (the search index keeps less)
const KIND = { products: 'Аналітичний продукт', studies: 'Дослідження', projects: 'Проєкт', orgs: 'Компанія' };

/** An image file as a PNG fitted into MAX_SIDE: { dataUrl, bytes, w, h } — any browser-readable format works. */
async function picture(blob) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const dataUrl = c.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { dataUrl, bytes, w, h };
}

const resolve = (files, x) => (typeof x === 'string' ? files.find((f) => f.id === x) : (x && (files.find((f) => f.id === x.id) || x)));

/**
 * reportExtra(record, { reg, files, backend, may, user, facts }) → the `extra` of reportModel.
 * `may(f)`: whether the reader sees the file; `facts`: [label, text] pairs of the record's data.
 */
export async function reportExtra(record, { reg, files = [], backend, may = () => true, user = () => '', facts = [], extraFiles = [], about: aboutText }) {
  const list = (reg.fields.filter((f) => f.type === 'files').flatMap((f) => record[f.id] || []))
    // single documents from the Vault (fields of type 'file'), the entries' files, and what the page adds (a company's folder)
    .concat(reg.fields.filter((f) => f.type === 'file' && record[f.id]).map((f) => record[f.id]))
    .concat((record.entries || []).flatMap((e) => e.files || []))
    .concat(extraFiles)
    .map((x) => resolve(files, x))
    .filter((f, i, all) => f && f.id && all.findIndex((y) => y?.id === f.id) === i)
    .filter((f) => may(f) && (+f.clearance || 0) <= (+record.clearance || 0));
  const attachments = [];
  for (const f of list) {
    const kind = kindOf(f);
    const a = { name: f.name, number: f.number, size: f.size, kind };
    try {
      if (kind === 'image') a.image = await picture((await bodyOf(backend, f)).blob);
      else if (kind === 'xlsx' || /\.csv$/i.test(f.name)) {
        const { readTable } = await import('./importer.js');
        const t = await readTable(new File([(await bodyOf(backend, f)).blob], f.name, { type: f.type }));
        a.table = { head: t.head, rows: t.rows.slice(0, TABLE_ROWS).map((r) => t.head.map((_, j) => (r[j] == null ? '' : String(r[j])))), more: Math.max(0, t.rows.length - TABLE_ROWS) };
      } else if (['pdf', 'docx', 'xlsx', 'text'].includes(kind)) {
        // The whole text (up to REPORT_TEXT) from the file itself; the card's indexed text is only a part.
        let text = await extractText(new File([(await bodyOf(backend, f)).blob], f.name, { type: f.type }), REPORT_TEXT).catch(() => '');
        if (!text) text = f.text || '';
        if (text) a.text = text.length >= REPORT_TEXT ? `${text}\n…(текст скорочено — повний файл у Сховищі)` : text;
      }
    } catch { /* unreadable now: listed by name and number */ }
    attachments.push(a);
  }
  let cover = null;
  const c = resolve(files, record.cover);
  if (c && may(c) && (+c.clearance || 0) <= (+record.clearance || 0)) cover = await bodyOf(backend, c).then((b) => picture(b.blob)).catch(() => null);
  const about = reg.fields.find((f) => f.id === reg.about);
  return {
    title: record[reg.title] || record.title || record.name,
    kind: KIND[reg.id] || reg.name,
    about: aboutText ?? (about ? record[about.id] || '' : ''),
    facts,
    entries: (record.entries || []).map((e) => ({ title: e.title, text: e.text, at: e.at, author: user(e.author) })),
    cover,
    attachments,
  };
}
