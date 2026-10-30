import { useStore } from '../store.jsx';
import { Status } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { VISIBLE_DIVISIONS } from '../data/seed.js';
import { registersOf } from '../data/workspaces.js';
import { Workspace } from './Workspace.jsx';

// The company's divisions; each card opens that division's own workspace.
export function Divisions({ focus, tab, go }) {
  const { state, userById } = useStore();
  if (focus && VISIBLE_DIVISIONS.some((d) => d.id === focus)) return <Workspace divId={focus} tab={tab} go={go} />;

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">Структура компанії</div>
          <h1 className="vx-h1">Напрями</h1>
        </div>
      </header>

      <div className="grid grid--3">
        {VISIBLE_DIVISIONS.map((d) => {
          const lead = userById(d.lead);
          const records = (state.records || []).filter((r) => r.div === d.id).length;
          return (
            <button key={d.id} className="vx-panel division" onClick={() => go('divisions', d.id)}>
              <div className="division__top">
                <span className="division__icon"><Icon name={d.icon} /></span>
              </div>
              <h2 className="vx-h2">{d.name}</h2>
              <div className="division__regs vx-hint">{registersOf(d.id).map((r) => r.name).join(' · ')}</div>
              <div className="division__meta">
                <span>{lead?.name ?? <span className="vx-hint">Керівника не призначено</span>}</span>
                <span className="vx-hint vx-num">{records} записів</span>
              </div>
              <Status kind={d.status}>{d.status === 'ok' ? 'Працює штатно' : 'Є ризики за строками'}</Status>
            </button>
          );
        })}
      </div>
    </div>
  );
}
