// A PDF read on the site (the methodology): its pages drawn one under another with pdf.js, sharp on any screen.
// The file itself is offered by the small PDF icon above.
import './site.css';
import './area.css';
import './chrome.js';

const box = document.getElementById('pages');
(async () => {
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    const doc = await pdfjs.getDocument(box.dataset.src).promise;
    box.innerHTML = '';
    const scale = Math.min(3, (window.devicePixelRatio || 1) * 1.6);
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      c.setAttribute('aria-label', `Page ${i}`);
      box.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
  } catch {
    box.innerHTML = `<p class="meta">The document did not open here. <a class="lnk" href="${box.dataset.src}">Open the PDF</a></p>`;
  }
})();
