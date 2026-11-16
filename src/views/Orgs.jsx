// Intelligence · «Організації»: the reference list of leading Ukrainian companies.
import { useStore, fmtDate } from '../store.jsx';
import { Panel, Status } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { ORGS_UA, ORGS_CHECKED, ORG_SECTORS, aboutOf, factsOf } from '../data/orgs-ua.js';

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

/** Shown above the register: the reference list and bulk actions. */
export function OrgDirectory({ go }) {
  const { state, me, dispatch, toast } = useStore();
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
    <Panel title="Довідник: 200 провідних компаній і підприємств України" action={<span className="vx-hint">коди звірено {fmtDate(ORGS_CHECKED, false)}</span>}>
      <div className="stack">
        <div className="vx-hint">
          {ORG_SECTORS.length} галузей: код ЄДРПОУ, сайт, рік заснування, власники й посилання на реєстр. Дані з відкритих джерел — звіряйте з реєстром.
        </div>
        <div className="toolbar">
          {missing.length > 0 && <button className="vx-btn vx-btn--primary" onClick={load}><Icon name="download" /> Завантажити в реєстр ({missing.length})</button>}
          {missing.length === 0 && <Status kind="ok">Довідник завантажено</Status>}
          {backfill.length > 0 && <button className="vx-btn" onClick={fillRefs}><Icon name="file" /> Доповнити описи, сайти, роки, власників ({backfill.length})</button>}
          <button className="vx-btn vx-btn--ghost" onClick={() => go('divisions', 'int', 'companies')}><Icon name="divisions" /> Картки компаній</button>
        </div>
      </div>
    </Panel>
  );
}

/** In an organisation's card: the company card and the registry link. */
export function OrgExtras({ record, go }) {
  return (
    <div className="stack">
      {go && <button className="vx-btn vx-btn--sm" onClick={() => go('divisions', 'int', `companies:${record.id}`)}><Icon name="divisions" /> Картка компанії: логотип, фото, документи</button>}
      {record.code && <div className="vx-hint">Перевірити зміни: <a className="ws-link" href={`https://opendatabot.ua/c/${record.code}`} target="_blank" rel="noopener noreferrer">Opendatabot</a> · <a className="ws-link" href={`https://clarity-project.info/edr/${record.code}`} target="_blank" rel="noopener noreferrer">Clarity Project</a> · <a className="ws-link" href={`https://prozorro.gov.ua/search/tender?buyer=${record.code}`} target="_blank" rel="noopener noreferrer">Prozorro</a></div>}
    </div>
  );
}
