// Документи продукту: a small rich-text document. It is kept as clean HTML (only the tags below, images as
// data: URLs), shown and edited as it is, and taken out as a Word or a PDF file.

const TAGS = { P: 'p', H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u', UL: 'ul', OL: 'ol', LI: 'li', BLOCKQUOTE: 'blockquote', HR: 'hr', BR: 'br' };
const IMG_OK = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i;

/** Any HTML → the document's own HTML: allowed tags only, no attributes (but an image's src and alt). */
export function cleanHtml(html = '') {
  const src = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const out = document.createElement('div');
  const walk = (from, into) => {
    for (const n of from.childNodes) {
      if (n.nodeType === 3) { into.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'IMG') {
        const s = n.getAttribute('src') || '';
        if (IMG_OK.test(s)) { const im = document.createElement('img'); im.setAttribute('src', s); im.setAttribute('alt', (n.getAttribute('alt') || '').slice(0, 200)); into.appendChild(im); }
        continue;
      }
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META'].includes(n.tagName)) continue;
      let tag = TAGS[n.tagName];
      // Word-processor markup that says bold / italic / underlined through style
      if (!tag && n.tagName === 'SPAN') {
        const st = n.getAttribute('style') || '';
        tag = /font-weight:\s*(bold|[6-9]00)/i.test(st) ? 'strong' : /font-style:\s*italic/i.test(st) ? 'em' : /text-decoration[^;]*underline/i.test(st) ? 'u' : null;
      }
      if (!tag) { walk(n, into); continue; } // unknown tag: keep its content
      const el = document.createElement(tag);
      if (tag !== 'hr' && tag !== 'br') walk(n, el);
      into.appendChild(el);
    }
  };
  walk(src, out);
  return out.innerHTML;
}

/** Plain text of a document (search, empty check). */
export const textOf = (html = '') => { const d = document.createElement('div'); d.innerHTML = cleanHtml(html); return d.textContent.trim(); };
/** The first line of text of a document (for a title when none was typed). */
export const firstLine = (html = '') => { const b = blocksOf(html).find((x) => x.runs?.some((r) => r.text?.trim())); return b ? b.runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim().slice(0, 80) : ''; };
export const hasContent = (html = '') => /<img /.test(html) || !!textOf(html);

/** A picture file → a JPEG data URL no wider than `max` px (white behind transparency). */
export async function pictureData(file, max = 1000, quality = 0.78) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Не вдалося прочитати зображення')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally { URL.revokeObjectURL(url); }
}

/** Clean HTML → flat blocks: {t:'p'|'h1'|'h2'|'h3'|'li'|'quote'|'hr'|'img', runs:[{text,b,i,u}], n?, src?}. */
export function blocksOf(html = '') {
  const root = document.createElement('div'); root.innerHTML = cleanHtml(html);
  const blocks = [];
  const runsOf = (el, st = {}) => {
    const runs = [];
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, ' '); if (t) runs.push({ text: t, ...st }); }
      else if (n.tagName === 'BR') runs.push({ text: '\n', ...st });
      else if (n.tagName === 'IMG') runs.push({ img: n.getAttribute('src') });
      else if (n.nodeType === 1) runs.push(...runsOf(n, { ...st, ...(n.tagName === 'STRONG' ? { b: true } : n.tagName === 'EM' ? { i: true } : n.tagName === 'U' ? { u: true } : {}) }));
    }
    return runs;
  };
  const push = (t, el, extra = {}) => {
    // pictures inside a paragraph stand as their own blocks, in order
    let cur = [];
    const flush = () => { if (cur.some((r) => r.text?.trim() || r.text === '\n')) blocks.push({ t, runs: cur, ...extra }); cur = []; };
    for (const r of runsOf(el)) { if (r.img) { flush(); blocks.push({ t: 'img', src: r.img }); } else cur.push(r); }
    flush();
  };
  const top = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { if (n.nodeValue.trim()) blocks.push({ t: 'p', runs: [{ text: n.nodeValue.trim() }] }); continue; }
      const tg = n.tagName;
      if (tg === 'P' || tg === 'H1' || tg === 'H2' || tg === 'H3') push(tg.toLowerCase(), n);
      else if (tg === 'BLOCKQUOTE') push('quote', n);
      else if (tg === 'HR') blocks.push({ t: 'hr' });
      else if (tg === 'IMG') blocks.push({ t: 'img', src: n.getAttribute('src') });
      else if (tg === 'UL' || tg === 'OL') [...n.children].forEach((li, k) => push('li', li, { n: tg === 'OL' ? k + 1 : 0 }));
      else if (tg === 'STRONG' || tg === 'EM' || tg === 'U' || tg === 'BR') { const w = document.createElement('p'); w.appendChild(n.cloneNode(true)); push('p', w); }
      else top(n);
    }
  };
  top(root);
  return blocks;
}

