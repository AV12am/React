// Звіт з аналітичного продукту: PDF (друк із браузера) і Word (.docx).
//
// The report carries the product's grif on every page, its document number, the key judgments and
// the chain «звідки ми це знаємо». Nothing above the product's own grif is disclosed in it: such a
// judgment or basis is listed as «вищого грифа — не розкривається», so a LUMEN report never carries
// an UMBRA title out of the system. NOX and higher never leave the system at all (levelOf().download).

import { chainOf } from './provenance.js';
import { wordFor } from './forecast.js';
import { levelOf, docNumber, nextSerial } from '../data/clearance.js';

const label = (r) => r?.title || r?.name || r?.statement || 'без назви';
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

export const canReport = (product) => !!levelOf(product.clearance).download;

/** The number a product's report carries: kept on the record once given. */
export function reportNumber(product, { records = [], files = [], now = new Date() } = {}) {
  if (product.number) return product.number;
  const year = now.getFullYear();
  const serial = nextSerial([...files.map((f) => f.number), ...records.map((r) => r.number)], year);
  return docNumber({ level: product.clearance || 0, sealed: false, year, serial });
}

export function reportModel(product, { records = [], users = [], number, now = new Date() }) {
  const lvl = product.clearance || 0;
  const level = levelOf(lvl);
  const userName = (id) => users.find((u) => u.id === id)?.name || '';
  const open = (r) => r && (r.clearance || 0) <= lvl;
  const judgments = records.filter((r) => r.col === 'judgments' && r.product === product.id)
    .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
    .map((j) => (open(j)
      ? { text: j.statement, kind: j.kind, probability: j.probability, words: wordFor(j.probability), confidence: j.confidence || '', due: j.due || '', outcome: j.outcome || '' }
      : { hidden: true }));
  const basis = chainOf(product, records).map(({ record: b, source }) => {
    if (!b) return { gone: true };
    if (!open(b)) return { hidden: true };
    const src = b.col === 'sources' ? b : source;
    return {
      title: label(b),
      kind: b.col === 'intake' ? 'Надходження' : b.col === 'sources' ? 'Джерело' : b.col === 'orgs' ? 'Організація' : 'Запис',
      grade: b.col === 'intake' ? [src && open(src) ? (src.reliability || '')[0] : '', (b.credibility || '')[0]].filter(Boolean).join('') : (b.reliability || '')[0] || '',
      source: src && src !== b ? (open(src) ? label(src) : 'джерело вищого грифа') : '',
      date: b.received || '',
      url: b.url || '',
    };
  });
  return {
    number,
    level: { code: level.code, name: level.name, gloss: level.gloss },
    title: product.title || 'Без назви',
    meta: [
      ['Тип', product.kind], ['Замовник', product.customer], ['Аналітик', userName(product.analyst)],
      ['Рівень упевненості', product.confidence], ['Термін', product.due ? day(product.due) : ''], ['Етап', product.stage],
    ].filter(([, v]) => v),
    questions: product.questions || '',
    judgments,
    basis,
    issued: day(now.toISOString()),
  };
}

