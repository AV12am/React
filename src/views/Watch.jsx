// Intelligence · «Конвеєр»: watchlists → open sources (api/watch.js) → intake items with source and date.
import { useRef, useState } from 'react';
import { useStore, fmtDate, fmtAgo } from '../store.jsx';
import { Panel, ClassBadge, Status } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { Loader } from '../brand/Mark.jsx';
import { supabaseOn, authHeaders } from '../lib/supabase.js';
import { parseRnbo, parseTerms, matchList, rnboFinding, RNBO_SOURCE } from '../../scripts/lib/match.mjs';
import { docNumber, nextSerial } from '../data/clearance.js';
import { storageError } from '../lib/storage.js';

// The RNBO register (drs.nsdc.gov.ua) lets only a browser in: a person downloads «Юридичні особи → CSV»
// and uploads it here. It is kept in the Vault («Санкційні списки») for the whole team and every run matches against it.
const RNBO_FOLDER = { id: 'f-sanctions', name: 'Санкційні списки', clearance: 0, division: 'int' };
const RNBO_ROLE = 'rnbo-legal';
const latestRnbo = (files) => files.filter((f) => f.role === RNBO_ROLE).sort((a, b) => b.at.localeCompare(a.at))[0] || null;
async function rnboFindings(backend, file, lists) {
  const blob = file && await backend.get(file);
  if (!blob) return [];
  const entries = parseRnbo(await blob.text());
  const day = new Date().toISOString().slice(0, 10);
  return lists.filter((w) => w.kind === 'Контрагенти й санкції').flatMap((w) => matchList(parseTerms(w.terms), entries).map((m) => rnboFinding(w, m, day)));
}

