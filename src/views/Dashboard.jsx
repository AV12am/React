import { useStore, fmtBytes, fmtAgo } from '../store.jsx';
import { Panel, StatTile, Status, BarList, Trend, Avatar } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { SOURCES, WEEKLY, SYSTEMS, STORAGE_QUOTA, DIVISIONS } from '../data/seed.js';

const TYPE_LABEL = { auth: 'Вхід', access: 'Доступ', vault: 'Сховище', security: 'Безпека', system: 'Система' };

export function Dashboard({ go }) {
  const { state, me, userById } = useStore();
  const pending = state.requests.filter((r) => r.status === 'pending').length;
  const active = state.users.filter((u) => u.status === 'active');
  const mfa = Math.round((active.filter((u) => u.mfa).length / active.length) * 100);
  const used = state.files.reduce((s, f) => s + f.size, 0);
  const weeks = WEEKLY.map((_, i) => `Т-${WEEKLY.length - 1 - i}`).map((l, i, a) => (i === a.length - 1 ? 'Цей' : l));
  const total = SOURCES.reduce((s, x) => s + x.value, 0);
  const hour = new Date().getHours();
  const greet = hour < 6 ? 'Доброї ночі' : hour < 12 ? 'Доброго ранку' : hour < 18 ? 'Добрий день' : 'Добрий вечір';

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">{new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1 className="vx-h1">{greet}, {me.name.split(' ')[0]}</h1>
        </div>
        <Status kind={SYSTEMS.some((s) => s.status !== 'ok') ? 'warn' : 'ok'}>
          {SYSTEMS.filter((s) => s.status === 'ok').length} з {SYSTEMS.length} систем у нормі
        </Status>
      </header>

      <div className="grid grid--stats">
        <StatTile label="Звіти з джерел · тиждень" value={total.toLocaleString('uk-UA')}
          delta={<><Icon name="arrowUp" size={14} /><b>+12%</b> до минулого тижня</>} />
        <StatTile label="Оцінки завершено" value={WEEKLY[WEEKLY.length - 1]}
          delta={<><Icon name="arrowUp" size={14} /><b>+7</b> за тиждень</>} />
        <button className="tile-link" onClick={() => go('access')} disabled={!me || !['admin', 'lead', 'engineer'].includes(me.role)}>
          <StatTile label="Запити на доступ" value={pending} sensitive={false}
            delta={pending ? <><b>Очікують рішення</b> · відкрити</> : 'Черга порожня'} />
        </button>
        <StatTile label="Сховище" value={fmtBytes(used)} unit={`/ ${fmtBytes(STORAGE_QUOTA)}`}
          meter={(used / STORAGE_QUOTA) * 100} delta={`${state.files.length} файлів у ${state.folders.length} папках`} />
        <StatTile label="Покриття MFA" value={mfa} unit="%" meter={mfa} meterBrass={mfa < 100}
          delta={`${active.filter((u) => !u.mfa).length} активних без MFA`} sensitive={false} />
        <StatTile label="Доступність · 30 днів" value="99,98" unit="%" delta="1 планове вікно обслуговування" sensitive={false} />
      </div>

      <div className="grid grid--2">
        <Panel title="Звіти за класами джерел" action={<span className="vx-hint">цей тиждень</span>}>
          <BarList data={SOURCES} unit="звітів" highlight="OSINT" />
          <p className="vx-hint chart-note">Латунню позначено найбільше джерело. 8 класів — 8 пелюсток знака.</p>
        </Panel>
        <Panel title="Завершені оцінки" action={<span className="vx-hint">12 тижнів</span>}>
          <Trend data={WEEKLY} labels={weeks} unit="оцінок" />
          <p className="vx-hint chart-note">Середнє за квартал — {Math.round(WEEKLY.slice(-12).reduce((a, b) => a + b) / 12)} на тиждень.</p>
        </Panel>
      </div>

      <div className="grid grid--3">
        <Panel title="Стан систем" bodyClass="list">
          {SYSTEMS.map((s) => (
            <div className="list__row" key={s.name}>
              <Status kind={s.status}>{s.name}</Status>
              <span className="vx-hint">{s.note}</span>
            </div>
          ))}
        </Panel>

        <Panel title="Навантаження напрямів" bodyClass="list">
          {DIVISIONS.map((d) => {
            const people = state.users.filter((u) => u.division === d.id && u.status === 'active').length;
            const files = state.files.filter((f) => state.folders.find((x) => x.id === f.folder)?.division === d.id).length;
            return (
              <button className="list__row list__row--btn" key={d.id} onClick={() => go('divisions', d.id)}>
                <span className="list__lead"><Icon name={d.icon} size={16} /> {d.name}</span>
                <span className="vx-hint vx-num">{people} осіб · {d.projects.length} проєкти · {files} файлів</span>
              </button>
            );
          })}
        </Panel>

        <Panel title="Остання активність" action={me.role === 'admin' || me.role === 'lead' || me.role === 'engineer'
          ? <button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => go('audit')}>Журнал <Icon name="chevron" /></button> : null}
          bodyClass="list">
          {state.audit.slice(0, 6).map((e) => {
            const u = userById(e.actor);
            return (
              <div className="list__row list__row--top" key={e.id}>
                {u ? <Avatar name={u.name} /> : <span className="vx-avatar"><Icon name="cpu" size={14} /></span>}
                <div className="list__text">
                  <div>{e.text}</div>
                  <div className="vx-hint">{u?.name || 'Система'} · {TYPE_LABEL[e.type]} · {fmtAgo(e.at)}</div>
                </div>
              </div>
            );
          })}
        </Panel>
      </div>
    </div>
  );
}
