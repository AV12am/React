// Text out of a file for the platform-wide search: plain text, PDF, Word and Excel.
// Runs in the browser at upload; the libraries load only when such a file comes in.
// The first TEXT_LIMIT characters are kept on the file's card (shared, under the file's own grif).

export const TEXT_LIMIT = 6000;

const squash = (s) => String(s || '').split(String.fromCharCode(0)).join('').replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const xmlText = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'g'))].map((m) => m[1]).join(' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function unzip(file) {
  const { unzipSync } = await import('fflate');
  return unzipSync(new Uint8Array(await file.arrayBuffer()));
}
const dec = (u8) => new TextDecoder().decode(u8);

async function pdfText(file) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages && out.length < TEXT_LIMIT * 1.5; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out += `${tc.items.map((it) => it.str).join(' ')}\n`;
  }
  return out;
}

/** The searchable text of a file, or '' when there is none we can read. */
export async function extractText(file) {
  const name = (file.name || '').toLowerCase();
  const type = file.type || '';
  try {
    if (type === 'application/pdf' || name.endsWith('.pdf')) return squash(await pdfText(file)).slice(0, TEXT_LIMIT);
    if (name.endsWith('.docx')) {
      const z = await unzip(file);
      const xml = dec(z['word/document.xml'] || new Uint8Array());
      return squash(xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '')).slice(0, TEXT_LIMIT);
    }
    if (name.endsWith('.xlsx')) {
      const z = await unzip(file);
      return squash(xmlText(dec(z['xl/sharedStrings.xml'] || new Uint8Array()), 't')).slice(0, TEXT_LIMIT);
    }
    if (name.endsWith('.pptx')) {
      const z = await unzip(file);
      const slides = Object.keys(z).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((x, y) => parseInt(x.match(/\d+/)[0], 10) - parseInt(y.match(/\d+/)[0], 10));
      return squash(slides.map((k) => xmlText(dec(z[k]), 'a:t')).join('\n')).slice(0, TEXT_LIMIT);
    }
    if (/^text\/|^application\/(json|xml|csv)$/.test(type) || /\.(txt|md|csv|json|xml|html?|log)$/.test(name)) {
      const t = await file.slice(0, TEXT_LIMIT * 4).text();
      return squash(/html?$/.test(name) || /html/.test(type) ? t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ') : t).slice(0, TEXT_LIMIT);
    }
  } catch { /* unreadable or encrypted: no text */ }
  return '';
}

/** Where the query occurs in a text: a short excerpt around it, or ''. */
export function snippet(text, q, width = 70) {
  const t = String(text || '');
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return '';
  const a = Math.max(0, i - width / 2);
  return `${a > 0 ? '…' : ''}${t.slice(a, i + q.length + width / 2).replace(/\s+/g, ' ').trim()}${i + q.length + width / 2 < t.length ? '…' : ''}`;
}
