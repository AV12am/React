// Вкладення запису: photos as thumbnails, documents as tiles; everything opens right here —
// PDF page by page, Word (.docx), Excel (.xlsx), text, video and audio — without leaving the platform.
import { useEffect, useRef, useState } from 'react';
import { useStore, fmtBytes, canSeeFile } from '../store.jsx';
import { Icon } from './Icon.jsx';
import { Loader } from '../brand/Mark.jsx';
import { upload, bodyOf, remove, kindOf, cardForRecord } from '../lib/attach.js';
import { imageUrl } from '../lib/imgurl.js';
import { ask } from './Dialog.jsx';
import { canExport } from '../data/clearance.js';
import { Watermark } from './Watermark.jsx';

const LABEL = { pdf: 'PDF', docx: 'Word', doc: 'Word (.doc)', xlsx: 'Excel', video: 'Відео', audio: 'Аудіо', text: 'Текст', other: 'Файл', image: 'Фото' };

function useUrl(f) {
  const { backend } = useStore();
  const [state, setState] = useState({ url: null, blob: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ url: null, blob: null, error: null });
    if (f && backend) bodyOf(backend, f).then((b) => live && setState({ ...b, error: null })).catch((e) => live && setState({ url: null, blob: null, error: e.message }));
    return () => { live = false; };
  }, [f, backend]);
  return state;
}

// A picture for <img>: its preview made at upload (instant), and — when `full` — the picture itself after it.
function useImage(f, full = false) {
  const { backend } = useStore();
  const [src, setSrc] = useState(f?.thumb || null);
  useEffect(() => {
    let live = true;
    setSrc(f?.thumb || null);
    if (f && backend && (full || !f.thumb)) imageUrl(backend, f).then((u) => live && u && setSrc(u));
    return () => { live = false; };
  }, [f?.id, f?.thumb, backend, full]); // eslint-disable-line react-hooks/exhaustive-deps
  return src;
}

// The index card (no preview: it stays light) merged over the record's own copy (which has it).
const merge = (x, files) => (typeof x === 'string' ? files.find((f) => f.id === x) : (x && { ...x, ...(files.find((f) => f.id === x.id) || {}) }));

function Thumb({ f, onOpen, onRemove }) {
  const k = kindOf(f);
  const url = useImage(k === 'image' ? f : null);
  return (
    <div className={`att-tile att-tile--${k}`}>
      <button type="button" className="att-tile__open" onClick={onOpen} title={`Відкрити «${f.name}»`}>
        {k === 'image'
          ? (url ? <img src={url} alt={f.name} loading="lazy" /> : <span className="att-tile__ph"><Loader size={18} /></span>)
          : <span className="att-tile__ph"><Icon name="file" size={26} /><b>{LABEL[k]}</b></span>}
        <span className="att-tile__name">{f.name}</span>
        <span className="att-tile__size vx-hint">{fmtBytes(f.size || 0)}</span>
      </button>
      {onRemove && <button type="button" className="att-tile__x" onClick={onRemove} aria-label={`Видалити «${f.name}»`}><Icon name="close" size={14} /></button>}
    </div>
  );
}

/* ---------- the viewer ---------- */

function PdfView({ blob }) {
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

export function XlsxView({ blob, name }) {
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      const { readTable } = await import('../lib/importer.js');
      const table = await readTable(new File([blob], name || 'table.xlsx'));
      if (live) setT(table);
    })().catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [blob, name]);
  if (err) return <div className="vx-error">Не вдалося відкрити таблицю: {err}</div>;
  if (!t) return <Loader size={24} />;
  return (
    <div className="fv-table vx-table-wrap">
      <table className="vx-table">
        <thead><tr>{t.head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{t.rows.slice(0, 500).map((r, i) => <tr key={i}>{t.head.map((_, j) => <td key={j}>{r[j]}</td>)}</tr>)}</tbody>
      </table>
      {t.rows.length > 500 && <div className="vx-hint">Показано перші 500 рядків із {t.rows.length}.</div>}
    </div>
  );
}

