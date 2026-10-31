// Viewers that need nothing of the platform: a PDF page by page, a Word document, and a made document's
// preview before it is saved. Shared by the record pages and the standalone CONTEXT News page (news.html).
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';

export function PdfView({ blob }) {
  const box = useRef(null);
  const [info, setInfo] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      const n = Math.min(doc.numPages, 150);
      if (live) setInfo(`${doc.numPages} стор.${doc.numPages > n ? ` · показано перші ${n}` : ''}`);
      const width = Math.min(1100, (box.current?.clientWidth || 800) - 8);
      for (let i = 1; i <= n && live; i++) {
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const scale = width / base.width;
        const vp = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        c.style.width = `${base.width * scale}px`;
        c.className = 'fv-page';
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        if (live) box.current?.appendChild(c);
      }
    })().catch((e) => live && setInfo(`Не вдалося відкрити PDF: ${e.message}`));
    return () => { live = false; if (box.current) box.current.innerHTML = ''; }; // eslint-disable-line react-hooks/exhaustive-deps
  }, [blob]);
  return <><div className="vx-hint fv-info">{info || 'Відкриваю…'}</div><div ref={box} className="fv-pdf" /></>;
}

export function DocxView({ blob }) {
  const box = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      const { renderAsync } = await import('docx-preview');
      if (!live || !box.current) return;
      // On a phone the page is not drawn at A4 width: the text flows to the width of the screen.
      const narrow = box.current.clientWidth < 700;
      await renderAsync(blob, box.current, null, { inWrapper: !narrow, ignoreWidth: narrow, ignoreHeight: narrow, breakPages: !narrow, ignoreLastRenderedPageBreak: true, experimental: true });
    })().catch((e) => live && setErr(`Не вдалося відкрити документ: ${e.message}`));
    return () => { live = false; if (box.current) box.current.innerHTML = ''; }; // eslint-disable-line react-hooks/exhaustive-deps
  }, [blob]);
  return <>{err && <div className="vx-error">{err}</div>}<div ref={box} className="fv-docx" /></>;
}

// The made report, page by page, before it is saved: «Завантажити» or «Закрити».
export function ReportPreview({ p, onSave, onClose }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  return (
    <div className="fv" role="dialog" aria-modal="true" aria-label={`Звіт: ${p.name}`}>
      <header className="fv__bar">
        <div className="fv__title"><b>{p.name}</b><span className="vx-hint">{p.kind === 'pdf' ? 'PDF' : p.kind === 'pptx' ? 'PowerPoint' : 'Word'} · попередній перегляд</span></div>
        <button className="vx-btn vx-btn--primary vx-btn--sm fv__wide" onClick={onSave}><Icon name="download" /> Завантажити</button>
        <button className="vx-btn vx-btn--ghost vx-btn--icon fv__wide" onClick={onClose} aria-label="Закрити"><Icon name="close" /></button>
      </header>
      {/* A PowerPoint deck is shown through its pages as PDF (the same layout, slide for page); the deck itself is saved. */}
      <div className="fv__body">{p.kind === 'pdf' ? <PdfView blob={p.blob} /> : p.kind === 'pptx' ? <PdfView blob={p.view} /> : <DocxView blob={p.blob} />}</div>
      <footer className="fv__dock">
        <button className="vx-btn vx-btn--primary" onClick={onSave}><Icon name="download" /> Завантажити</button>
        <button className="vx-btn" onClick={onClose}><Icon name="close" /> Закрити</button>
      </footer>
    </div>
  );
}