function RnboList({ onUploaded }) {
  const { state, me, dispatch, toast, backend } = useStore();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const file = latestRnbo(state.files);
  const upload = async (f) => {
    if (!f || !backend) return;
    setBusy(true);
    try {
      const entries = parseRnbo(await f.text()); // refuses a wrong file before it is stored
      if (!state.folders.some((x) => x.id === RNBO_FOLDER.id)) {
        if (backend.index) await backend.index.addFolder(RNBO_FOLDER);
        dispatch({ type: 'folder/add', folder: RNBO_FOLDER });
      }
      const id = `x-${Date.now().toString(36)}`;
      const name = `RNBO-legal-${new Date().toISOString().slice(0, 10)}.csv`;
      let put;
      try { put = await backend.put(id, f, { dir: 'sanctions' }); } catch (e) { throw new Error(storageError(e)); }
      const year = new Date().getFullYear();
      const meta = { id, number: docNumber({ level: 0, sealed: false, year, serial: nextSerial(state.files.map((x) => x.number), year) }), folder: RNBO_FOLDER.id, name, size: f.size, type: 'text/csv', clearance: 0, sealed: false, downgrade: null, owner: me.id, ownerName: me.name, at: new Date().toISOString(), stored: true, backend: backend.kind, role: RNBO_ROLE, entries: entries.length, ...put };
      if (backend.index) await backend.index.addFile(meta);
      dispatch({ type: 'file/add', file: meta });
      toast(`Список РНБО оновлено: ${entries.length} юридичних осіб`);
      onUploaded(meta);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="rnbo">
      <div>
        <b>Державний реєстр санкцій (РНБО)</b>
        <div className="vx-hint">
          {file ? `Список від ${fmtDate(file.at, false)} · ${file.entries ?? '—'} юридичних осіб. ` : 'Список ще не завантажено. '}
          Реєстр пускає лише браузер: відкрийте <a className="ws-link" href="https://drs.nsdc.gov.ua/subjects" target="_blank" rel="noopener noreferrer">drs.nsdc.gov.ua</a> → «Юридичні особи» → завантажити CSV, і додайте файл сюди. Оновлюйте раз на тиждень або після нових указів.
        </div>
      </div>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
      <button className="vx-btn vx-btn--sm" disabled={busy || backend?.writable === false} onClick={() => input.current.click()}>{busy ? <Loader size={16} /> : <><Icon name="upload" /> {file ? 'Оновити список' : 'Додати список РНБО'}</>}</button>
    </div>
  );
}

const openRecord = (go, r) => go('divisions', r.div, `${r.col}:${r.id}`);
const terms = (w) => String(w.terms || '').split(/\n/).filter((l) => l.trim()).length;

// The intake record a finding becomes — the same shape the daily job writes (scripts/lib/watch.mjs toIntake).
const toIntake = (f, sources) => ({
  id: `w-auto-${f.fingerprint.slice(0, 20)}`, div: 'int', col: 'intake', stage: 'Надійшло',
  title: f.title.slice(0, 300), source: sources[f.source].id, credibility: f.credibility, received: f.received,
  summary: f.summary, url: f.url, watchlist: f.watchlist, fingerprint: f.fingerprint, origin: 'auto', clearance: f.clearance,
});
const toSource = (s) => ({ ...s, div: 'int', col: 'sources', state: 'Активне', clearance: 0 });

const STEPS = [
  ['Створіть список', 'Що шукати: «Медіа» — згадки в новинах; «Контрагенти й санкції» — компанії в санкційних списках США й ЄС.'],
  ['Запустіть', 'Кнопка «Запустити зараз» або щодня автоматично о 07:40 (Kyiv).'],
  ['Опрацюйте знахідки', 'Вони з’являються в «Опрацюванні» на етапі «Надійшло» — з посиланням, датою й оцінкою. Перетягніть далі або в архів.'],
];

// Step-by-step start: a list in one form, or all suppliers of Logistics in one click — created and run at once.
function QuickStart({ lists, busy, onCreate }) {
  const { state, me, dispatch, toast } = useStore();
  const [open, setOpen] = useState(!lists.length);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('Контрагенти й санкції');
  const [terms, setTerms] = useState('');
  const suppliers = (state.records || []).filter((r) => r.div === 'ops' && r.col === 'suppliers' && r.clearance <= me.clearance && r.name);
  const create = (w) => {
    const rec = { id: `w-list-${Date.now().toString(36)}`, div: 'int', col: 'watchlists', state: 'Активний', owner: me.id, clearance: Math.min(1, me.clearance), ...w };
    dispatch({ type: 'record/add', record: rec, where: 'Розвідка · Списки спостереження', label: w.name });
    toast(`Створено список «${w.name}» — запускаю`);
    setName(''); setTerms(''); setOpen(false);
    onCreate(rec);
  };
  const ok = name.trim() && terms.trim();
  return (
    <Panel title="Як запустити" action={lists.length > 0 && <button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => setOpen(!open)}>{open ? 'Згорнути' : 'Новий список'}</button>}>
      <div className="stack">
        <ol className="watch-steps">
          {STEPS.map(([t, d], i) => <li key={t} className={i === 0 && !lists.length ? 'is-current' : ''}><b>{t}</b><span className="vx-hint">{d}</span></li>)}
        </ol>
        {open && <>
          {suppliers.length > 0 && (
            <button className="vx-btn" disabled={busy} onClick={() => create({ name: 'Постачальники Логістики', kind: 'Контрагенти й санкції', terms: suppliers.map((s) => s.name).join('\n') })}>
              <Icon name="truck" /> Перевірити всіх постачальників ({suppliers.length}) за санкційними списками
            </button>
          )}
          <div className="form-grid">
            <div className="vx-field">
              <label className="vx-label" htmlFor="qs-name">Назва списку</label>
              <input id="qs-name" className="vx-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр. «Конкуренти» або «Зернові термінали»" />
            </div>
            <div className="vx-field">
              <span className="vx-label">Що шукати</span>
              <div className="segmented" role="group" aria-label="Що шукати">
                {['Контрагенти й санкції', 'Медіа'].map((k) => <button type="button" key={k} className={kind === k ? 'is-active' : ''} onClick={() => setKind(k)}>{k}</button>)}
              </div>
            </div>
          </div>
          <div className="vx-field">
            <label className="vx-label" htmlFor="qs-terms">{kind === 'Медіа' ? 'Що шукати в новинах — по одному на рядок' : 'Компанії — по одній на рядок, код ЄДРПОУ через «;» (необов’язково)'}</label>
            <textarea id="qs-terms" className="vx-input ws-textarea" rows={4} value={terms} onChange={(e) => setTerms(e.target.value)}
              placeholder={kind === 'Медіа' ? 'Укрзалізниця\nпорт Одеса\nзерновий коридор' : 'ТОВ Ромашка; 12345678\nАТ Степове Зерно'} />
          </div>
          <button className="vx-btn vx-btn--primary" disabled={!ok || busy} onClick={() => create({ name: name.trim(), kind, terms: terms.trim() })}><Icon name="refresh" /> Створити й запустити</button>
        </>}
      </div>
    </Panel>
  );
}

