import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, fmtBytes, fmtDate, canSeeFile } from '../store.jsx';
import { saveFile, SAVE_MESSAGE } from '../lib/io.js';
import { Panel, Drawer, ClassBadge, Modal } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { Loader } from '../brand/Mark.jsx';
import { STORAGE_QUOTA, CLEARANCE } from '../data/seed.js';
import { storageError } from '../lib/storage.js';

const STORE_LABEL = { local: 'Цей пристрій (IndexedDB)', artifact: 'Сховище Reaction (claude.ai)', supabase: 'Supabase Storage' };

const ext = (name) => (name.split('.').pop() || '').toUpperCase().slice(0, 5);

export function Vault({ focus, setFocus }) {
  const { state, me, perms, dispatch, userById, toast, backend } = useStore();
  const [folder, setFolder] = useState('all');
  const [usage, setUsage] = useState(null);
  useEffect(() => { backend?.usage?.().then(setUsage).catch(() => {}); }, [backend, state.files.length]);
  const [q, setQ] = useState('');
  const open = focus && state.files.some((f) => f.id === focus && canSeeFile(me, f)) ? focus : null;
  const setOpen = (id) => setFocus(id);
  const [pending, setPending] = useState(null); // files chosen, awaiting classification
  const [drag, setDrag] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const input = useRef(null);

  const used = usage?.bytes ?? state.files.reduce((s, f) => s + f.size, 0);
  const quota = usage?.maxBytes || backend?.quota || STORAGE_QUOTA;
  const current = state.folders.find((f) => f.id === folder);
  const canWrite = backend?.writable !== false && perms.vault >= 2 && (!current || current.clearance <= me.clearance || (me.grants || []).includes(current.id));

  const files = useMemo(() => state.files
    .filter((f) => (folder === 'all' || f.folder === folder))
    .filter((f) => (q ? canSeeFile(me, f) && f.name.toLowerCase().includes(q.toLowerCase()) : true))
    .sort((a, b) => b.at.localeCompare(a.at)), [state.files, folder, q, me]);

  const choose = (list) => {
    if (!list?.length) return;
    if (!canWrite) return toast('Недостатньо прав для завантаження в цю папку');
    setPending(Array.from(list));
  };

  const requested = (folderId) => state.requests.some((r) => r.user === me.id && r.kind === 'folder' && r.folder === folderId && r.status === 'pending');
  const requestAccess = (f) => {
    if (requested(f.folder)) return;
    dispatch({ type: 'request/create', request: { kind: 'folder', folder: f.folder, reason: `Доступ до файлу рівня «${CLEARANCE[f.clearance].short}».` } });
    toast('Запит надіслано керівнику напряму');
  };

  return (
    <div className="page"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files); }}>
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">Захищене сховище</div>
          <h1 className="vx-h1">Сховище</h1>
        </div>
        <div className="quota">
          <div className="vx-hint vx-num">{fmtBytes(used)} з {fmtBytes(quota)}</div>
          <div className="vx-meter"><span style={{ width: `${Math.min(100, (used / quota) * 100)}%` }} /></div>
          <div className="vx-hint quota__where"><Icon name="vault" size={12} /> {backend ? backend.label : 'Підключення…'}{backend && !backend.shared ? ' · лише цей пристрій' : ''}</div>
        </div>
      </header>

      <div className="vault">
        <nav className="vault__folders vx-panel" aria-label="Папки">
          <button className={`vx-nav-item ${folder === 'all' ? 'is-active' : ''}`} onClick={() => setFolder('all')}>
            <Icon name="vault" /> Усі файли <span className="vault__count">{state.files.length}</span>
          </button>
          {state.folders.map((f) => {
            const locked = f.clearance > me.clearance && !(me.grants || []).includes(f.id);
            return (
              <button key={f.id} className={`vx-nav-item ${folder === f.id ? 'is-active' : ''}`} onClick={() => setFolder(f.id)}>
                <Icon name={locked ? 'lock' : 'folder'} /> <span className="vault__fname">{f.name}</span>
                <span className="vault__count">{state.files.filter((x) => x.folder === f.id).length}</span>
              </button>
            );
          })}
          {perms.vault >= 3 && (
            <button className="vx-nav-item vault__new" onClick={() => setNewFolder(true)}><Icon name="plus" /> Нова папка</button>
          )}
        </nav>

        <div className="vault__main">
          <div className="toolbar">
            <div className="vx-search toolbar__grow">
              <Icon name="search" />
              <input className="vx-input" placeholder="Пошук файлів" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Пошук файлів" />
            </div>
            {current && <ClassBadge level={current.clearance} />}
            <input ref={input} type="file" multiple hidden onChange={(e) => { choose(e.target.files); e.target.value = ''; }} />
            <button className="vx-btn vx-btn--primary" disabled={!canWrite || folder === 'all'} title={folder === 'all' ? 'Оберіть папку' : ''} onClick={() => input.current.click()}>
              <Icon name="upload" /> Завантажити
            </button>
          </div>

          <div className={`dropzone ${drag ? 'is-over' : ''}`}>
            <Panel bodyClass="vx-table-wrap">
              <table className="vx-table">
                <thead><tr><th>Назва</th><th>Гриф</th><th className="ta-r">Розмір</th><th>Власник</th><th>Змінено</th><th /></tr></thead>
                <tbody>
                  {files.map((f) => {
                    const locked = !canSeeFile(me, f);
                    const owner = userById(f.owner);
                    return (
                      <tr key={f.id} className={locked ? 'is-locked' : 'is-clickable'} onClick={() => !locked && setOpen(f.id)}>
                        <td>
                          <div className="cell-file">
                            <span className="file-ext">{locked ? <Icon name="lock" size={14} /> : ext(f.name)}</span>
                            {locked ? <span><span className="vx-redacted">{f.name.replace(/./g, '█').slice(0, 22)}</span></span> : <span>{f.name}</span>}
                          </div>
                        </td>
                        <td><ClassBadge level={f.clearance} /></td>
                        <td className="ta-r vx-num vx-hint">{fmtBytes(f.size)}</td>
                        <td className="vx-hint">{owner?.name ?? f.ownerName ?? '—'}</td>
                        <td className="vx-hint">{fmtDate(f.at, false)}</td>
                        <td className="ta-r">
                          {locked
                            ? (requested(f.folder)
                              ? <span className="vx-hint">Запит надіслано</span>
                              : <button className="vx-btn vx-btn--sm" onClick={(e) => { e.stopPropagation(); requestAccess(f); }}>Запит доступу</button>)
                            : <Icon name="chevron" size={16} className="vx-muted" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!files.length && (
                <div className="vx-empty">
                  <Icon name="folder" />
                  <div>{q ? 'Нічого не знайдено' : 'Папка порожня'}</div>
                  {canWrite && folder !== 'all' && <div className="vx-hint">Перетягніть файли сюди або натисніть «Завантажити».</div>}
                </div>
              )}
            </Panel>
            {drag && <div className="dropzone__hint"><Icon name="upload" /> Відпустіть, щоб завантажити{current ? ` у «${current.name}»` : ''}</div>}
          </div>
        </div>
      </div>

      {open && <FileDrawer id={open} onClose={() => setOpen(null)} />}
      {pending && <UploadModal files={pending} folder={folder === 'all' ? state.folders[0] : current} onClose={() => setPending(null)} />}
      {newFolder && <NewFolder onClose={() => setNewFolder(false)} />}
    </div>
  );
}

function UploadModal({ files, folder, onClose }) {
  const { me, dispatch, toast, backend } = useStore();
  const [level, setLevel] = useState(folder.clearance);
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    if (!backend) return;
    setBusy(true);
    let done = 0;
    for (const file of files) {
      if (file.size > backend.maxFile) { toast(`«${file.name}» більший за ${fmtBytes(backend.maxFile)} — ліміт сховища`); continue; }
      const id = `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      let put;
      try { put = await backend.put(id, file); } catch (e) { toast(`«${file.name}»: ${storageError(e)}`); continue; }
      const meta = { id, folder: folder.id, name: file.name, size: file.size, type: file.type || 'application/octet-stream', clearance: level,
        owner: me.id, ownerName: me.name, at: new Date().toISOString(), stored: true, backend: backend.kind, ...put };
      if (backend.index) {
        try { await backend.index.addFile(meta); } catch { toast(`«${file.name}»: не вдалося записати індекс`); await backend.remove(meta).catch(() => {}); continue; }
      }
      dispatch({ type: 'file/add', file: meta });
      done++;
    }
    if (done) toast(`Завантажено: ${done} ${done === 1 ? 'файл' : 'файли'}`);
    onClose();
  };
  return (
    <Modal onClose={onClose} label="Завантаження файлів">
      <div className="vx-drawer__head"><h2 className="vx-h2">Завантаження в «{folder.name}»</h2></div>
      <div className="vx-drawer__body">
        <div className="list">
          {files.map((f) => (
            <div className="list__row" key={f.name}><span className="list__lead"><Icon name="file" size={16} /> {f.name}</span><span className="vx-hint vx-num">{fmtBytes(f.size)}</span></div>
          ))}
        </div>
        <div className="vx-field">
          <label className="vx-label" htmlFor="lvl">Гриф</label>
          <select id="lvl" className="vx-select" value={level} onChange={(e) => setLevel(+e.target.value)}>
            {CLEARANCE.filter((c) => c.id >= folder.clearance && c.id <= me.clearance).map((c) => <option key={c.id} value={c.id}>{c.full}</option>)}
          </select>
          <div className="vx-hint">Гриф не може бути нижчим за гриф папки чи вищим за ваш допуск.</div>
        </div>
      </div>
      <div className="vx-drawer__foot">
        <button className="vx-btn vx-btn--ghost" onClick={onClose}>Скасувати</button>
        <button className="vx-btn vx-btn--primary" onClick={upload} disabled={busy}>{busy ? <Loader size={18} /> : <><Icon name="upload" /> Завантажити</>}</button>
      </div>
    </Modal>
  );
}

function FileDrawer({ id, onClose }) {
  const { state, me, perms, dispatch, userById, toast, backend } = useStore();
  const f = state.files.find((x) => x.id === id);
  const [blob, setBlob] = useState(undefined);
  const [text, setText] = useState(null);
  const [url, setUrl] = useState(null);
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false); // keep the loader on screen long enough to be seen

  useEffect(() => {
    dispatch({ type: 'file/open', id });
    setReady(false);
    const t = setTimeout(() => setReady(true), 700);
    let u;
    (backend ? backend.get(f).catch(() => null) : Promise.resolve(null)).then(async (b) => {
      setBlob(b || null);
      if (!b) return;
      u = URL.createObjectURL(b);
      setUrl(u);
      if (/^text\/|json|csv|markdown/.test(b.type) || /\.(md|txt|csv|json)$/i.test(f.name)) setText((await b.text()).slice(0, 20000));
    });
    return () => { clearTimeout(t); if (u) URL.revokeObjectURL(u); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, backend]);

  if (!f) return null;
  const canDelete = perms.vault >= 3 || (perms.vault >= 2 && f.owner === me.id);

  const download = async () => {
    if (!blob) return toast('Вміст файлу недоступний');
    const res = await saveFile(f.name, blob);
    if (res === 'saved') dispatch({ type: 'file/open', id, download: true });
    else toast(SAVE_MESSAGE[res]);
  };
  const remove = async () => {
    if (!armed) { setArmed(true); return; }
    try {
      if (backend.index) await backend.index.removeFile(id);
      await backend.remove(f).catch(() => {});
    } catch { toast('Не вдалося видалити файл'); return; }
    dispatch({ type: 'file/delete', id });
    toast('Файл видалено');
    onClose();
  };

  return (
    <Drawer title={f.name} onClose={onClose}
      footer={<>
        {canDelete && backend?.writable && <button className="vx-btn vx-btn--danger" onClick={remove} onBlur={() => setArmed(false)}><Icon name="trash" /> {armed ? 'Точно видалити?' : 'Видалити'}</button>}
        <button className="vx-btn vx-btn--primary" onClick={download} disabled={!blob}><Icon name="download" /> Завантажити</button>
      </>}>
      <div className="preview">
        {(!ready || blob === undefined) ? (
          <div className="vx-empty"><Loader size={64} label="Розшифрування файлу" /><div className="vx-mono">Розшифрування…</div></div>
        ) : <>
          {blob && url && /^image\//.test(blob.type) && <img src={url} alt={f.name} />}
          {text != null && <pre className="vx-mono">{text}</pre>}
          {blob && !text && !/^image\//.test(blob.type) && <div className="vx-empty"><Loader still size={56} label={f.name} /><div>Попередній перегляд недоступний для цього формату</div></div>}
          {blob === null && <div className="vx-empty"><Loader still size={56} label={f.name} /><div>Вміст недоступний</div><div className="vx-hint">Файл не знайдено в сховищі «{backend?.label}». Можливо, його видалили або він зберігався на іншому пристрої.</div></div>}
        </>}
      </div>
      <dl className="meta">
        <dt>Гриф</dt><dd><ClassBadge level={f.clearance} /></dd>
        <dt>Папка</dt><dd>{state.folders.find((x) => x.id === f.folder)?.name}</dd>
        <dt>Розмір</dt><dd className="vx-num">{fmtBytes(f.size)}</dd>
        <dt>Власник</dt><dd>{userById(f.owner)?.name ?? f.ownerName ?? '—'}</dd>
        <dt>Змінено</dt><dd>{fmtDate(f.at)}</dd>
        <dt>Зберігання</dt><dd>{STORE_LABEL[f.backend || 'local']}</dd>
        <dt>ID</dt><dd className="vx-mono">{f.id}</dd>
      </dl>
    </Drawer>
  );
}

function NewFolder({ onClose }) {
  const { me, dispatch, toast, backend } = useStore();
  const [name, setName] = useState('');
  const [level, setLevel] = useState(0);
  const save = async () => {
    const folder = { id: `f-${Date.now().toString(36)}`, name: name.trim(), clearance: level, division: me.division };
    if (backend?.index) {
      try { await backend.index.addFolder(folder); } catch { toast('Не вдалося створити папку в сховищі'); return; }
    }
    dispatch({ type: 'folder/add', folder });
    toast('Папку створено');
    onClose();
  };
  return (
    <Modal onClose={onClose} label="Нова папка">
      <div className="vx-drawer__head"><h2 className="vx-h2">Нова папка</h2></div>
      <div className="vx-drawer__body">
        <div className="vx-field"><label className="vx-label" htmlFor="fn">Назва</label><input id="fn" className="vx-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div className="vx-field"><label className="vx-label" htmlFor="fl">Мінімальний гриф</label>
          <select id="fl" className="vx-select" value={level} onChange={(e) => setLevel(+e.target.value)}>
            {CLEARANCE.filter((c) => c.id <= me.clearance).map((c) => <option key={c.id} value={c.id}>{c.full}</option>)}
          </select></div>
      </div>
      <div className="vx-drawer__foot">
        <button className="vx-btn vx-btn--ghost" onClick={onClose}>Скасувати</button>
        <button className="vx-btn vx-btn--primary" disabled={!name.trim()} onClick={save}>Створити</button>
      </div>
    </Modal>
  );
}
