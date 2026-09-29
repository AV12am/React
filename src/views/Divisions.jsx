import { useStore } from '../store.jsx';
import { Status } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { DIVISIONS } from '../data/seed.js';
import { WORKSPACES, registersOf } from '../data/workspaces.js';
import { Workspace } from './Workspace.jsx';

// The company's divisions; each card opens that division's own workspace.
export function Divisions({ focus, tab, go }) {
  const { state, me, userById } = useStore();
  if (focus && DIVISIONS.some((d) => d.id === focus)) return <Workspace divId={focus} tab={tab} go={go} />;

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">Структура компанії</div>
          <h1 className="vx-h1">Напрями</h1>
        </div>
      </header>

      <div className="grid grid--3">
        {DIVISIONS.map((d) => {
          const members = state.users.filter((u) => u.division === d.id);
          const lead = userById(d.lead);
          const records = (state.records || []).filter((r) => r.div === d.id).length;
          return (
            <button key={d.id} className={`vx-panel division ${me.division === d.id ? 'is-mine' : ''}`} onClick={() => go('divisions', d.id)}>
              <div className="division__top">
                <span className="division__icon"><Icon name={d.icon} /></span>
                <span className="vx-tag">{me.division === d.id ? 'Ваш напрям' : d.code}</span>
              </div>
              <h2 className="vx-h2">{d.name}</h2>
              <p className="vx-muted division__about">{WORKSPACES[d.id]?.tagline || d.about}</p>
              <div className="division__regs vx-hint">{registersOf(d.id).map((r) => r.name).join(' · ')}</div>
              <div className="division__meta">
                <span>{lead?.name ?? <span className="vx-hint">Керівника не призначено</span>}</span>
                <span className="vx-hint vx-num">{members.length} осіб · {records} записів</span>
              </div>
              <Status kind={d.status}>{d.status === 'ok' ? 'Працює штатно' : 'Є ризики за строками'}</Status>
            </button>
          );
        })}
      </div>
    </div>
  );
}