export function WatchView({ access, go }) {
  const { state, me, dispatch, toast, backend } = useStore();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const records = state.records || [];
  const lists = records.filter((r) => r.div === 'int' && r.col === 'watchlists' && r.clearance <= me.clearance);
  const activeLists = lists.filter((w) => (w.state || 'Активний') === 'Активний');
  const found = records.filter((r) => r.col === 'intake' && r.origin === 'auto' && r.clearance <= me.clearance)
    .sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 40);
  const listName = (id) => lists.find((w) => w.id === id)?.name || '—';

  const run = async (extra = [], rnboOverride = null) => {
    const active = [...activeLists, ...extra];
    setBusy(true); setLast(null);
    try {
      // The RNBO list kept in the Vault is matched here, in the browser; the rest on the server.
      const rnboFile = rnboOverride || latestRnbo(state.files);
      const local = await rnboFindings(backend, rnboFile, active).catch((e) => { toast(`РНБО: ${e.message}`, 'error'); return []; });
      const res = await fetch(new URL('api/watch', document.baseURI), {
        method: 'POST',
        headers: supabaseOn ? await authHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlists: active.map(({ id, name, kind, terms: t, feeds, clearance }) => ({ id, name, kind, terms: t, feeds, clearance })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && !local.length) throw new Error(body.message || (res.status === 404 ? 'Серверна функція недоступна (працює лише на Vercel)' : `HTTP ${res.status}`));
      if (!res.ok) { body.findings = []; body.errors = [{ source: 'сервер', message: body.message || `HTTP ${res.status}` }]; }
      body.sources = { ...(body.sources || {}), rnbo: RNBO_SOURCE };
      // The server's RNBO attempt is replaced by the local list when there is one.
      if (rnboFile) body.errors = (body.errors || []).filter((e) => e.source !== 'rnbo');
      const seenFp = new Set(body.findings.map((f) => f.fingerprint));
      body.findings = [...body.findings, ...local.filter((f) => !seenFp.has(f.fingerprint))];
      const records = state.records || [];
      const have = new Set(records.filter((r) => r.col === 'intake' && r.fingerprint).map((r) => r.fingerprint));
      const fresh = body.findings.filter((f) => !have.has(f.fingerprint));
      const needSources = [...new Set(fresh.map((f) => f.source))].map((k) => body.sources[k]).filter((s) => !records.some((r) => r.id === s.id));
      const now = new Date().toISOString();
      const patches = active.map((w) => ({ id: w.id, patch: { lastRun: now, lastFound: fresh.filter((f) => f.watchlist === w.id).length } }));
      dispatch({
        type: 'record/bulk', where: 'Розвідка · Конвеєр', label: `запуск: ${active.length} списків, нових надходжень ${fresh.length}`,
        records: [...needSources.map(toSource), ...fresh.map((f) => toIntake(f, body.sources))], patches,
      });
      setLast({ total: body.findings.length, fresh: fresh.length, errors: body.errors || [] });
      toast(fresh.length ? `Нових надходжень: ${fresh.length}` : 'Нового не знайдено');
    } catch (e) {
      setLast({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {access.canEdit && <QuickStart lists={lists} busy={busy} onCreate={(w) => run([w])} />}
      <Panel title="Конвеєр спостереження" action={access.canEdit && (
        <button className="vx-btn vx-btn--primary" onClick={() => run()} disabled={busy || !activeLists.length}>
          {busy ? <Loader size={18} label="Пошук" /> : <><Icon name="refresh" /> Запустити зараз</>}
        </button>
      )}>
        <div className="stack">
          <div className="vx-hint">
            Щодня зранку конвеєр перевіряє відкриті джерела за активними списками спостереження й додає знахідки в «Опрацювання» на етап «Надійшло» — з посиланням, датою, джерелом і попередньою оцінкою достовірності. Аналітик підтверджує, відкидає або бере в роботу.
          </div>
          <ul className="watch-sources">
            <li><b>Медіа</b> — GDELT (світовий індекс новин, 65+ мов) і ваші RSS-стрічки.</li>
            <li><b>Контрагенти й санкції</b> — санкційні списки РНБО (України), OFAC (США) і ЄС: збіг за назвою (з транслітерацією) або за кодом.</li>
          </ul>
          {access.canEdit && <RnboList onUploaded={(f) => activeLists.length && run([], f)} />}
          {last && (last.error ? <div className="vx-error">{last.error}</div> : (
            <div className="stack">
              <Status kind="ok">Знайдено {last.total}, нових {last.fresh}</Status>
              {last.errors.map((e, i) => <Status key={i} kind="warn">{e.source}: {e.message}</Status>)}
            </div>
          ))}

        </div>
      </Panel>

      <Panel title={`Списки · ${lists.length}`} bodyClass="vx-table-wrap" action={<button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => go('divisions', 'int', 'watchlists')}>Керувати <Icon name="chevron" /></button>}>
        <table className="vx-table">
          <thead><tr><th>Список</th><th>Що шукати</th><th>Об’єктів</th><th>Стан</th><th>Останній запуск</th><th>Нових</th><th>Гриф</th></tr></thead>
          <tbody>
            {lists.map((w) => (
              <tr key={w.id} className="is-clickable" onClick={() => openRecord(go, w)}>
                <td>{w.name}</td><td>{w.kind}</td><td className="vx-num">{terms(w)}</td><td>{w.state || 'Активний'}</td>
                <td className="vx-hint">{w.lastRun ? fmtAgo(w.lastRun) : 'ще не запускався'}</td>
                <td className="vx-num">{w.lastFound ?? '—'}</td>
                <td><ClassBadge level={w.clearance} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lists.length && <div className="vx-empty"><Icon name="eye" /><div>Списків спостереження ще немає</div></div>}
      </Panel>

      <Panel title="Останні знахідки" bodyClass="list">
        {found.map((r) => (
          <button key={r.id} className="list__row list__row--btn list__row--top" onClick={() => openRecord(go, r)}>
            <Icon name={r.source === 'w-src-ofac' || r.source === 'w-src-eu' ? 'shield' : 'layers'} size={16} />
            <span className="list__text">
              <span>{r.title}</span>
              <span className="vx-hint">{listName(r.watchlist)} · {r.stage} · {fmtDate(r.received, false)}{r.url ? ` · ${(() => { try { return new URL(r.url).host; } catch { return ''; } })()}` : ''}</span>
            </span>
          </button>
        ))}
        {!found.length && <div className="list__row vx-hint">Знахідок ще немає.</div>}
      </Panel>

      <div className="vx-hint">
        Лише відкриті й офіційні джерела. Об’єкти спостереження — компанії, ринки, теми; не приватні особи. Список спостереження сам є UMBRA: він показує інтереси компанії.
        Збіг назви з санкційним списком — привід перевірити, а не висновок.
      </div>
    </div>
  );
}
