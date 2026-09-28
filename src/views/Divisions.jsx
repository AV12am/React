import { useStore, fmtAgo } from '../store.jsx';
import { Status, Avatar, Drawer, ClassBadge } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { DIVISIONS, ROLES } from '../data/seed.js';

export function Divisions({ focus, setFocus, go }) {
  const { state, userById } = useStore();
  const open = DIVISIONS.find((d) => d.id === focus);

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
          return (
            <button key={d.id} className="vx-panel division" onClick={() => setFocus(d.id)}>
              <div className="division__top">
                <span className="division__icon"><Icon name={d.icon} /></span>
                <span className="vx-tag">{d.code}</span>
              </div>
              <h2 className="vx-h2">{d.name}</h2>
              <p className="vx-muted division__about">{d.about}</p>
              <div className="division__meta">
                <span>{lead?.name ?? <span className="vx-hint">Керівника не призначено</span>}</span>
                <span className="vx-hint vx-num">{members.length} осіб · {d.projects.length} проєкти</span>
              </div>
              <Status kind={d.status}>{d.status === 'ok' ? 'Працює штатно' : 'Є ризики за строками'}</Status>
            </button>
          );
        })}
      </div>

      {open && (
        <Drawer title={open.name} onClose={() => setFocus(null)}
          footer={<button className="vx-btn" onClick={() => go('vault')}><Icon name="vault" /> Сховище напряму</button>}>
          <p className="vx-muted">{open.about}</p>
          <div>
            <div className="vx-eyebrow">Проєкти</div>
            {open.projects.length ? <ul className="plain-list">{open.projects.map((p) => <li key={p}>{p}</li>)}</ul> : <p className="vx-hint">Проєктів ще немає.</p>}
          </div>
          <div>
            <div className="vx-eyebrow">Папки</div>
            <div className="list">
              {state.folders.filter((f) => f.division === open.id).map((f) => (
                <div className="list__row" key={f.id}>
                  <span className="list__lead"><Icon name="folder" size={16} /> {f.name}</span>
                  <ClassBadge level={f.clearance} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="vx-eyebrow">Люди</div>
            <div className="list">
              {state.users.filter((u) => u.division === open.id).map((u) => (
                <div className="list__row list__row--top" key={u.id}>
                  <Avatar name={u.name} />
                  <div className="list__text">
                    <div>{u.name} {u.id === open.lead && <span className="vx-tag">керівник</span>}</div>
                    <div className="vx-hint">{u.title} · {ROLES.find((r) => r.id === u.role).name} · {fmtAgo(u.lastSeen)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
