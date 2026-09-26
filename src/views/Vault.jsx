import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, fmtBytes, fmtDate } from '../store.jsx';
import { Panel, Drawer, ClassBadge, Modal } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { Loader } from '../brand/Mark.jsx';
import { STORAGE_QUOTA, CLEARANCE } from '../data/seed.js';
import { putBlob, getBlob, deleteBlob } from '../vaultdb.js';

const ext = (name) => (name.split('.').pop() || '').toUpperCase().slice(0, 5);

export function Vault() {
  const { state, me, perms, dispatch, userById, toast } = useStore();
  const [folder, setFolder] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [pending, setPending] = useState(null); // files chosen, awaiting classification
  const [drag, setDrag] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const input = useRef(null);

  const used = state.files.reduce((s, f) => s + f.size, 0);
  const current = state.folders.find((f) => f.id === folder);
  const canWrite = perms.vault >= 2 && (!current || current.clearance <= me.clearance);

  const files = useMemo(() => state.files
    .filter((f) => (folder === 'all' || f.folder === folder))
    .filter((f) => (q ? f.clearance <= me.clearance && f.name.toLowerCase().includes(q.toLowerCase()) : true))
    .sort((a, b) => b.at.localeCompare(a.at)), [state.files, folder, q, me.clearance]);

  const choose = (list) => {
    if (!list?.length) return;
    if (!canWrite) return toast('Недостатньо прав для завантаження в цю папку');
    setPending(Array.from(list));
  };

  const requestAccess = (f) => {
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
          <div className="vx-hint vx-num">{fmtBytes(used)} з {fmtBytes(STORAGE_QUOTA)}</div>
          <div className="vx-meter"><span style={{ width: `${(used / STORAGE_QUOTA) * 100}%` }} /></div>
        </div>
      </header>

      <div className="vault">
        <nav className="vault__folders vx-panel" aria-label="Папки">
          <button className={`vx-nav-item ${folder === 'all' ? 'is-active' : ''}`} onClick={() => setFolder('all')}>
            <Icon name="vault" /> Усі файли <span className="vault__count">{state.files.length}</span>
          </button>
          {state.folders.map((f) => {
            const locked = f.clearance > me.clearance;
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
                    const locked = f.clearance > me.clearance;
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
                        <td className="vx-hint">{owner?.name ?? '—'}</td>
                        <td className="vx-hint">{fmtDate(f.at, false)}</td>
                        <td className="ta-r">
                          {locked
                            ? <button className="vx-btn vx-btn--sm" onClick={(e) => { e.stopPropagation(); requestAccess(f); }}>Запит доступу</button>
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
  const { me, dispatch, toast } = useStore();
  const [level, setLevel] = useState(folder.clearance);
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    setBusy(true);
    for (const file of files) {
      const id = `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      try { await putBlob(id, file); } catch { toast(`Не вдалося зберегти «${file.name}» на пристрої`); continue; }
      dispatch({ type: 'file/add', file: { id, folder: folder.id, name: file.name, size: file.size, type: file.type, clearance: level, owner: me.id, at: new Date().toISOString(), stored: true } });
    }
    toast(`Завантажено: ${files.length} ${files.length === 1 ? 'файл' : 'файли'}`);
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
  const { state, me, perms, dispatch, userById, toast } = useStore();
  const f = state.files.find((x) => x.id === id);
  const [blob, setBlob] = useState(undefined);
  const [text, setText] = useState(null);
  const [url, setUrl] = useState(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    dispatch({ type: 'file/open', id });
    let u;
    (f.stored ? getBlob(id).catch(() => null) : Promise.resolve(null)).then(async (b) => {
      setBlob(b || null);
      if (!b) return;
      u = URL.createObjectURL(b);
      setUrl(u);
      if (/^text\/|json|csv|markdown/.test(b.type) || /\.(md|txt|csv|json)$/i.test(f.name)) setText((await b.text()).slice(0, 20000));
    });
    return () => u && URL.revokeObjectURL(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!f) return null;
  const canDelete = perms.vault >= 3 || (perms.vault >= 2 && f.owner === me.id);

  const download = () => {
    const b = blob || new Blob([`Reaction Core — демонстраційний запис\n\n${f.name}\nГриф: ${CLEARANCE[f.clearance].full}\n\nВміст цього файлу не зберігається в демо-версії.`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = blob ? f.name : `${f.name}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    dispatch({ type: 'file/open', id, download: true });
  };
  const remove = async () => {
    if (!armed) { setArmed(true); return; }
    if (f.stored) await deleteBlob(id).catch(() => {});
    dispatch({ type: 'file/delete', id });
    toast('Файл видалено');
    onClose();
  };

  return (
    <Drawer title={f.name} onClose={onClose}
      footer={<>
        {canDelete && <button className="vx-btn vx-btn--danger" onClick={remove} onBlur={() => setArmed(false)}><Icon name="trash" /> {armed ? 'Точно видалити?' : 'Видалити'}</button>}
        <button className="vx-btn vx-btn--primary" onClick={download}><Icon name="download" /> Завантажити</button>
      </>}>
      <div className="preview">
        {blob === undefined && <Loader size={40} />}
        {blob && url && /^image\//.test(blob.type) && <img src={url} alt={f.name} />}
        {text != null && <pre className="vx-mono">{text}</pre>}
        {blob && !text && !/^image\//.test(blob.type) && <div className="vx-empty"><Icon name="file" /> Попередній перегляд недоступний для цього формату</div>}
        {blob === null && <div className="vx-empty"><Icon name="file" /><div>Демонстраційний запис</div><div className="vx-hint">Вміст не зберігається. Завантажте власний файл, щоб перевірити перегляд.</div></div>}
      </div>
      <dl className="meta">
        <dt>Гриф</dt><dd><ClassBadge level={f.clearance} /></dd>
        <dt>Папка</dt><dd>{state.folders.find((x) => x.id === f.folder)?.name}</dd>
        <dt>Розмір</dt><dd className="vx-num">{fmtBytes(f.size)}</dd>
        <dt>Власник</dt><dd>{userById(f.owner)?.name}</dd>
        <dt>Змінено</dt><dd>{fmtDate(f.at)}</dd>
        <dt>Зберігання</dt><dd>{f.stored ? 'Цей пристрій (IndexedDB)' : 'Демо-метадані'}</dd>
        <dt>ID</dt><dd className="vx-mono">{f.id}</dd>
      </dl>
    </Drawer>
  );
}

function NewFolder({ onClose }) {
  const { me, dispatch, toast } = useStore();
  const [name, setName] = useState('');
  const [level, setLevel] = useState(0);
  const save = () => { dispatch({ type: 'folder/add', folder: { name: name.trim(), clearance: level, division: me.division } }); toast('Папку створено'); onClose(); };
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
