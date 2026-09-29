import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, fmtBytes, fmtDate, canSeeFile, lowerFile } from '../store.jsx';
import { saveFile, SAVE_MESSAGE } from '../lib/io.js';
import { Panel, Drawer, ClassBadge, SealBadge, Modal, Status } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { Loader } from '../brand/Mark.jsx';
import { STORAGE_QUOTA, CLEARANCE } from '../data/seed.js';
import { SEAL, DOWNGRADE_KINDS, levelOf, docNumber, nextSerial, hasBasis, canExport, exportName, downgradeState } from '../data/clearance.js';
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
    dispatch({ type: 'request/create', request: { kind: 'folder', folder: f.folder, reason: `Доступ до файлу рівня ${levelOf(f.clearance).name}.` } });
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
          <div className="vx-hint quota__where"><Icon name="vault" size={12} /> {backend ? backend.label : 'Підключення…'}</div>
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
                            {locked ? <span><span className="vx-redacted">{f.name.replace(/./g, '█').slice(0, 22)}</span></span> : <span className="cell-file__name"><span>{f.name}</span>{f.number && <span className="vx-hint vx-mono">{f.number}</span>}</span>}
                          </div>
                        </td>
                        <td><ClassBadge level={f.clearance} sealed={f.sealed} /></td>
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

function RuleFields({ level, rule, setRule, idp }) {
  if (level <= 0) return null;
  const to = levelOf(level - 1);
  return (
    <div className="vx-field">
      <span className="vx-label">Зниження грифа → {to.name}</span>
      <div className="segmented" role="group" aria-label="Правило зниження грифа">
        {DOWNGRADE_KINDS.map((k) => (
          <button type="button" key={k.id} className={rule.kind === k.id ? 'is-active' : ''} onClick={() => setRule({ ...rule, kind: k.id })}>{k.name}</button>
        ))}
      </div>
      {rule.kind === 'date' && <input id={`${idp}-date`} type="date" className="vx-input" value={rule.at || ''} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setRule({ ...rule, at: e.target.value })} aria-label="Дата зниження" />}
      {rule.kind === 'event' && <input id={`${idp}-event`} className="vx-input" placeholder="Напр.: публікація звіту замовником" value={rule.text || ''} onChange={(e) => setRule({ ...rule, text: e.target.value })} aria-label="Подія, після якої гриф знижується" />}
      <div className="vx-hint">Коли умова настане, документ буде позначено «до зниження»; знижує людина, на один крок.</div>
    </div>
  );
}

const ruleValid = (level, r) => level <= 0 || r.kind === 'none' || (r.kind === 'date' && r.at) || (r.kind === 'event' && (r.text || '').trim().length >= 4);
const ruleOut = (level, r) => (level <= 0 || r.kind === 'none' ? null : r.kind === 'date' ? { kind: 'date', at: r.at } : { kind: 'event', text: r.text.trim() });

