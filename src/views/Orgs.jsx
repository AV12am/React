// Intelligence · «Організації»: the reference list of leading Ukrainian companies, and putting organisations on watch.
import { useStore, fmtDate } from '../store.jsx';
import { Panel, Status } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { ORGS_UA, ORGS_CHECKED, aboutOf, factsOf } from '../data/orgs-ua.js';

// The two standing lists organisations are watched in (created on first use).
const LISTS = {
  sanctions: { id: 'w-list-orgs-sanctions', name: 'Організації — санкції', kind: 'Контрагенти й санкції', line: (o) => (o.code ? `${o.name}; ${o.code}` : o.name) },
  media: { id: 'w-list-orgs-media', name: 'Організації — медіа', kind: 'Медіа', line: (o) => o.name },
};

const statusOf = (note) => (/банкрут/i.test(note) ? 'Банкрутство' : /припинен/i.test(note) ? 'У стані припинення' : 'Діє');
const toRecord = (o) => ({
  id: `org-${o.code}`, div: 'int', col: 'orgs', clearance: 0,
  name: o.name, legal: o.legal, code: o.code, sector: o.sector, city: o.city === '—' ? '' : o.city,
  status: statusOf(o.note), relation: 'Немає', notes: o.note, source: o.source, checked: ORGS_CHECKED, about: aboutOf(o.code), ...factsOf(o.code),
});
export const orgToRecord = toRecord;

/** Patches that fill still-empty reference fields (about, website, founded, owners) of directory records — never overwriting edits. */
export const refPatches = (records) => records.filter((r) => r.col === 'orgs' && r.id.startsWith('org-')).map((r) => {
  const ref = { about: aboutOf(r.code), ...factsOf(r.code) };
  const patch = Object.fromEntries(Object.entries(ref).filter(([k, v]) => v !== '' && (r[k] === undefined || r[k] === null || r[k] === '')));
  return { id: r.id, patch };
}).filter((p) => Object.keys(p.patch).length);

/** Adds organisations to a standing watchlist (sanctions or media); returns how many were new there. */
export function useWatchOrgs() {
  const { state, me, dispatch, toast } = useStore();
  return (orgs, which) => {
    const L = LISTS[which];
    const list = (state.records || []).find((r) => r.id === L.id);
    const have = new Set(String(list?.terms || '').split(/\n/).map((l) => l.trim()).filter(Boolean));
    const add = orgs.map(L.line).filter((l) => !have.has(l));
    if (!add.length) { toast('Уже в спостереженні'); return 0; }
    const terms = [...have, ...add].join('\n');
    if (list) dispatch({ type: 'record/update', id: L.id, patch: { terms }, where: 'Розвідка · Списки спостереження', label: L.name, note: `додано ${add.length}` });
    else dispatch({ type: 'record/add', record: { id: L.id, div: 'int', col: 'watchlists', name: L.name, kind: L.kind, terms, state: 'Активний', owner: me.id, clearance: Math.min(1, me.clearance) }, where: 'Розвідка · Списки спостереження', label: L.name });
    toast(`Додано в «${L.name}»: ${add.length}`);
    return add.length;
  };
}

/** Shown above the register: the reference list and bulk actions. */
export function OrgDirectory({ go }) {
  const { state, me, dispatch, toast } = useStore();
  const watch = useWatchOrgs();
  const records = state.records || [];
  const inRegister = records.filter((r) => r.col === 'orgs' && r.clearance <= me.clearance);
  const missing = ORGS_UA.filter((o) => !records.some((r) => r.id === `org-${o.code}`));
  const load = () => {
    dispatch({ type: 'record/bulk', records: missing.map(toRecord), where: 'Розвідка · Організації', label: `завантажено довідник: ${missing.length} компаній` });
    toast(`Додано ${missing.length} компаній`);
  };
  // Directory records loaded earlier: fill the reference fields that are still empty (never overwrite edits).
  const backfill = refPatches(inRegister);
  const fillRefs = () => {
    dispatch({ type: 'record/bulk', records: [], patches: backfill, where: 'Розвідка · Організації', label: `доповнено довідкові дані: ${backfill.length}` });
    toast(`Доповнено: ${backfill.length}`);
  };
  return (
    <Panel title="Довідник: 100 провідних компаній України" action={<span className="vx-hint">коди звірено {fmtDate(ORGS_CHECKED, false)}</span>}>
      <div className="stack">
        <div className="vx-hint">
          12 галузей: код ЄДРПОУ, сайт, рік заснування, власники й посилання на реєстр. Дані з відкритих джерел — звіряйте з реєстром.
        </div>
        <div className="toolbar">
          {missing.length > 0 && <button className="vx-btn vx-btn--primary" onClick={load}><Icon name="download" /> Завантажити в реєстр ({missing.length})</button>}
          {missing.length === 0 && <Status kind="ok">Довідник завантажено</Status>}
          {backfill.length > 0 && <button className="vx-btn" onClick={fillRefs}><Icon name="file" /> Доповнити описи, сайти, роки, власників ({backfill.length})</button>}
          <button className="vx-btn vx-btn--ghost" onClick={() => go('divisions', 'int', 'companies')}><Icon name="divisions" /> Картки компаній</button>
          {inRegister.length > 0 && <>
            <button className="vx-btn" onClick={() => watch(inRegister, 'sanctions')}><Icon name="shield" /> Усі — на санкційне спостереження</button>
            <button className="vx-btn" onClick={() => watch(inRegister, 'media')}><Icon name="layers" /> Усі — на медіамоніторинг</button>
            <button className="vx-btn vx-btn--ghost" onClick={() => go('divisions', 'int', 'watch')}>Конвеєр <Icon name="chevron" /></button>
          </>}
        </div>
      </div>
    </Panel>
  );
}

/** In an organisation's card: watch buttons and the registry link. */
export function OrgExtras({ record, go }) {
  const watch = useWatchOrgs();
  const { state } = useStore();
  const listed = (id, line) => String((state.records || []).find((r) => r.id === id)?.terms || '').split(/\n/).map((l) => l.trim()).includes(line);
  const inSanctions = listed(LISTS.sanctions.id, LISTS.sanctions.line(record));
  const inMedia = listed(LISTS.media.id, LISTS.media.line(record));
  return (
    <div className="stack">
      {go && <button className="vx-btn vx-btn--sm" onClick={() => go('divisions', 'int', `companies:${record.id}`)}><Icon name="divisions" /> Картка компанії: логотип, фото, документи</button>}
      <div className="vx-eyebrow">Спостереження</div>
      <div className="toolbar">
        {inSanctions ? <Status kind="ok">У санкційному спостереженні</Status>
          : <button className="vx-btn vx-btn--sm" onClick={() => watch([record], 'sanctions')}><Icon name="shield" /> Стежити: санкції</button>}
        {inMedia ? <Status kind="ok">У медіамоніторингу</Status>
          : <button className="vx-btn vx-btn--sm" onClick={() => watch([record], 'media')}><Icon name="layers" /> Стежити: медіа</button>}
      </div>
      {record.code && <div className="vx-hint">Перевірити зміни: <a className="ws-link" href={`https://opendatabot.ua/c/${record.code}`} target="_blank" rel="noopener noreferrer">Opendatabot</a> · <a className="ws-link" href={`https://clarity-project.info/edr/${record.code}`} target="_blank" rel="noopener noreferrer">Clarity Project</a> · <a className="ws-link" href={`https://prozorro.gov.ua/search/tender?buyer=${record.code}`} target="_blank" rel="noopener noreferrer">Prozorro</a></div>}
    </div>
  );
}
