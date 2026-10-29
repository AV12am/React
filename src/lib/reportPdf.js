// The report as a real PDF file, made in the browser (pdf-lib + Noto Serif with Cyrillic): works on phones,
// where the print dialog of an installed app is not available. The same model as reportHtml / reportDocx
// (src/lib/report.js): the grif and number on every page, description, judgments and grounds for products,
// working entries, and every file as an appendix — pictures, text and tables.
const A4 = [595.28, 841.89];
const M = { l: 56, r: 56, t: 64, b: 60 };
const INK = [0.07, 0.07, 0.07];
const MUTED = [0.4, 0.4, 0.4];
const ACCENT = [0.55, 0.11, 0.2];

let fontsCache = null;
async function fonts() {
  fontsCache ||= Promise.all(['NotoSerif-Regular', 'NotoSerif-Bold'].map(async (n) => {
    const res = await fetch(new URL(`fonts/${n}.ttf`, document.baseURI));
    if (!res.ok) throw new Error('Шрифт для PDF не завантажився');
    return new Uint8Array(await res.arrayBuffer());
  })).catch((e) => { fontsCache = null; throw e; });
  return fontsCache;
}

const dataBytes = (dataUrl) => {
  const bin = atob(String(dataUrl).split(',')[1] || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export async function reportPdf(m) {
  const [{ PDFDocument, rgb }, fontkit, [reg, bold]] = await Promise.all([
    import('pdf-lib'), import('@pdf-lib/fontkit').then((x) => x.default || x), fonts(),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${m.number} ${m.title}`);
  doc.setCreator('Reaction Core');
  const F = await doc.embedFont(reg, { subset: true });
  const B = await doc.embedFont(bold, { subset: true });
  const color = (c) => rgb(...c);
  const W = A4[0] - M.l - M.r;
  let page; let y;
  const newPage = () => { page = doc.addPage(A4); y = A4[1] - M.t; };
  const room = (h) => { if (y - h < M.b) newPage(); };
  // Characters the font cannot draw (emoji and the like) would stop the whole file: replace them.
  const safe = (s) => String(s ?? '').replace(/\t/g, '    ').replace(/[^\n\u0020-\u024F\u0370-\u03FF\u0400-\u052F\u1E00-\u1EFF\u2010-\u2027\u2030-\u205E\u20A0-\u20BF\u2100-\u214F\u2190-\u21FF\u2212]/g, '·');
  const wrap = (text, font, size, width) => {
    const out = [];
    for (const para of safe(text).split('\n')) {
      let line = '';
      for (const word of para.split(/ +/)) {
        const t = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(t, size) <= width) { line = t; continue; }
        if (line) out.push(line);
        // A word longer than the line is cut where it must be.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width) {
          let k = w.length;
          while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > width) k--;
          out.push(w.slice(0, k)); w = w.slice(k);
        }
        line = w;
      }
      out.push(line);
    }
    return out;
  };
  const text = (s, { font = F, size = 10.5, c = INK, indent = 0, gap = 1.45, width = W - indent } = {}) => {
    for (const line of wrap(s, font, size, width)) {
      room(size * gap);
      page.drawText(line, { x: M.l + indent, y: y - size, size, font, color: color(c) });
      y -= size * gap;
    }
  };
  const space = (h) => { y -= h; };
  const h2 = (s) => {
    room(40); space(14);
    page.drawText(safe(s).toUpperCase(), { x: M.l, y: y - 9.5, size: 9.5, font: B, color: color(ACCENT) });
    y -= 15;
    page.drawLine({ start: { x: M.l, y }, end: { x: M.l + W, y }, thickness: 0.4, color: color([0.75, 0.75, 0.75]) });
    y -= 8;
  };
  const image = async (img, maxH = 520) => {
    if (!img?.bytes && !img?.dataUrl) return;
    const pic = await doc.embedPng(img.bytes || dataBytes(img.dataUrl));
    const k = Math.min(1, W / pic.width, maxH / pic.height);
    const w = pic.width * k, h = pic.height * k;
    room(h + 8);
    page.drawImage(pic, { x: M.l, y: y - h, width: w, height: h });
    y -= h + 8;
  };
  const table = (rows, widths) => {
    const size = 8.5;
    for (const [ri, row] of rows.entries()) {
      const cells = row.map((cell, i) => wrap(cell, ri ? F : B, size, widths[i] - 6));
      const h = Math.max(...cells.map((c) => c.length)) * size * 1.35 + 5;
      room(h);
      let x = M.l;
      cells.forEach((lines, i) => {
        lines.forEach((ln, j) => page.drawText(ln, { x: x + 2, y: y - 3 - size - j * size * 1.35, size, font: ri ? F : B, color: color(ri ? INK : MUTED) }));
        x += widths[i];
      });
      y -= h;
      page.drawLine({ start: { x: M.l, y }, end: { x: M.l + W, y }, thickness: 0.3, color: color([0.85, 0.85, 0.85]) });
    }
  };

  newPage();
  text(`REACTION CORE · ${m.kind.toUpperCase()}`, { font: B, size: 8.5, c: MUTED });
  space(6);
  text(m.title, { size: 20, gap: 1.25 });
  space(4);
  if (m.cover) await image(m.cover, 300);
  for (const [k, v] of [['Номер', m.number], ['Гриф', `${m.level.name} · ${m.level.gloss}`], ...m.meta, ['Дата видачі', m.issued]]) {
    const lines = wrap(String(v), F, 10, W - 120);
    room(lines.length * 14);
    page.drawText(safe(k), { x: M.l, y: y - 10, size: 10, font: F, color: color(MUTED) });
    lines.forEach((ln, i) => page.drawText(ln, { x: M.l + 120, y: y - 10 - i * 14, size: 10, font: F, color: color(INK) }));
    y -= lines.length * 14 + 2;
  }
  if (m.about) { h2('Опис'); text(m.about); }
  if (m.questions) { h2('Ключові питання'); text(m.questions); }
  if (m.isProduct) {
    h2('Ключові судження');
    if (!m.judgments.length) text('Суджень не додано.', { c: MUTED });
    m.judgments.forEach((j, i) => {
      if (j.hidden) { text('Судження вищого грифа — не розкривається.', { c: MUTED }); return; }
      text(`${i + 1}. ${j.text}`, { font: B });
      text([j.kind, j.probability != null && j.probability !== '' ? `${j.probability}% — ${j.words}` : '', j.confidence && `упевненість: ${j.confidence.toLowerCase()}`, j.due && `перевірка ${j.due}`, j.outcome && j.outcome !== 'Відкрито' && `результат: ${j.outcome.toLowerCase()}`].filter(Boolean).join(' · '), { size: 9, c: MUTED, indent: 12 });
      space(4);
    });
    h2('Звідки ми це знаємо');
    if (!m.basis.length) text('Підстав не вказано.', { c: MUTED });
    else {
      table([['№', 'Підстава', 'Тип', 'Джерело', 'Оцінка'], ...m.basis.map((b, i) => (b.hidden || b.gone
        ? [String(i + 1), b.gone ? 'Підставу видалено' : 'Підстава вищого грифа — не розкривається', '', '', '']
        : [String(i + 1), `${b.title}${b.url ? `\n${b.url}` : ''}`, b.kind, b.source, b.grade]))], [24, W - 24 - 80 - 110 - 44, 80, 110, 44]);
      space(4);
      text('Оцінка — надійність джерела (A–F) і достовірність інформації (1–6).', { size: 8.5, c: MUTED });
    }
  }
  if (m.entries.length) {
    h2('Робочі записи');
    for (const e of m.entries) {
      text(e.title || 'Запис', { font: B });
      text([e.author, e.date].filter(Boolean).join(' · '), { size: 8.5, c: MUTED });
      if (e.text) text(e.text);
      space(6);
    }
  }
  if (m.attachments.length) {
    h2('Додатки');
    const KIND = { image: 'Фото', pdf: 'PDF', docx: 'Word', doc: 'Word', xlsx: 'Excel', text: 'Текст', video: 'Відео', audio: 'Аудіо', other: 'Файл' };
    const sub = (a) => [a.number, KIND[a.kind] || 'Файл', a.size ? `${Math.max(1, Math.round(a.size / 1024))} КБ` : ''].filter(Boolean).join(' · ');
    m.attachments.forEach((a, i) => text(`Додаток ${i + 1}. ${a.name} — ${sub(a)}`, { size: 9.5 }));
    for (const [i, a] of m.attachments.entries()) {
      newPage();
      text(`Додаток ${i + 1}. ${a.name}`, { size: 14, gap: 1.3 });
      text(sub(a), { size: 8.5, c: MUTED });
      space(6);
      if (a.image) await image(a.image);
      else if (a.table) {
        const cols = Math.min(6, a.table.head.length || 1);
        const w = W / cols;
        table([a.table.head.slice(0, cols), ...a.table.rows.map((r) => r.slice(0, cols))], Array(cols).fill(w));
        if (a.table.more) text(`…ще рядків: ${a.table.more} — повна таблиця у Сховищі.`, { size: 8.5, c: MUTED });
      } else if (a.text) text(a.text, { size: 9.5 });
      else text(`Вміст цього файлу не відтворюється в звіті — файл у Сховищі під номером ${a.number || ''}.`, { c: MUTED });
    }
  }
  space(16);
  text(`Документ ${m.number} сформовано в Reaction Core ${m.issued}`, { size: 8.5, c: MUTED });

  // The grif and number on every page, top and bottom; page numbers.
  const pages = doc.getPages();
  const band = safe(`${m.level.name} · ${m.number}`).toUpperCase();
  pages.forEach((p, i) => {
    const bw = B.widthOfTextAtSize(band, 8);
    p.drawText(band, { x: (A4[0] - bw) / 2, y: A4[1] - 32, size: 8, font: B, color: color(ACCENT) });
    p.drawText(band, { x: (A4[0] - bw) / 2, y: 26, size: 8, font: B, color: color(ACCENT) });
    const pn = `${i + 1} / ${pages.length}`;
    p.drawText(pn, { x: A4[0] - M.r - F.widthOfTextAtSize(pn, 8), y: 26, size: 8, font: F, color: color(MUTED) });
  });
  return new Blob([await doc.save()], { type: 'application/pdf' });
}