function UploadModal({ files, folder, onClose }) {
  const { state, me, dispatch, toast, backend } = useStore();
  const [level, setLevel] = useState(Math.min(folder.clearance, me.clearance));
  const [sealed, setSealed] = useState(false);
  const [rule, setRule] = useState({ kind: 'none' });
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();
  const first = nextSerial(state.files.map((f) => f.number), year);
  const upload = async () => {
    if (!backend) return;
    setBusy(true);
    let done = 0;
    let serial = first;
    for (const file of files) {
      if (file.size > backend.maxFile) { toast(`«${file.name}» більший за ${fmtBytes(backend.maxFile)} — ліміт сховища`); continue; }
      const id = `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      let put;
      try { put = await backend.put(id, file); } catch (e) { toast(`«${file.name}»: ${storageError(e)}`); continue; }
      const meta = {
        id, number: docNumber({ level, sealed, year, serial }), folder: folder.id, name: file.name, size: file.size,
        type: file.type || 'application/octet-stream', clearance: level, sealed, downgrade: ruleOut(level, rule),
        owner: me.id, ownerName: me.name, at: new Date().toISOString(), stored: true, backend: backend.kind, ...put,
      };
      if (backend.index) {
        try { await backend.index.addFile(meta); } catch { toast(`«${file.name}»: не вдалося записати індекс`); await backend.remove(meta).catch(() => {}); continue; }
      }
      dispatch({ type: 'file/add', file: meta });
      serial++;
      done++;
    }
    if (done) toast(`Завантажено: ${done} ${done === 1 ? 'файл' : 'файли'}`);
    onClose();
  };
  const l = levelOf(level);
  return (
    <Modal onClose={onClose} label="Завантаження файлів">
      <div className="vx-drawer__head"><h2 className="vx-h2">Завантаження в «{folder.name}»</h2></div>
      <div className="vx-drawer__body">
        <div className="list">
          {files.map((f, i) => (
            <div className="list__row" key={f.name + i}>
              <span className="list__lead"><Icon name="file" size={16} /> {f.name}</span>
              <span className="vx-hint vx-mono">{docNumber({ level, sealed, year, serial: first + i })}</span>
            </div>
          ))}
        </div>
        <div className="vx-field">
          <label className="vx-label" htmlFor="lvl">Гриф</label>
          <select id="lvl" className="vx-select" value={level} onChange={(e) => { setLevel(+e.target.value); setRule({ kind: 'none' }); }}>
            {CLEARANCE.filter((c) => c.id >= folder.clearance && c.id <= me.clearance).map((c) => <option key={c.id} value={c.id}>{c.full}</option>)}
          </select>
          <div className="vx-hint"><b>{l.name}:</b> {l.rule} Гриф не нижчий за гриф папки й не вищий за ваш допуск.</div>
        </div>
        <label className="vx-check">
          <input type="checkbox" checked={sealed} onChange={(e) => setSealed(e.target.checked)} />
          <span><SealBadge /> <span className="vx-hint">{SEAL.gloss}. {SEAL.rule} Інша категорія, не ступінь: про придатність змісту до сприйняття.</span></span>
        </label>
        <RuleFields level={level} rule={rule} setRule={setRule} idp="up" />
        <div className="vx-hint">Позначка рівня входить у номер документа — вона не загубиться при пересиланні.</div>
      </div>
      <div className="vx-drawer__foot">
        <button className="vx-btn vx-btn--ghost" onClick={onClose}>Скасувати</button>
        <button className="vx-btn vx-btn--primary" onClick={upload} disabled={busy || !ruleValid(level, rule)}>{busy ? <Loader size={18} /> : <><Icon name="upload" /> Завантажити</>}</button>
      </div>
    </Modal>
  );
}

// Opening content: NON OCULIS needs a basis granted for this document; NOX (and a
// sealed document once a basis exists) is opened by a separate, logged act each time.
function Gate({ f, onOpen }) {
  const { state, me, dispatch, toast } = useStore();
  const [purpose, setPurpose] = useState('');
  const [reason, setReason] = useState('');
  if (!hasBasis(me, f)) {
    const pending = state.requests.some((r) => r.user === me.id && r.kind === 'basis' && r.file === f.id && r.status === 'pending');
    return (
      <div className="gate">
        <SealBadge />
        <div className="gate__title">{SEAL.rule}</div>
        <p className="vx-hint">{SEAL.about}</p>
        {pending ? <Status kind="idle">Запит на підставу розглядається</Status> : (
          <form className="gate__form" onSubmit={(e) => { e.preventDefault(); dispatch({ type: 'request/create', request: { kind: 'basis', file: f.id, reason: reason.trim() } }); toast('Запит на підставу надіслано'); }}>
            <input className="vx-input" placeholder="Підстава: для чого потрібен саме цей документ" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Підстава" />
            <button className="vx-btn" disabled={reason.trim().length < 12}>Запросити підставу</button>
          </form>
        )}
      </div>
    );
  }
  return (
    <div className="gate">
      <ClassBadge level={f.clearance} sealed={f.sealed} />
      <div className="gate__title">{f.sealed ? 'Відкриття за підставою' : 'NOX · доступ вимагає окремої дії'}</div>
      <p className="vx-hint">{f.sealed ? 'Вміст може бути непридатним до сприйняття. Кожне відкриття записується в журнал безпеки з метою.' : 'Допуску недостатньо: кожне відкриття — окрема дія з метою, що записується в журнал безпеки. Документ не залишає системи.'}</p>
      <form className="gate__form" onSubmit={(e) => { e.preventDefault(); dispatch({ type: 'file/act', id: f.id, purpose: purpose.trim(), sealed: f.sealed }); onOpen(); }}>
        <input className="vx-input" placeholder="Мета відкриття" value={purpose} onChange={(e) => setPurpose(e.target.value)} aria-label="Мета відкриття" autoFocus />
        <button className="vx-btn vx-btn--brass" disabled={purpose.trim().length < 6}><Icon name="eye" /> Відкрити</button>
      </form>
    </div>
  );
}

function Lowering({ f }) {
  const { me, dispatch, toast, backend, state } = useStore();
  const [edit, setEdit] = useState(false);
  const [rule, setRule] = useState(f.downgrade || { kind: 'none' });
  const [why, setWhy] = useState('');
  const division = state.folders.find((x) => x.id === f.folder)?.division;
  const may = f.owner === me.id || me.role === 'admin' || (me.role === 'lead' && (!division || division === me.division));
  const st = downgradeState(f);
  const write = async (next) => {
    if (backend?.index) { try { await backend.index.addFile(next); } catch { toast('Не вдалося оновити індекс сховища'); return false; } }
    return true;
  };
  const lower = async () => {
    const reason = st.due ? `настав строк ${new Date(`${f.downgrade.at}T00:00:00`).toLocaleDateString('uk-UA')}` : `подія настала: ${why.trim()}`;
    const next = lowerFile(f, st.to, me.id, reason);
    if (await write(next)) { dispatch({ type: 'file/level', file: next, why: reason }); toast(`Гриф знижено до ${levelOf(st.to).name}`); }
  };
  const saveRule = async () => {
    const next = { ...f, downgrade: ruleOut(f.clearance, rule) };
    if (await write(next)) { dispatch({ type: 'file/update', file: next, note: 'Змінено правило зниження грифа' }); setEdit(false); }
  };
  if (f.clearance <= 0) return null;
  return (
    <div className="lowering">
      <div className="vx-eyebrow">Зниження грифа</div>
      {st ? (
        <div className="lowering__row">
          <span>{levelOf(f.clearance).name} → {levelOf(st.to).name} {st.label}</span>
          {st.due === true && <Status kind="warn">Строк настав — до зниження</Status>}
        </div>
      ) : <div className="vx-hint">Правило не встановлено.</div>}
      {may && st && st.due === true && <button className="vx-btn vx-btn--sm" onClick={lower}><Icon name="arrowDown" /> Знизити до {levelOf(st.to).name}</button>}
      {may && st && st.due === null && (
        <div className="gate__form">
          <input className="vx-input" placeholder="Що саме сталося" value={why} onChange={(e) => setWhy(e.target.value)} aria-label="Подія" />
          <button className="vx-btn vx-btn--sm" disabled={why.trim().length < 4} onClick={lower}><Icon name="arrowDown" /> Подія настала — знизити</button>
        </div>
      )}
      {may && !edit && <button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setEdit(true)}>{st ? 'Змінити правило' : 'Встановити правило'}</button>}
      {edit && <>
        <RuleFields level={f.clearance} rule={rule} setRule={setRule} idp="ed" />
        <div className="gate__form">
          <button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setEdit(false)}>Скасувати</button>
          <button className="vx-btn vx-btn--sm" disabled={!ruleValid(f.clearance, rule)} onClick={saveRule}>Зберегти правило</button>
        </div>
      </>}
    </div>
  );
}

function FileDrawer({ id, onClose }) {
  const { state, me, perms, dispatch, userById, toast, backend } = useStore();
  const f = state.files.find((x) => x.id === id);
  const gated = !!f && (f.sealed || levelOf(f.clearance).act);
  const [opened, setOpened] = useState(!gated);
  const [blob, setBlob] = useState(undefined);
  const [text, setText] = useState(null);
  const [url, setUrl] = useState(null);
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false); // keep the loader on screen long enough to be seen

  useEffect(() => {
    if (!opened) return undefined;
    if (!gated) dispatch({ type: 'file/open', id });
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
  }, [id, backend, opened]);

  if (!f) return null;
  const canDelete = perms.vault >= 3 || (perms.vault >= 2 && f.owner === me.id);
  const exportable = canExport(f);

  const download = async () => {
    if (!blob || !exportable) return;
    const res = await saveFile(exportName(f), blob);
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
        {exportable
          ? <button className="vx-btn vx-btn--primary" onClick={download} disabled={!blob}><Icon name="download" /> Завантажити</button>
          : <span className="vx-hint"><Icon name="lock" size={14} /> {f.sealed ? 'Лише перегляд за підставою' : 'NOX не залишає системи'}</span>}
      </>}>
      <div className={`preview ${gated ? 'preview--closed' : ''}`} onContextMenu={gated ? (e) => e.preventDefault() : undefined}>
        {!opened ? <Gate f={f} onOpen={() => setOpened(true)} /> : (!ready || blob === undefined) ? (
          <div className="vx-empty"><Loader size={64} label="Розшифрування файлу" /><div className="vx-mono">Розшифрування…</div></div>
        ) : <>
          {blob && url && /^image\//.test(blob.type) && <img src={url} alt={f.name} draggable={!gated} />}
          {text != null && <pre className="vx-mono">{text}</pre>}
          {blob && !text && !/^image\//.test(blob.type) && <div className="vx-empty"><Loader still size={56} label={f.name} /><div>Попередній перегляд недоступний для цього формату</div>{!exportable && <div className="vx-hint">Файл цього рівня не виноситься з системи.</div>}</div>}
          {blob === null && <div className="vx-empty"><Loader still size={56} label={f.name} /><div>Вміст недоступний</div><div className="vx-hint">Файл не знайдено в сховищі «{backend?.label}». Можливо, його видалили або він зберігався на іншому пристрої.</div></div>}
        </>}
      </div>
      <dl className="meta">
        <dt>Номер</dt><dd className="vx-mono">{f.number ?? '—'}</dd>
        <dt>Гриф</dt><dd><ClassBadge level={f.clearance} sealed={f.sealed} /></dd>
        <dt>Правило</dt><dd>{f.sealed ? SEAL.rule : levelOf(f.clearance).rule}</dd>
        <dt>Папка</dt><dd>{state.folders.find((x) => x.id === f.folder)?.name}</dd>
        <dt>Розмір</dt><dd className="vx-num">{fmtBytes(f.size)}</dd>
        <dt>Власник</dt><dd>{userById(f.owner)?.name ?? f.ownerName ?? '—'}</dd>
        <dt>Змінено</dt><dd>{fmtDate(f.at)}</dd>
        <dt>Зберігання</dt><dd>{STORE_LABEL[f.backend || 'local']}</dd>
      </dl>
      <Lowering f={f} />
      {!!f.lowered?.length && (
        <div className="lowering">
          <div className="vx-eyebrow">Історія грифа</div>
          {f.lowered.map((x, i) => <div className="vx-hint" key={i}>{fmtDate(x.at)} · {levelOf(x.from).name} → {levelOf(x.to).name} · {userById(x.by)?.name ?? '—'} · {x.why}</div>)}
        </div>
      )}
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
