import { useStore, fmtBytes, fmtAgo } from '../store.jsx';
import { Panel, StatTile, Status, BarList, Trend, Avatar } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { STORAGE_QUOTA, DIVISIONS } from '../data/seed.js';

const TYPE_LABEL = { auth: 'Вхід', access: 'Доступ', vault: 'Сховище', map: 'Карта', work: 'Напрями', security: 'Безпека', system: 'Система' };

const WEEK = 7 * 86400000;

// Everything on this page is derived from the platform's own records — nothing is invented.
export function Dashboard({ go }) {
  const { state, me, userById, backend } = useStore();
  const now = Date.now();
  const pending = state.requests.filter((r) => r.status === 'pending').length;
  const active = state.users.filter((u) => u.status === 'active');
  const mfa = active.length ? Math.round((active.filter((u) => u.mfa).length / active.length) * 100) : 0;
  const used = state.files.reduce((s, f) => s + f.size, 0);
  const quota = backend?.quota || STORAGE_QUOTA;
  const since = (iso, weeks = 1) => iso && now - new Date(iso).getTime() < weeks * WEEK;
  const newFiles = state.files.filter((f) => since(f.at)).length;
  const events = state.audit.filter((e) => since(e.at)).length;

  // Activity per week from the audit log, 12 weeks, oldest first.
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const hi = now - (11 - i) * WEEK;
    return state.audit.filter((e) => { const t = new Date(e.at).getTime(); return t <= hi && t > hi - WEEK; }).length;
  });
  const weeks = weekly.map((_, i) => (i === 11 ? 'Цей' : `Т-${11 - i}`));
  const byDivision = DIVISIONS.map((d) => ({
    id: d.code,
    value: state.files.filter((f) => state.folders.find((x) => x.id === f.folder)?.division === d.id).length,
  })).sort((x, y) => y.value - x.value);
  const shared = state.files.filter((f) => !state.folders.find((x) => x.id === f.folder)?.division).length;

  const checks = [
    { name: 'Сховище файлів', status: backend ? 'ok' : 'idle', note: backend ? backend.label : 'Підключення…' },
    { name: 'З’єднання', status: location.protocol === 'https:' ? 'ok' : 'warn', note: location.protocol === 'https:' ? 'HTTPS' : 'Без шифрування — увімкніть HTTPS' },
    { name: 'Мережа', status: navigator.onLine ? 'ok' : 'warn', note: navigator.onLine ? 'Онлайн' : 'Офлайн' },
  ];

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">Зведення на {new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <h1 className="vx-h1">Оперативна обстановка</h1>
        </div>
        <Status kind={checks.every((c) => c.status === 'ok') ? 'ok' : 'warn'}>
          {checks.filter((c) => c.status === 'ok').length} з {checks.length} перевірок у нормі
        </Status>
      </header>

      <div className="grid grid--stats">
        <StatTile label="Нові файли · тиждень" value={newFiles} delta={`усього ${state.files.length}`} />
        <StatTile label="Дії в журналі · тиждень" value={events} delta={`усього записів ${state.audit.length}`} sensitive={false} />
        <button className="tile-link" onClick={() => go('access')} disabled={!me || !['admin', 'lead', 'engineer'].includes(me.role)}>
          <StatTile label="Запити на доступ" value={pending} sensitive={false}
            delta={pending ? <><b>Очікують рішення</b> · відкрити</> : 'Черга порожня'} />
        </button>
        <StatTile label="Сховище" value={fmtBytes(used)} unit={`/ ${fmtBytes(quota)}`}
          meter={(used / quota) * 100} delta={`${backend ? backend.label : '…'} · ${state.files.length} файлів у ${state.folders.length} папках`} />
        <StatTile label="Покриття MFA" value={mfa} unit="%" meter={mfa} meterBrass={mfa < 100}
          delta={`${active.filter((u) => !u.mfa).length} активних без MFA`} sensitive={false} />
        <StatTile label="Активні користувачі" value={active.length} delta={`${state.users.filter((u) => u.status === 'invited').length} запрошено`} sensitive={false} />
      </div>

      <div className="grid grid--2">
        <Panel title="Файли за напрямами" action={<span className="vx-hint">усього</span>}>
          {state.files.length ? <>
            <BarList data={byDivision} unit="файлів" highlight={byDivision[0].value ? byDivision[0].id : null} />
            <p className="vx-hint chart-note">Ще {shared} у спільних папках.</p>
          </> : <div className="vx-empty"><Icon name="vault" /><div>Файлів ще немає</div><div className="vx-hint">Завантажте перші документи в «Сховище».</div></div>}
        </Panel>
        <Panel title="Активність платформи" action={<span className="vx-hint">12 тижнів</span>}>
          <Trend data={weekly} labels={weeks} unit="дій" />
          <p className="vx-hint chart-note">За журналом аудиту: {weekly[11]} дій цього тижня.</p>
        </Panel>
      </div>

      <div className="grid grid--3">
        <Panel title="Стан платформи" bodyClass="list">
          {checks.map((s) => (
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
                <span className="vx-hint vx-num">{people} осіб · {files} файлів</span>
              </button>
            );
          })}
        </Panel>

        <Panel title="Остання активність" action={me.role === 'admin' || me.role === 'lead' || me.role === 'engineer'
          ? <button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => go('audit')}>Журнал <Icon name="chevron" /></button> : null}
          bodyClass="list">
          {!state.audit.length && <div className="list__row vx-hint">Подій ще немає.</div>}
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