const dataBytes = (src) => Uint8Array.from(atob(src.split(',')[1]), (c) => c.charCodeAt(0));
const imageSize = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([400, 300]); i.src = src; });

/** The Word file. */
export async function docxBlob({ title, html, author = '', date = '' }) {
  const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, BorderStyle } = await import('docx');
  const SZ = { h1: 34, h2: 28, h3: 24 };
  const run = (r, o = {}) => new TextRun({ text: r.text === '\n' ? '' : r.text, break: r.text === '\n' ? 1 : undefined, bold: r.b || o.bold, italics: r.i || o.italics, underline: r.u ? {} : undefined, font: 'Calibri', size: o.size || 22, color: o.color });
  const kids = [
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 80 }, children: [new TextRun({ text: title || 'Без назви', font: 'Calibri', bold: true, size: 40 })] }),
    new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 6 } }, children: [new TextRun({ text: [author, date].filter(Boolean).join(' · '), font: 'Calibri', size: 18, color: '777777' })] }),
  ];
  for (const b of blocksOf(html)) {
    if (b.t === 'img') {
      const [w, h] = await imageSize(b.src); const k = Math.min(1, 520 / w);
      kids.push(new Paragraph({ spacing: { before: 80, after: 160 }, children: [new ImageRun({ type: 'jpg', data: dataBytes(b.src), transformation: { width: Math.round(w * k), height: Math.round(h * k) } })] }));
    } else if (b.t === 'hr') kids.push(new Paragraph({ spacing: { after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } }, children: [] }));
    else if (SZ[b.t]) kids.push(new Paragraph({ heading: HeadingLevel[`HEADING_${b.t[1]}`], spacing: { before: 240, after: 120 }, children: b.runs.map((r) => run({ ...r, b: true }, { size: SZ[b.t] })) }));
    else if (b.t === 'li') kids.push(new Paragraph({ spacing: { after: 80, line: 300 }, indent: { left: 540, hanging: 280 }, children: [new TextRun({ text: `${b.n ? `${b.n}.` : '•'}\t`, font: 'Calibri', size: 22 }), ...b.runs.map((r) => run(r))] }));
    else if (b.t === 'quote') kids.push(new Paragraph({ spacing: { after: 120, line: 300 }, indent: { left: 400 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '999999', space: 8 } }, children: b.runs.map((r) => run(r, { italics: true, color: '555555' })) }));
    else kids.push(new Paragraph({ spacing: { after: 120, line: 300 }, children: b.runs.map((r) => run(r)) }));
  }
  return Packer.toBlob(new Document({ sections: [{ properties: {}, children: kids }] }));
}

