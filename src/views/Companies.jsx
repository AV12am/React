// Intelligence · «Компанії»: a layer of company cards on top of the «Організації» register.
//   List  — logo, name, sector, city, status; search and filters.
//   Card  — logo, photo gallery, description, registry data, documents, related records, watch buttons.
// Every logo, photo and document is a Vault file in the company's own folder («Компанії / <назва>»),
// stored by the active backend under companies/<ЄДРПОУ>/… — with a document number, grif and audit entry.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, fmtDate, fmtBytes } from '../store.jsx';
import { Panel, ClassBadge, Modal } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { Loader } from '../brand/Mark.jsx';
import { ORG_SECTORS, ORGS_UA } from '../data/orgs-ua.js';
import { ORG_STATUS, registerOf } from '../data/workspaces.js';
import { docNumber, nextSerial } from '../data/clearance.js';
import { storageError } from '../lib/storage.js';
import { usedBy } from '../lib/provenance.js';
import { OrgExtras, orgToRecord, refPatches } from './Orgs.jsx';

const isImage = (f) => /^image\//.test(f?.type || '');
const openRecord = (go, r) => go('divisions', r.div, `${r.col}:${r.id}`);
const titleOf = (r) => { const reg = registerOf(r.div, r.col); return (reg && r[reg.title]) || 'Без назви'; };
const folderId = (org) => `f-org-${org.code || org.id}`;
const initials = (name) => name.replace(/[«»"()]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const SECTOR_HUE = Object.fromEntries(ORG_SECTORS.map((s, i) => [s, (i * 29 + 8) % 360]));

/* ---------- files: blob URLs with a small cache ---------- */

const urls = new Map();
function useFileUrl(file) {
  const { backend } = useStore();
  const [url, setUrl] = useState(() => (file && urls.get(file.id)) || null);
  useEffect(() => {
    let live = true;
    if (!file || !backend) return undefined;
    if (urls.has(file.id)) { setUrl(urls.get(file.id)); return undefined; }
    backend.get(file).then((blob) => {
      if (!blob || !live) return;
      const u = URL.createObjectURL(blob);
      urls.set(file.id, u);
      setUrl(u);
    }).catch(() => {});
    return () => { live = false; };
  }, [file, backend]);
  return url;
}

function Logo({ org, size = 56 }) {
  const { state } = useStore();
  const file = org.logo && state.files.find((f) => f.id === org.logo);
  const url = useFileUrl(file);
  const style = { width: size, height: size, '--hue': SECTOR_HUE[org.sector] ?? 220 };
  return url
    ? <img className="co-logo" src={url} alt={`Логотип ${org.name}`} style={style} />
    : <span className="co-logo co-logo--mono" style={{ ...style, fontSize: size * 0.36 }} aria-hidden="true">{initials(org.name || '?')}</span>;
}

/** Upload, attach and remove company files (logo, photos, documents) in the company's Vault folder. */
function useCompanyFiles(org) {
  const { state, me, dispatch, toast, backend } = useStore();
  const ensureFolder = async () => {
    const id = folderId(org);
    const existing = state.folders.find((f) => f.id === id);
    if (existing) return existing;
    const folder = { id, name: `Компанії / ${org.name}`, clearance: org.clearance || 0, division: 'int', group: 'companies', org: org.id };
    if (backend?.index) await backend.index.addFolder(folder);
    dispatch({ type: 'folder/add', folder });
    return folder;
  };
  const upload = async (list, kind) => {
    if (!backend) return [];
    const folder = await ensureFolder();
    const year = new Date().getFullYear();
    let serial = nextSerial(state.files.map((f) => f.number), year);
    const out = [];
    for (const file of list) {
      if (kind !== 'doc' && !isImage(file)) { toast(`«${file.name}» — не зображення`); continue; }
      if (file.size > backend.maxFile) { toast(`«${file.name}» більший за ${fmtBytes(backend.maxFile)}`); continue; }
      const id = `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      let put;
      try { put = await backend.put(id, file, { dir: `companies/${org.code || org.id}` }); } catch (e) { toast(`«${file.name}»: ${storageError(e)}`); continue; }
      const level = Math.max(folder.clearance, org.clearance || 0);
      const meta = {
        id, number: docNumber({ level, sealed: false, year, serial }), folder: folder.id, name: file.name, size: file.size,
        type: file.type || 'application/octet-stream', clearance: level, sealed: false, downgrade: null,
        owner: me.id, ownerName: me.name, at: new Date().toISOString(), stored: true, backend: backend.kind, org: org.id, role: kind, ...put,
      };
      if (backend.index) {
        try { await backend.index.addFile(meta); } catch { toast(`«${file.name}»: не вдалося записати індекс`); await backend.remove(meta).catch(() => {}); continue; }
      }
      dispatch({ type: 'file/add', file: meta });
      out.push(meta);
      serial++;
    }
    return out;
  };
  const remove = async (file) => {
    try { await backend.remove(file); } catch { /* already gone */ }
    if (backend.index) await backend.index.removeFile(file.id).catch(() => {});
    dispatch({ type: 'file/delete', id: file.id });
    urls.delete(file.id);
  };
  const patch = (p, note) => dispatch({ type: 'record/update', id: org.id, patch: p, where: 'Розвідка · Компанії', label: org.name, note });
  return { upload, remove, patch, folderId: folderId(org) };
}

/* ---------- list ---------- */

function CompanyCard({ org, go }) {
  const { state } = useStore();
  const photos = state.files.filter((f) => f.folder === folderId(org) && f.role === 'photo').length;
  return (
    <button className="co-card vx-panel" onClick={() => go('divisions', 'int', `companies:${org.id}`)}>
      <Logo org={org} size={48} />
      <span className="co-card__text">
        <span className="co-card__name">{org.name}</span>
        <span className="vx-hint">{org.sector || '—'}{org.city ? ` · ${org.city}` : ''}</span>
        <span className="co-card__tags">
          {org.code && <span className="vx-tag vx-mono">{org.code}</span>}
          {org.status && org.status !== 'Діє' && <span className="vx-tag ws-flag">{org.status}</span>}
          {org.relation && org.relation !== 'Немає' && <span className="vx-tag">{org.relation}</span>}
          {photos > 0 && <span className="vx-tag"><Icon name="camera" size={12} /> {photos}</span>}
        </span>
      </span>
    </button>
  );
}

function CompanyList({ access, go }) {
  const { state, me, dispatch, toast } = useStore();
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const [rel, setRel] = useState('');
  const orgs = (state.records || []).filter((r) => r.col === 'orgs' && r.clearance <= me.clearance);
  const shown = orgs
    .filter((o) => !sector || o.sector === sector)
    .filter((o) => !rel || o.relation === rel)
    .filter((o) => !q || `${o.name} ${o.legal || ''} ${o.code || ''} ${o.city || ''} ${o.about || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  const loadAll = () => {
    const have = new Set((state.records || []).map((r) => r.id));
    const add = ORGS_UA.map(orgToRecord).filter((r) => !have.has(r.id));
    dispatch({ type: 'record/bulk', records: add, where: 'Розвідка · Компанії', label: `завантажено довідник: ${add.length} компаній` });
    toast(`Додано ${add.length} компаній`);
  };
  const backfill = refPatches(orgs);
  const fill = () => {
    dispatch({ type: 'record/bulk', records: [], patches: backfill, where: 'Розвідка · Компанії', label: `доповнено довідкові дані: ${backfill.length}` });
    toast(`Доповнено: ${backfill.length}`);
  };
  if (!orgs.length) {
    return (
      <Panel title="Компанії">
        <div className="stack">
          <div className="vx-hint">Карток ще немає. Завантажте довідник 100 провідних компаній України або додайте організацію у вкладці «Організації».</div>
          {access.canEdit && <button className="vx-btn vx-btn--primary" onClick={loadAll}><Icon name="download" /> Завантажити довідник (100)</button>}
        </div>
      </Panel>
    );
  }
  return (
    <div className="stack">
      <div className="toolbar">
        <div className="vx-search toolbar__grow">
          <Icon name="search" />
          <input className="vx-input" placeholder="Назва, ЄДРПОУ, місто або слово з опису" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Пошук компаній" />
        </div>
        <select className="vx-select toolbar__sel" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Галузь">
          <option value="">Усі галузі</option>
          {ORG_SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="vx-select toolbar__sel" value={rel} onChange={(e) => setRel(e.target.value)} aria-label="Стосунок">
          <option value="">Будь-який стосунок</option>
          {['Постачальник', 'Клієнт', 'Партнер', 'Конкурент', 'Об’єкт аналізу'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="toolbar">
        <span className="vx-hint">{shown.length} з {orgs.length}</span>
        {access.canEdit && backfill.length > 0 && <button className="vx-btn vx-btn--sm" onClick={fill}><Icon name="file" /> Доповнити сайти, роки, власників ({backfill.length})</button>}
      </div>
      <div className="co-grid">{shown.map((o) => <CompanyCard key={o.id} org={o} go={go} />)}</div>
      {!shown.length && <div className="vx-empty"><Icon name="search" /><div>Нічого не знайдено</div></div>}
    </div>
  );
}

/* ---------- card ---------- */

function Photo({ file, onOpen }) {
  const url = useFileUrl(file);
  return (
    <button className="co-photo" onClick={() => onOpen(file)} title={file.name}>
      {url ? <img src={url} alt={file.name} loading="lazy" /> : <Loader size={24} label="Завантаження" />}
    </button>
  );
}

function Lightbox({ file, canEdit, onRemove, onLogo, onClose }) {
  const url = useFileUrl(file);
  return (
    <Modal onClose={onClose} label={file.name}>
      <div className="co-lightbox">
        {url ? <img src={url} alt={file.name} /> : <Loader size={40} />}
        <div className="co-lightbox__bar">
          <span className="vx-hint vx-mono">{file.number} · {file.name} · {fmtBytes(file.size)}</span>
          <span className="grow" />
          {canEdit && <button className="vx-btn vx-btn--sm" onClick={onLogo}>Зробити логотипом</button>}
          {canEdit && <button className="vx-btn vx-btn--sm vx-btn--danger" onClick={onRemove}><Icon name="trash" /> Видалити</button>}
          <button className="vx-btn vx-btn--sm vx-btn--ghost" onClick={onClose}>Закрити</button>
        </div>
      </div>
    </Modal>
  );
}

const EDIT = [
  ['about', 'Опис', 'long'], ['products', 'Продукти й напрями', 'long'], ['website', 'Сайт', 'url'], ['founded', 'Рік заснування', 'num'],
  ['headcount', 'Персонал', 'text'], ['status', 'Стан', ORG_STATUS], ['relation', 'Стосунок до нас', ['Немає', 'Постачальник', 'Клієнт', 'Партнер', 'Конкурент', 'Об’єкт аналізу']],
  ['significance', 'Значущість', ['Ключова', 'Важлива', 'Довідкова']], ['owners', 'Власники й бенефіціари', 'long'], ['notes', 'Нотатки', 'long'],
];

function Editor({ org, onSave, onCancel }) {
  const [d, setD] = useState(() => Object.fromEntries(EDIT.map(([k]) => [k, org[k] ?? ''])));
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  return (
    <div className="stack">
      <div className="form-grid">
        {EDIT.map(([k, label, kind]) => (
          <div className={`vx-field ${kind === 'long' ? 'co-wide' : ''}`} key={k}>
            <label className="vx-label" htmlFor={`co-${k}`}>{label}</label>
            {Array.isArray(kind)
              ? <select id={`co-${k}`} className="vx-select" value={d[k]} onChange={set(k)}><option value="">—</option>{kind.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              : kind === 'long' ? <textarea id={`co-${k}`} className="vx-input ws-textarea" rows={k === 'about' ? 5 : 3} value={d[k]} onChange={set(k)} />
                : <input id={`co-${k}`} className="vx-input" type={kind === 'num' ? 'number' : kind === 'url' ? 'url' : 'text'} value={d[k]} onChange={set(k)} />}
            {k === 'owners' && <div className="vx-hint">Лише з державного реєстру, з датою. Про людей — тільки публічна ділова роль.</div>}
          </div>
        ))}
      </div>
      <div className="toolbar">
        <button className="vx-btn vx-btn--primary" onClick={() => onSave({ ...d, founded: d.founded === '' ? '' : +d.founded })}><Icon name="check" /> Зберегти</button>
        <button className="vx-btn vx-btn--ghost" onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
}

function CompanyPage({ org, access, go }) {
  const { state, me, toast, backend } = useStore();
  const { upload, remove, patch, folderId: fid } = useCompanyFiles(org);
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const logoIn = useRef(null), photoIn = useRef(null), docIn = useRef(null);
  const files = state.files.filter((f) => f.folder === fid && f.clearance <= me.clearance).sort((a, b) => b.at.localeCompare(a.at));
  const photos = files.filter((f) => f.role === 'photo' || (f.role !== 'doc' && f.role !== 'logo' && isImage(f)));
  const docs = files.filter((f) => f.role === 'doc' || (!isImage(f) && f.role !== 'logo'));
  const related = useMemo(() => {
    const recs = state.records || [];
    return [...recs.filter((r) => r.col === 'intake' && r.org === org.id), ...usedBy(org.id, recs)].filter((r) => r.clearance <= me.clearance);
  }, [state.records, org.id, me.clearance]);
  const canEdit = access.canEdit && backend?.writable !== false;

  const run = async (label, fn) => { setBusy(label); try { await fn(); } catch (e) { toast(e.message || 'Помилка'); } finally { setBusy(''); } };
  const onLogo = (list) => run('logo', async () => {
    const [m] = await upload(list, 'logo');
    if (m) { patch({ logo: m.id }, 'новий логотип'); toast('Логотип оновлено'); }
  });
  const onPhotos = (list) => run('photo', async () => {
    const ms = await upload(list, 'photo');
    if (ms.length) { patch({ photos: [...(org.photos || []), ...ms.map((m) => m.id)] }, `додано фото: ${ms.length}`); toast(`Додано фото: ${ms.length}`); }
  });
  const onDocs = (list) => run('doc', async () => {
    const ms = await upload(list, 'doc');
    if (ms.length) toast(`Додано документів: ${ms.length}`);
  });
  const removeFile = (f) => run('remove', async () => {
    await remove(f);
    patch({ photos: (org.photos || []).filter((x) => x !== f.id), ...(org.logo === f.id ? { logo: null } : {}) }, `видалено файл «${f.name}»`);
    setLightbox(null);
  });

  const facts = [
    ['Юридична назва', org.legal], ['ЄДРПОУ', org.code], ['Галузь', org.sector], ['Місто', org.city], ['Стан', org.status],
    ['Рік заснування', org.founded], ['Персонал', org.headcount], ['Стосунок до нас', org.relation], ['Значущість', org.significance],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');

  return (
    <div className="stack co-page">
      <button className="vx-eyebrow ws-back" onClick={() => go('divisions', 'int', 'companies')}><Icon name="chevron" size={12} className="ws-back__icon" /> Компанії</button>
      <section className="co-hero vx-panel">
        <div className="co-hero__logo">
          <Logo org={org} size={96} />
          {canEdit && <>
            <input ref={logoIn} type="file" accept="image/*" hidden onChange={(e) => { onLogo(Array.from(e.target.files)); e.target.value = ''; }} />
            <button className="vx-btn vx-btn--sm" disabled={!!busy} onClick={() => logoIn.current.click()}>{busy === 'logo' ? <Loader size={16} /> : <><Icon name="upload" /> Логотип</>}</button>
          </>}
        </div>
        <div className="co-hero__main">
          <h1 className="vx-h1">{org.name}</h1>
          <div className="vx-muted">{org.legal}</div>
          <div className="co-card__tags">
            <ClassBadge level={org.clearance} />
            {org.code && <span className="vx-tag vx-mono">ЄДРПОУ {org.code}</span>}
            {org.sector && <span className="vx-tag">{org.sector}</span>}
            {org.city && <span className="vx-tag">{org.city}</span>}
            {org.status && <span className={`vx-tag ${org.status !== 'Діє' ? 'ws-flag' : ''}`}>{org.status}</span>}
          </div>
          {org.website && <a className="ws-link" href={org.website} target="_blank" rel="noopener noreferrer"><Icon name="globe" size={14} /> {org.website}</a>}
        </div>
        {canEdit && !editing && <button className="vx-btn" onClick={() => setEditing(true)}>Редагувати дані</button>}
      </section>

      {editing ? (
        <Panel title="Дані компанії"><Editor org={org} onCancel={() => setEditing(false)} onSave={(p) => { patch(p, 'оновлено дані'); setEditing(false); toast('Збережено'); }} /></Panel>
      ) : (
        <div className="co-cols">
          <Panel title="Опис">
            <div className="stack">
              {org.about ? <p className="co-about">{org.about}</p> : <div className="vx-hint">Опису ще немає.</div>}
              {org.products && <><div className="vx-eyebrow">Продукти й напрями</div><p className="co-about">{org.products}</p></>}
              {org.owners && <><div className="vx-eyebrow">Власники й бенефіціари</div><p className="co-about">{org.owners}</p>
                {org.id.startsWith('org-') && <div className="vx-hint">З відкритих джерел (Forbes Україна, Opendatabot, SMIDA), станом на {fmtDate(org.checked || '2026-10-04', false)}. Власність змінюється — звіряйте з реєстром.</div>}</>}
              {org.notes && <><div className="vx-eyebrow">Нотатки</div><p className="co-about vx-muted">{org.notes}</p></>}
              {org.id.startsWith('org-') && <div className="vx-hint">Опис із довідника — чернетка: перевірте й доповніть.</div>}
            </div>
          </Panel>
          <Panel title="Дані">
            <div className="stack">
              <dl className="meta">{facts.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></Fragment>)}</dl>
              {org.source && <div className="vx-hint">Джерело: <a className="ws-link" href={org.source} target="_blank" rel="noopener noreferrer">{(() => { try { return new URL(org.source).host; } catch { return org.source; } })()}</a>{org.checked ? `, перевірено ${fmtDate(org.checked, false)}` : ''}</div>}
              <OrgExtras record={org} />
            </div>
          </Panel>
        </div>
      )}

      <Panel title={`Фотографії · ${photos.length}`} action={canEdit && <>
        <input ref={photoIn} type="file" accept="image/*" multiple hidden onChange={(e) => { onPhotos(Array.from(e.target.files)); e.target.value = ''; }} />
        <button className="vx-btn vx-btn--sm" disabled={!!busy} onClick={() => photoIn.current.click()}>{busy === 'photo' ? <Loader size={16} /> : <><Icon name="camera" /> Додати фото</>}</button>
      </>}>
        {photos.length ? <div className="co-gallery">{photos.map((f) => <Photo key={f.id} file={f} onOpen={setLightbox} />)}</div>
          : <div className="vx-hint">Фото ще немає: офіс, виробництво, об’єкти, продукція.</div>}
      </Panel>

      <Panel title={`Документи · ${docs.length}`} bodyClass="list" action={canEdit && <>
        <input ref={docIn} type="file" multiple hidden onChange={(e) => { onDocs(Array.from(e.target.files)); e.target.value = ''; }} />
        <button className="vx-btn vx-btn--sm" disabled={!!busy} onClick={() => docIn.current.click()}>{busy === 'doc' ? <Loader size={16} /> : <><Icon name="upload" /> Додати документ</>}</button>
      </>}>
        {docs.map((f) => (
          <div className="list__row" key={f.id}>
            <button className="list__lead ws-link" onClick={() => go('vault', f.id)}><Icon name="file" size={16} /> {f.name}</button>
            <span className="vx-hint vx-mono">{f.number}</span>
            <span className="vx-hint">{fmtBytes(f.size)} · {fmtDate(f.at, false)}</span>
            {canEdit && <button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => removeFile(f)} aria-label={`Видалити ${f.name}`}><Icon name="trash" /></button>}
          </div>
        ))}
        {!docs.length && <div className="list__row vx-hint">Документів ще немає: витяги з реєстру, звіти, презентації.</div>}
        <div className="list__row vx-hint">
          Усі файли лежать у папці «Компанії / {org.name}» Сховища{backend?.kind === 'supabase' ? ` (companies/${org.code || org.id}/ у Supabase Storage)` : ''}.
          <button className="ws-link" onClick={() => go('vault', fid)}>Відкрити папку</button>
        </div>
      </Panel>

      <Panel title={`Пов’язані записи · ${related.length}`} bodyClass="list">
        {related.map((r) => (
          <button key={r.id} className="list__row list__row--btn" onClick={() => openRecord(go, r)}>
            <span className="vx-tag">{registerOf(r.div, r.col)?.one}</span> <span>{titleOf(r)}</span>
          </button>
        ))}
        {!related.length && <div className="list__row vx-hint">Надходжень і суджень про цю компанію ще немає.</div>}
      </Panel>

      {lightbox && <Lightbox file={lightbox} canEdit={canEdit} onClose={() => setLightbox(null)} onRemove={() => removeFile(lightbox)}
        onLogo={() => { patch({ logo: lightbox.id }, 'новий логотип'); toast('Логотип оновлено'); setLightbox(null); }} />}
    </div>
  );
}

/** Workspace view «Компанії»: the list, or one company when `openId` is given. */
export function CompaniesView({ access, go, openId }) {
  const { state, me } = useStore();
  const org = openId && (state.records || []).find((r) => r.id === openId && r.col === 'orgs');
  if (openId && !org) return <Panel><div className="vx-empty">Компанію не знайдено або вона вища за ваш допуск.</div></Panel>;
  if (org && org.clearance > me.clearance) return <Panel><div className="vx-empty">Гриф вище вашого допуску.</div></Panel>;
  return org ? <CompanyPage key={org.id} org={org} access={access} go={go} /> : <CompanyList access={access} go={go} />;
}

