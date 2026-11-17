// Документи продукту: a document is written, edited and read right on the product's page — formatted text with
// pictures — kept in the record itself (`docs`), and can be taken out as a Word or a PDF file.
import { useEffect, useRef, useState } from 'react';
import { useStore, fmtAgo } from '../store.jsx';
import { Panel } from './ui.jsx';
import { Icon } from './Icon.jsx';
import { ask } from './Dialog.jsx';
import { saveFile } from '../lib/io.js';
import { cleanHtml, hasContent, pictureData, docxBlob, pdfBlob } from '../lib/docs.js';

const MAX_BYTES = 4 * 1024 * 1024; // one document's size (pictures included)

/** A document's text, set as a page. The HTML is cleaned again on the way in. */
export function DocBody({ html }) {
  if (!hasContent(html)) return <p className="vx-hint">Документ порожній.</p>;
  return <div className="doc-body" dangerouslySetInnerHTML={{ __html: cleanHtml(html) }} />;
}

const TOOLS = [
  ['B', 'Жирний (Ctrl+B)', 'bold'], ['I', 'Курсив (Ctrl+I)', 'italic'], ['U', 'Підкреслений (Ctrl+U)', 'underline'], null,
  ['H1', 'Великий заголовок', 'formatBlock', 'h1'], ['H2', 'Підзаголовок', 'formatBlock', 'h2'], ['¶', 'Звичайний текст', 'formatBlock', 'p'], null,
  ['•', 'Список', 'insertUnorderedList'], ['1.', 'Нумерований список', 'insertOrderedList'], ['❝', 'Цитата', 'formatBlock', 'blockquote'], ['—', 'Розділювальна лінія', 'insertHorizontalRule'],
];

function Editor({ doc, onSave, onCancel }) {
  const { toast } = useStore();
  const [title, setTitle] = useState(doc?.title || '');
  const box = useRef(null);
  const file = useRef(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!box.current) return;
    box.current.innerHTML = cleanHtml(doc?.html || '');
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* not supported */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = (cmd, val) => { box.current?.focus(); try { document.execCommand(cmd, false, val); } catch { /* ignore */ } };
  const addPictures = async (files) => {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setBusy(true);
    try {
      for (const f of imgs) run('insertImage', await pictureData(f));
    } catch (e) { toast(e.message || 'Не вдалося додати зображення'); }
    setBusy(false);
  };
  const onPaste = (e) => {
    const cd = e.clipboardData;
    if (cd?.files?.length && [...cd.files].some((f) => f.type.startsWith('image/'))) { e.preventDefault(); addPictures(cd.files); return; }
    const h = cd?.getData('text/html');
    e.preventDefault();
    if (h) run('insertHTML', cleanHtml(h)); else run('insertText', cd?.getData('text/plain') || '');
  };
  const onDrop = (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); addPictures(e.dataTransfer.files); } };
  const save = () => {
    const html = cleanHtml(box.current?.innerHTML || '');
    if (html.length > MAX_BYTES) { toast('Документ завеликий: зменште або приберіть частину зображень'); return; }
    onSave({ title: title.trim(), html });
  };
  return (
    <div className="doc-editor">
      <input className="vx-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Назва документа" aria-label="Назва документа" />
      <div className="doc-tools" role="toolbar" aria-label="Форматування">
        {TOOLS.map((t, i) => (t
          ? <button key={t[0]} type="button" className={`vx-btn vx-btn--ghost vx-btn--sm doc-tool doc-tool--${t[0] === 'B' ? 'b' : t[0] === 'I' ? 'i' : t[0] === 'U' ? 'u' : ''}`} title={t[1]} aria-label={t[1]} onMouseDown={(e) => e.preventDefault()} onClick={() => run(t[2], t[3])}>{t[0]}</button>
          : <span key={i} className="doc-tools__sep" />))}
        <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" title="Додати зображення" aria-label="Додати зображення" disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={() => file.current?.click()}><Icon name="image" /> Зображення</button>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { addPictures(e.target.files); e.target.value = ''; }} />
        <span className="toolbar__grow" />
        <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" title="Скасувати дію" aria-label="Скасувати дію" onMouseDown={(e) => e.preventDefault()} onClick={() => run('undo')}>↶</button>
        <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" title="Повторити дію" aria-label="Повторити дію" onMouseDown={(e) => e.preventDefault()} onClick={() => run('redo')}>↷</button>
      </div>
      <div ref={box} className="doc-body doc-surface" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Текст документа" data-placeholder="Пишіть тут. Зображення можна вставити з буфера, перетягнути сюди або додати кнопкою."
        onPaste={onPaste} onDrop={onDrop} />
      <div className="toolbar">
        <button type="button" className="vx-btn vx-btn--primary" disabled={!title.trim() || busy} onClick={save}><Icon name="check" /> Зберегти</button>
        <button type="button" className="vx-btn" onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
}