/* ---------- PDF: a print-ready page, printed through a hidden frame ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function reportHtml(m) {
  const band = `${esc(m.level.name)} · ${esc(m.number)}`;
  const js = m.judgments.map((j, i) => (j.hidden
    ? `<li class="muted">Судження вищого грифа — не розкривається.</li>`
    : `<li><b>${i + 1}.</b> ${esc(j.text)}<div class="sub">${esc(j.kind || '')}${j.probability != null && j.probability !== '' ? ` · ${esc(j.probability)}% — ${esc(j.words)}` : ''}${j.confidence ? ` · упевненість: ${esc(j.confidence.toLowerCase())}` : ''}${j.due ? ` · перевірка ${esc(j.due)}` : ''}${j.outcome && j.outcome !== 'Відкрито' ? ` · результат: ${esc(j.outcome.toLowerCase())}` : ''}</div></li>`)).join('');
  const bs = m.basis.map((b, i) => (b.hidden || b.gone
    ? `<tr><td>${i + 1}</td><td colspan="4" class="muted">${b.gone ? 'Підставу видалено' : 'Підстава вищого грифа — не розкривається'}</td></tr>`
    : `<tr><td>${i + 1}</td><td>${esc(b.title)}${b.url ? `<div class="sub">${esc(b.url)}</div>` : ''}</td><td>${esc(b.kind)}</td><td>${esc(b.source)}</td><td class="c">${esc(b.grade)}</td></tr>`)).join('');
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${esc(m.number)} ${esc(m.title)}</title><style>
  @page { size: A4; margin: 22mm 18mm 20mm; }
  * { box-sizing: border-box; }
  body { font: 11.5pt/1.5 Georgia, 'Times New Roman', serif; color: #111; margin: 0; }
  .band { position: fixed; left: 0; right: 0; text-align: center; font: 600 8.5pt/1 Georgia, serif; letter-spacing: .18em; color: #8c1c32; }
  .band--top { top: -14mm; } .band--bottom { bottom: -12mm; }
  .mark { font: 600 9pt Georgia, serif; letter-spacing: .3em; color: #555; }
  h1 { font: 400 22pt/1.2 Georgia, serif; margin: 6mm 0 2mm; }
  h2 { font: 600 10pt Georgia, serif; letter-spacing: .12em; text-transform: uppercase; color: #8c1c32; margin: 8mm 0 2mm; border-bottom: .4pt solid #bbb; padding-bottom: 1.5mm; }
  .meta { display: grid; grid-template-columns: 38mm 1fr; gap: 1mm 4mm; font-size: 10.5pt; margin-top: 3mm; }
  .meta dt { color: #666; } .meta dd { margin: 0; }
  ol { padding-left: 0; list-style: none; } li { margin: 0 0 3mm; break-inside: avoid; }
  .sub { color: #555; font-size: 9.5pt; } .muted { color: #888; font-style: italic; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; } th, td { text-align: left; vertical-align: top; padding: 1.5mm 2mm; border-bottom: .4pt solid #ddd; }
  th { color: #666; font-weight: 600; } .c { text-align: center; }
  .questions { white-space: pre-wrap; }
  .foot { margin-top: 10mm; font-size: 9pt; color: #666; }
</style></head><body>
  <div class="band band--top">${band}</div><div class="band band--bottom">${band}</div>
  <div class="mark">REACTION CORE</div>
  <h1>${esc(m.title)}</h1>
  <dl class="meta"><dt>Номер</dt><dd>${esc(m.number)}</dd><dt>Гриф</dt><dd>${esc(m.level.name)} · ${esc(m.level.gloss)}</dd>${m.meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}<dt>Дата видачі</dt><dd>${esc(m.issued)}</dd></dl>
  ${m.questions ? `<h2>Ключові питання</h2><div class="questions">${esc(m.questions)}</div>` : ''}
  <h2>Ключові судження</h2>${m.judgments.length ? `<ol>${js}</ol>` : '<p class="muted">Суджень не додано.</p>'}
  <h2>Звідки ми це знаємо</h2>${m.basis.length ? `<table><thead><tr><th>№</th><th>Підстава</th><th>Тип</th><th>Джерело</th><th class="c">Оцінка</th></tr></thead><tbody>${bs}</tbody></table>
  <p class="sub">Оцінка — надійність джерела (A–F) і достовірність інформації (1–6).</p>` : '<p class="muted">Підстав не вказано.</p>'}
  <p class="foot">Документ ${esc(m.number)} сформовано в Reaction Core ${esc(m.issued)} · ймовірності — за шкалою оцінних термінів платформи</p>
</body></html>`;
}

/** Prints a complete HTML document through a hidden frame (the system dialog offers «Save as PDF»). */
export function printHtml(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  frame.srcdoc = html;
  frame.onload = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } finally { setTimeout(() => frame.remove(), 60000); }
  };
  document.body.appendChild(frame);
}

/** Opens the system print dialog for the report (save as PDF there). */
export const printReport = (m) => printHtml(reportHtml(m));

/* ---------- Word ---------- */