function TextView({ blob }) {
  const [text, setText] = useState(null);
  useEffect(() => { let live = true; blob.text().then((x) => live && setText(x.slice(0, 500_000))).catch(() => live && setText('')); return () => { live = false; }; }, [blob]);
  return text == null ? <Loader size={24} /> : <pre className="fv-text">{text}</pre>;
}

export function FileViewer({ files, start = 0, onClose }) {
  const [i, setI] = useState(start);
  const f = files[i];
  const k = kindOf(f);
  const { url, blob, error } = useUrl(f);
  useEffect(() => {
    // Esc closes only the viewer, not the record card under it (captured before the card's own listener).
    const esc = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  useEffect(() => {
    const h = (e) => {
      if (e.target.closest?.('input, textarea')) return;
      if (e.key === 'ArrowRight') setI((x) => Math.min(files.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [files.length]);
  if (!f) return null;
  return (
    <div className="fv" role="dialog" aria-modal="true" aria-label={`Перегляд: ${f.name}`}>
      <header className="fv__bar">
        <div className="fv__title"><b>{f.name}</b><span className="vx-hint">{f.number ? `${f.number} · ` : ''}{LABEL[k]} · {fmtBytes(f.size || 0)}{files.length > 1 ? ` · ${i + 1} з ${files.length}` : ''}</span></div>
        {files.length > 1 && <>
          <button className="vx-btn vx-btn--ghost vx-btn--sm" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Попередній">‹</button>
          <button className="vx-btn vx-btn--ghost vx-btn--sm" disabled={i === files.length - 1} onClick={() => setI(i + 1)} aria-label="Наступний">›</button>
        </>}
        {/* NOX and sealed documents never leave the system: viewing only. */}
        {url && canExport(f) && <a className="vx-btn vx-btn--sm" href={url} download={f.name}><Icon name="download" /> Завантажити</a>}
        <button className="vx-btn vx-btn--ghost vx-btn--icon" onClick={onClose} aria-label="Закрити"><Icon name="close" /></button>
      </header>
      {url && f.clearance > 0 && <Watermark strong={f.clearance > 1 || f.sealed} />}
      <div className="fv__body" key={f.id}>
        {error ? <div className="vx-error">{error}</div>
          : !url ? <div className="fv__wait"><Loader size={28} /></div>
            : k === 'image' ? <img className="fv-img" src={url} alt={f.name} />
              : k === 'pdf' ? <PdfView blob={blob} />
                : k === 'docx' ? <DocxView blob={blob} />
                  : k === 'xlsx' ? <XlsxView blob={blob} name={f.name} />
                    : k === 'text' ? <TextView blob={blob} />
                      : k === 'video' ? <video className="fv-media" src={url} controls />
                        : k === 'audio' ? <audio src={url} controls />
                          : (
                            <div className="fv-none">
                              <Icon name="file" size={40} />
                              <p>{k === 'doc' ? 'Старий формат Word (.doc) у браузері не відкривається. Завантажте файл або збережіть його як .docx — тоді він відкриватиметься тут.' : 'Цей тип файлу переглядається після завантаження.'}</p>
                              {f.text && <pre className="fv-text">{f.text.slice(0, 20000)}</pre>}
                            </div>
                          )}
      </div>
    </div>
  );
}

/* ---------- the field ---------- */

/**
 * value: card ids; onChange(ids) saves the new list. Uploading files them right away (in `division`'s
 * attachment folder, at `clearance`); removing one also deletes it from the store.
 */
export function Attachments({ value, onChange, canEdit, clearance = 0, division = 'int', record = null, hint }) {
  const ctx = useStore();
  const { state, me, toast, refused } = ctx;
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);
  const [drag, setDrag] = useState(false);
  // Each item is the file's card itself (kept in the record, so it never depends on the Vault index
  // having caught up), or — in older records — just its id in the Vault.
  const items = Array.isArray(value) ? value : [];
  const files = items.map((x) => merge(x, state.files)).filter((f) => f && f.id && canSeeFile(me, f));
  const hidden = items.length - files.length;
  const images = files.filter((f) => kindOf(f) === 'image');
  const docs = files.filter((f) => kindOf(f) !== 'image');
  const ordered = [...images, ...docs];

  const add = async (list) => {
    if (!list.length) return;
    setBusy(true);
    try {
      const cards = await upload(ctx, list, { clearance, division, record });
      onChange([...items, ...cards.map(cardForRecord)]);
      toast(`Додано файлів: ${cards.length}`);
    } catch (e) { toast(refused ? await refused(e) : e.message, 'error'); } finally { setBusy(false); }
  };
  const drop = async (f) => {
    if (!(await ask(`Видалити «${f.name}» із запису й сховища?`, { ok: 'Видалити', danger: true }))) return;
    try { await remove(ctx, f); } catch (e) { toast(e.message, 'error'); }
    onChange(items.filter((x) => (typeof x === 'string' ? x : x?.id) !== f.id));
  };

  return (
    <div className={`att ${drag ? 'is-drag' : ''}`}
      onDragOver={(e) => { if (canEdit && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { if (!canEdit) return; e.preventDefault(); setDrag(false); add(Array.from(e.dataTransfer.files)); }}>
      {!!images.length && <div className="att-grid att-grid--img">{images.map((f) => <Thumb key={f.id} f={f} onOpen={() => setView(ordered.indexOf(f))} onRemove={canEdit ? () => drop(f) : null} />)}</div>}
      {!!docs.length && <div className="att-grid">{docs.map((f) => <Thumb key={f.id} f={f} onOpen={() => setView(ordered.indexOf(f))} onRemove={canEdit ? () => drop(f) : null} />)}</div>}
      {!files.length && !canEdit && <span className="vx-hint">Файлів немає</span>}
      {hidden > 0 && <div className="vx-hint">Ще файлів: {hidden} — недоступні вам або видалені зі Сховища</div>}
      {canEdit && (
        <div className="att-add">
          <input ref={input} type="file" multiple hidden onChange={(e) => { add(Array.from(e.target.files)); e.target.value = ''; }} />
          <button type="button" className="vx-btn vx-btn--sm" disabled={busy} onClick={() => input.current.click()}>
            {busy ? <><Loader size={16} /> Завантажую…</> : <><Icon name="upload" /> Додати фото чи документи</>}
          </button>
          <span className="vx-hint">{hint || 'Або перетягніть файли сюди. PDF, Word, Excel, фото, відео — до 50 МБ.'}</span>
        </div>
      )}
      {view != null && <FileViewer files={ordered} start={view} onClose={() => setView(null)} />}
    </div>
  );
}

/** A record's cover photo: its own card (the `cover` field), or else the first photo among `ids`. */
export function Cover({ ids, cover, alt = '', full = false }) {
  const { state, me } = useStore();
  const own = cover && merge(cover, state.files);
  const f = (own && canSeeFile(me, own) ? own : null)
    || (Array.isArray(ids) ? ids : []).map((x) => merge(x, state.files)).find((x) => x && canSeeFile(me, x) && kindOf(x) === 'image');
  const url = useImage(f || null, full);
  return url ? <img src={url} alt={alt} loading="lazy" decoding="async" /> : null;
}

/** The cover photo of a record — one picture, kept apart from its files (the `image` field). */
export function CoverInput({ value, onChange, clearance = 0, division = 'int', record = null }) {
  const ctx = useStore();
  const { toast, refused } = ctx;
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    if (kindOf(file) !== 'image') { toast('Обкладинка — це фото (JPG, PNG, WebP)', 'error'); return; }
    setBusy(true);
    try {
      const [card] = await upload(ctx, [file], { clearance, division, record });
      onChange(cardForRecord(card));
    } catch (e) { toast(refused ? await refused(e) : e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="cover-in">
      {value && <span className="cover-in__img"><Cover cover={value} full /></span>}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
      <div className="toolbar">
        <button type="button" className="vx-btn vx-btn--sm" disabled={busy} onClick={() => input.current.click()}>
          {busy ? <><Loader size={16} /> Завантажую…</> : <><Icon name="upload" /> {value ? 'Змінити фото' : 'Додати фото обкладинки'}</>}
        </button>
        {value && !busy && <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => onChange(null)}>Прибрати</button>}
      </div>
    </div>
  );
}