let fontsP = null;
const fonts = () => (fontsP ||= Promise.all(['NotoSerif-Regular', 'NotoSerif-Bold'].map(async (n) => {
  const res = await fetch(new URL(`fonts/${n}.ttf`, document.baseURI));
  if (!res.ok) throw new Error(`Шрифт ${n}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
})).catch((e) => { fontsP = null; throw e; }));

/** The PDF file: A4, Noto Serif (Cyrillic), bold / italic / underlined text, headings, lists, quotes, pictures. */
export async function pdfBlob({ title, html, author = '', date = '' }) {
  const [{ PDFDocument, rgb, degrees }, fontkit, [regB, boldB]] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit').then((x) => x.default || x), fonts()]);
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const F = await doc.embedFont(regB, { subset: true }); const B = await doc.embedFont(boldB, { subset: true });
  doc.setTitle(title || 'Документ');
  const A4 = [595.28, 841.89]; const M = 56; const W = A4[0] - 2 * M;
  let page; let y;
  const newPage = () => { page = doc.addPage(A4); y = A4[1] - M; };
  const room = (h) => { if (y - h < M) newPage(); };
  const ink = rgb(0.08, 0.08, 0.08); const grey = rgb(0.4, 0.4, 0.4);
  newPage();
  // tokens: words with their style, laid out into lines
  const layout = (runs, size, { x0 = M, width = W, bold = false, color = ink, italic = false, lead = 1.45, first = null } = {}) => {
    const toks = [];
    for (const r of runs) {
      if (r.text === '\n') { toks.push({ br: true }); continue; }
      for (const part of r.text.split(/(\s+)/)) if (part) toks.push({ w: part, b: bold || r.b, i: italic || r.i, u: r.u, sp: /^\s+$/.test(part) });
    }
    const lines = [[]]; let lw = 0;
    for (const t of toks) {
      if (t.br) { lines.push([]); lw = 0; continue; }
      const w = (t.b ? B : F).widthOfTextAtSize(t.w, size);
      if (!t.sp && lw + w > width && lines.at(-1).some((x) => !x.sp)) { lines.push([]); lw = 0; }
      if (t.sp && !lines.at(-1).length) continue;
      lines.at(-1).push({ ...t, wd: w }); lw += w;
    }
    lines.forEach((ln, k) => {
      room(size * lead);
      let x = x0 + (k === 0 && first ? 0 : 0);
      if (k === 0 && first) first(y);
      for (const t of ln) {
        if (t.sp) { x += t.wd; continue; }
        page.drawText(t.w, { x, y, size, font: t.b ? B : F, color, ...(t.i ? { xSkew: degrees(12) } : {}) });
        if (t.u) page.drawLine({ start: { x, y: y - 1.6 }, end: { x: x + t.wd, y: y - 1.6 }, thickness: 0.6, color });
        x += t.wd;
      }
      y -= size * lead;
    });
  };
  layout([{ text: title || 'Без назви' }], 22, { bold: true, lead: 1.25 });
  y -= 2;
  if (author || date) { layout([{ text: [author, date].filter(Boolean).join(' · ') }], 9, { color: grey }); }
  page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + W, y: y + 4 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) }); y -= 16;
  for (const b of blocksOf(html)) {
    if (b.t === 'h1' || b.t === 'h2' || b.t === 'h3') { y -= b.t === 'h1' ? 8 : 5; room(40); layout(b.runs, { h1: 17, h2: 14, h3: 12 }[b.t], { bold: true, lead: 1.3 }); y -= 3; }
    else if (b.t === 'li') { layout(b.runs, 10.5, { x0: M + 20, width: W - 20, first: (yy) => page.drawText(b.n ? `${b.n}.` : '•', { x: M + 6, y: yy, size: 10.5, font: F, color: ink }) }); y -= 3; }
    else if (b.t === 'quote') { const y0 = y; layout(b.runs, 10.5, { x0: M + 16, width: W - 16, italic: true, color: grey }); page.drawRectangle({ x: M + 4, y: y + 6, width: 2, height: y0 - y - 2, color: rgb(0.7, 0.7, 0.7) }); y -= 4; }
    else if (b.t === 'hr') { room(16); page.drawLine({ start: { x: M, y: y - 4 }, end: { x: M + W, y: y - 4 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) }); y -= 16; }
    else if (b.t === 'img') {
      try {
        const img = await doc.embedJpg(dataBytes(b.src)); const k = Math.min(1, W / img.width, 520 / img.height);
        const w = img.width * k; const h = img.height * k;
        room(h + 10); page.drawImage(img, { x: M, y: y - h + 6, width: w, height: h }); y -= h + 12;
      } catch { /* a picture that cannot be placed is left out */ }
    } else { layout(b.runs, 10.5); y -= 5; }
  }
  return new Blob([await doc.save()], { type: 'application/pdf' });
}