export async function reportDocx(m) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, PageNumber, Table, TableRow, TableCell, WidthType, BorderStyle } = d;
  const FONT = 'Georgia';
  const RED = '8C1C32';
  const band = (extra = []) => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${m.level.name} · ${m.number}`, bold: true, color: RED, size: 16, font: FONT, characterSpacing: 40 }), ...extra] });
  const h2 = (t) => new Paragraph({ spacing: { before: 320, after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB', space: 4 } }, children: [new TextRun({ text: t.toUpperCase(), bold: true, color: RED, size: 19, font: FONT, characterSpacing: 20 })] });
  const p = (t, o = {}) => new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: t, font: FONT, size: 22, ...o })] });
  const cell = (t, o = {}) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(t ?? ''), font: FONT, size: 18, ...o })] })], borders: { top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: 'DDDDDD' } } });

  const children = [
    p('REACTION CORE', { bold: true, color: '555555', size: 18, characterSpacing: 60 }),
    new Paragraph({ spacing: { before: 200, after: 160 }, children: [new TextRun({ text: m.title, font: FONT, size: 44 })] }),
    ...[['Номер', m.number], ['Гриф', `${m.level.name} · ${m.level.gloss}`], ...m.meta, ['Дата видачі', m.issued]]
      .map(([k, v]) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${k}: `, color: '666666', font: FONT, size: 21 }), new TextRun({ text: String(v), font: FONT, size: 21 })] })),
  ];
  if (m.questions) children.push(h2('Ключові питання'), ...m.questions.split('\n').map((l) => p(l)));
  children.push(h2('Ключові судження'));
  if (!m.judgments.length) children.push(p('Суджень не додано.', { italics: true, color: '888888' }));
  m.judgments.forEach((j, i) => {
    if (j.hidden) { children.push(p('Судження вищого грифа — не розкривається.', { italics: true, color: '888888' })); return; }
    children.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: `${i + 1}. `, bold: true, font: FONT, size: 22 }), new TextRun({ text: j.text, font: FONT, size: 22 })] }));
    const sub = [j.kind, j.probability != null && j.probability !== '' ? `${j.probability}% — ${j.words}` : '', j.confidence && `упевненість: ${j.confidence.toLowerCase()}`, j.due && `перевірка ${j.due}`, j.outcome && j.outcome !== 'Відкрито' ? `результат: ${j.outcome.toLowerCase()}` : ''].filter(Boolean).join(' · ');
    children.push(p(sub, { color: '555555', size: 19 }));
  });
  children.push(h2('Звідки ми це знаємо'));
  if (!m.basis.length) children.push(p('Підстав не вказано.', { italics: true, color: '888888' }));
  else {
    const head = new TableRow({ tableHeader: true, children: ['№', 'Підстава', 'Тип', 'Джерело', 'Оцінка'].map((t) => cell(t, { bold: true, color: '666666' })) });
    const rows = m.basis.map((b, i) => new TableRow({
      children: b.hidden || b.gone
        ? [cell(i + 1), cell(b.gone ? 'Підставу видалено' : 'Підстава вищого грифа — не розкривається', { italics: true, color: '888888' }), cell(''), cell(''), cell('')]
        : [cell(i + 1), cell(b.url ? `${b.title}\n${b.url}` : b.title), cell(b.kind), cell(b.source), cell(b.grade)],
    }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...rows] }));
    children.push(p('Оцінка — надійність джерела (A–F) і достовірність інформації (1–6).', { color: '666666', size: 18 }));
  }
  children.push(new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: `Документ ${m.number} сформовано в Reaction Core ${m.issued}`, color: '666666', font: FONT, size: 18 })] }));

  const doc = new Document({
    creator: 'Reaction Core', title: `${m.number} ${m.title}`,
    sections: [{
      properties: { page: { margin: { top: 1250, bottom: 1150, left: 1020, right: 1020 } } },
      headers: { default: new Header({ children: [band()] }) },
      footers: { default: new Footer({ children: [band([new TextRun({ children: ['   · с. ', PageNumber.CURRENT, ' з ', PageNumber.TOTAL_PAGES], color: '888888', size: 16, font: FONT })])] }) },
      children,
    }],
  });
  return Packer.toBlob(doc);
}

// File names in Latin letters: some browsers drop non-ASCII download names and save «download».
const LAT = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '', ё: 'io' };
const latin = (t) => [...t.toLowerCase()].map((c) => LAT[c] ?? c).join('');
export const reportFileName = (m, ext) => `${m.number}_${latin(m.title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}.${ext}`;
