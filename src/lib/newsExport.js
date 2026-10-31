// CONTEXT News as PDF and Word: each section on a page of its own, every item a row — the thumbnail on the
// left, the short summary on the right, justified to the column; no headline, date or source (the link stays
// on the picture in Word). The server already chose four or five rows a section to fit the page (fitItems). Made in the browser, like the reports (src/lib/reportPdf.js).
const A4 = [595.28, 841.89];
const M = { l: 48, r: 48, t: 56, b: 52 };
const INK = [0.07, 0.07, 0.07];
const MUTED = [0.42, 0.42, 0.42];
const ACCENT = [0.55, 0.11, 0.2];
const PIC = { w: 150, h: 112 };

export const issueTitle = (issue) => `CONTEXT News · ${new Date(issue.at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv' })}`;
export const issueFileName = (issue, ext) => `context-news_${String(issue.at).slice(0, 10)}.${ext}`;

/** A picture cropped to 4:3 and saved as JPEG: { bytes, w, h } — or null when it cannot be read. */
export async function thumb(blob, w = 480, h = 360) {
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.max(w / bmp.width, h / bmp.height);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.drawImage(bmp, (w - bmp.width * k) / 2, (h - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
    bmp.close?.();
    const bin = atob(c.toDataURL('image/jpeg', 0.86).split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, w, h };
  } catch { return null; }
}

let fontsCache = null;
const fonts = () => (fontsCache ||= Promise.all(['NotoSerif-Regular', 'NotoSerif-Bold'].map(async (n) => {
  const res = await fetch(new URL(`fonts/${n}.ttf`, document.baseURI));
  if (!res.ok) throw new Error('Шрифт для PDF не завантажився');
  return new Uint8Array(await res.arrayBuffer());
})).catch((e) => { fontsCache = null; throw e; }));

/** @param pics Map image url → { bytes, w, h } */
export async function newsPdf(issue, pics = new Map()) {
  const [{ PDFDocument, rgb }, fontkit, [reg, bold]] = await Promise.all([
    import('pdf-lib'), import('@pdf-lib/fontkit').then((x) => x.default || x), fonts(),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(issueTitle(issue));
  doc.setCreator('Reaction Core · CONTEXT');
  const F = await doc.embedFont(reg, { subset: true });
  const B = await doc.embedFont(bold, { subset: true });
  const color = (c) => rgb(...c);
  const W = A4[0] - M.l - M.r;
  const safe = (s) => String(s ?? '').replace(/[^\n -ɏͰ-ϿЀ-ԯḀ-ỿ‐-‧‰-⁞₠-₿℀-⅏−]/g, '·');
  const wrap = (text, font, size, width) => {
    const out = [];
    let line = '';
    for (const word of safe(text).split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(t, size) <= width) { line = t; continue; }
      if (line) out.push(line);
      line = word;
    }
    if (line) out.push(line);
    return out;
  };
  let page; let y;
  const newPage = () => { page = doc.addPage(A4); y = A4[1] - M.t; };

  const embedded = new Map();
  for (const s of issue.sections) {
    newPage(); // every section starts a page of its own
    page.drawText(safe(s.part || s.title).toUpperCase(), { x: M.l, y: y - 10, size: 10, font: B, color: color(ACCENT) });
    y -= 16;
    if (s.part && s.title) { page.drawText(safe(s.title).toUpperCase(), { x: M.l, y: y - 10, size: 9.5, font: B, color: color(INK) }); y -= 16; }
    page.drawLine({ start: { x: M.l, y }, end: { x: M.l + W, y }, thickness: 0.5, color: color([0.78, 0.78, 0.78]) });
    y -= 12;
    if (!s.items.length) { page.drawText('Свіжих матеріалів у джерелах розділу немає.', { x: M.l, y: y - 10, size: 10, font: F, color: color(MUTED) }); y -= 22; continue; }
    for (const x of s.items) {
      const tx = M.l + PIC.w + 16;
      const tw = W - PIC.w - 16;
      const body = wrap(x.summary, F, 10.5, tw);
      const textH = body.length * 15;
      const rowH = Math.max(PIC.h, textH);
      if (y - rowH < M.b) newPage();
      const top = y;
      const pic = x.image && pics.get(x.image);
      if (pic) {
        if (!embedded.has(x.image)) embedded.set(x.image, await doc.embedJpg(pic.bytes));
        page.drawImage(embedded.get(x.image), { x: M.l, y: top - PIC.h, width: PIC.w, height: PIC.h });
      } else {
        page.drawRectangle({ x: M.l, y: top - PIC.h, width: PIC.w, height: PIC.h, color: color([0.94, 0.94, 0.94]) });
      }
      let ty = top;
      body.forEach((l, k) => {
        // Justified: every line but the last is spread to the column's width by widening the spaces.
        const words = l.split(' ');
        const gaps = words.length - 1;
        const last = k === body.length - 1;
        if (last || !gaps) page.drawText(l, { x: tx, y: ty - 10.5, size: 10.5, font: F, color: color(INK) });
        else {
          const extra = (tw - F.widthOfTextAtSize(l, 10.5)) / gaps;
          const space = F.widthOfTextAtSize(' ', 10.5) + extra;
          let wx = tx;
          for (const w of words) { page.drawText(w, { x: wx, y: ty - 10.5, size: 10.5, font: F, color: color(INK) }); wx += F.widthOfTextAtSize(w, 10.5) + space; }
        }
        ty -= 15;
      });
      y = top - rowH - 16;
    }
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`CONTEXT News · ${i + 1} / ${pages.length}`, { x: M.l, y: 28, size: 8, font: F, color: color(MUTED) }));
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

export async function newsDocx(issue, pics = new Map()) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun, VerticalAlign, AlignmentType } = d;
  const FONT = 'Georgia';
  const RED = '8C1C32';
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const children = [];
  issue.sections.forEach((s, k) => {
    const sub = s.part && s.title;
    children.push(new Paragraph({ pageBreakBefore: k > 0, spacing: { after: sub ? 60 : 200 }, border: sub ? undefined : { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB', space: 4 } }, children: [new TextRun({ text: (s.part || s.title).toUpperCase(), bold: true, color: RED, size: 20, font: FONT, characterSpacing: 20 })] }));
    if (sub) children.push(new Paragraph({ spacing: { after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB', space: 4 } }, children: [new TextRun({ text: s.title.toUpperCase(), bold: true, size: 19, font: FONT })] }));
    if (!s.items.length) { children.push(new Paragraph({ children: [new TextRun({ text: 'Свіжих матеріалів у джерелах розділу немає.', italics: true, color: '888888', font: FONT, size: 20 })] })); return; }
    const rows = s.items.map((x) => {
      const pic = x.image && pics.get(x.image);
      return new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 32, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: none }, margins: { right: 160, bottom: 200 },
            children: [pic ? new Paragraph({ children: [new ImageRun({ type: 'jpg', data: pic.bytes, transformation: { width: 180, height: 135 } })] }) : new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: 68, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: none }, verticalAlign: VerticalAlign.TOP, margins: { bottom: 200 },
            children: [new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: x.summary, font: FONT, size: 22 })] })],
          }),
        ],
      });
    });
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none }, rows }));
  });
  const doc = new Document({ creator: 'Reaction Core · CONTEXT', title: issueTitle(issue), sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 960, right: 960 } } }, children }] });
  return Packer.toBlob(doc);
}