/** The «Документи» panel of a product. `docs` is the record's list; `onChange(list, note)` writes it back. */
export function DocsPanel({ docs = [], onChange, canEdit, users = [] }) {
  const { me, toast } = useStore();
  const [open, setOpen] = useState(null);
  const [edit, setEdit] = useState(null); // 'new' | doc id
  const [busy, setBusy] = useState('');
  const list = Array.isArray(docs) ? docs : [];
  const who = (id) => users.find((u) => u.id === id)?.name || '—';
  const save = ({ title, html }) => {
    const now = new Date().toISOString();
    if (edit === 'new') {
      const d = { id: `d-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title, html, author: me.id, at: now, updated: now };
      onChange([d, ...list], `новий документ «${title}»`); setOpen(d.id); toast('Документ створено');
    } else {
      onChange(list.map((d) => (d.id === edit ? { ...d, title, html, updated: now, editor: me.id } : d)), `змінено документ «${title}»`); toast('Документ збережено');
    }
    setEdit(null);
  };
  const drop = async (d) => { if (await ask(`Видалити документ «${d.title}»?`, { ok: 'Видалити', danger: true })) { onChange(list.filter((x) => x.id !== d.id), `видалено документ «${d.title}»`); if (open === d.id) setOpen(null); } };
  const out = async (d, kind) => {
    setBusy(`${d.id}:${kind}`);
    try {
      const meta = { title: d.title, html: d.html, author: who(d.author), date: new Date(d.updated || d.at).toLocaleDateString('uk-UA') };
      const blob = await (kind === 'pdf' ? pdfBlob(meta) : docxBlob(meta));
      const name = `${d.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Документ'}.${kind === 'pdf' ? 'pdf' : 'docx'}`;
      if ((await saveFile(name, blob)) === 'failed') toast('Не вдалося зберегти файл');
    } catch { toast(`Не вдалося створити ${kind === 'pdf' ? 'PDF' : 'Word'}`); }
    setBusy('');
  };
  const editing = edit === 'new' ? null : list.find((d) => d.id === edit);
  return (
    <Panel title={`Документи · ${list.length}`} action={canEdit && !edit ? <button className="vx-btn vx-btn--sm" onClick={() => setEdit('new')}><Icon name="plus" /> Новий документ</button> : null}>
      {edit && <Editor key={edit} doc={editing} onSave={save} onCancel={() => setEdit(null)} />}
      {!edit && !list.length && <div className="vx-hint">Документів ще немає.{canEdit ? ' Створіть перший — довідку, оцінку, чернетку звіту: пишіть просто тут, додавайте зображення, а потім збережіть у Word або PDF.' : ''}</div>}
      {!edit && list.length > 0 && (
        <div className="doc-list">
          {list.map((d) => (
            <div key={d.id} className={`doc-row ${open === d.id ? 'is-open' : ''}`}>
              <button type="button" className="doc-row__main" onClick={() => setOpen(open === d.id ? null : d.id)}>
                <Icon name="file" size={16} /> <b>{d.title}</b>
                <span className="vx-hint">{who(d.editor || d.author)} · {fmtAgo(d.updated || d.at)}</span>
              </button>
              <span className="doc-row__acts">
                <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" disabled={!!busy} onClick={() => out(d, 'docx')} title="Зберегти як Word">{busy === `${d.id}:docx` ? '…' : 'Word'}</button>
                <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" disabled={!!busy} onClick={() => out(d, 'pdf')} title="Зберегти як PDF">{busy === `${d.id}:pdf` ? '…' : 'PDF'}</button>
                {canEdit && <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => { setOpen(d.id); setEdit(d.id); }}>Редагувати</button>}
                {canEdit && <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm" onClick={() => drop(d)} aria-label={`Видалити «${d.title}»`}><Icon name="trash" /></button>}
              </span>
              {open === d.id && <div className="doc-read"><DocBody html={d.html} /></div>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
