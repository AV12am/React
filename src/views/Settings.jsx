import { useState } from 'react';
import { useStore, fmtDate } from '../store.jsx';
import { Panel, Avatar, ClassBadge, Switch, Status } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { ROLES, DIVISIONS, CLEARANCE, MODULES } from '../data/seed.js';
import { clearBlobs } from '../vaultdb.js';

const LEVEL = ['Немає', 'Перегляд', 'Редагування', 'Керування'];

export function Settings() {
  const { state, me, perms, dispatch, toast } = useStore();
  const s = state.settings;
  const set = (patch) => dispatch({ type: 'settings', patch });
  const [reason, setReason] = useState('');
  const hasPending = state.requests.some((r) => r.user === me.id && r.status === 'pending' && r.kind === 'clearance');

  const ask = (e) => {
    e.preventDefault();
    dispatch({ type: 'request/create', request: { kind: 'clearance', from: me.clearance, to: me.clearance + 1, reason: reason.trim() } });
    setReason('');
    toast('Запит на підвищення допуску надіслано');
  };

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">Профіль і параметри</div>
          <h1 className="vx-h1">Налаштування</h1>
        </div>
      </header>

      <div className="grid grid--2">
        <Panel title="Профіль">
          <div className="profile">
            <Avatar name={me.name} lg />
            <div>
              <div className="vx-h2">{me.name}</div>
              <div className="vx-muted">{me.title}</div>
            </div>
          </div>
          <dl className="meta">
            <dt>Ідентифікатор</dt><dd className="vx-mono">{me.code}</dd>
            <dt>Роль</dt><dd>{ROLES.find((r) => r.id === me.role).name}</dd>
            <dt>Напрям</dt><dd>{DIVISIONS.find((d) => d.id === me.division)?.name}</dd>
            <dt>Допуск</dt><dd><ClassBadge level={me.clearance} /></dd>
            <dt>MFA</dt><dd>{me.mfa ? <Status kind="ok">Увімкнено</Status> : <Status kind="warn">Не налаштовано</Status>}</dd>
            <dt>Сесія з</dt><dd>{fmtDate(state.session.since)}</dd>
          </dl>
          {me.clearance < 3 && (
            <form className="ask" onSubmit={ask}>
              <div className="vx-eyebrow">Підвищення допуску до «{CLEARANCE[me.clearance + 1].short}»</div>
              {hasPending ? <div className="vx-hint">Ваш запит уже розглядається.</div> : <>
                <input className="vx-input" placeholder="Обґрунтування" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Обґрунтування запиту" />
                <button className="vx-btn" disabled={reason.trim().length < 8}>Надіслати запит</button>
              </>}
            </form>
          )}
        </Panel>

        <div className="stack">
          <Panel title="Інтерфейс">
            <div className="stack">
              <div className="vx-field">
                <span className="vx-label">Тема</span>
                <div className="segmented" role="group" aria-label="Тема">
                  <button className={s.theme === 'matte' ? 'is-active' : ''} onClick={() => set({ theme: 'matte' })}>Матова чорна</button>
                  <button className={s.theme === 'paper' ? 'is-active' : ''} onClick={() => set({ theme: 'paper' })}>Папір</button>
                </div>
              </div>
              <Switch checked={!s.sensitive} onChange={(v) => set({ sensitive: !v })} label="Приховувати чутливі показники (видно при наведенні)" />
              <div className="vx-field">
                <label className="vx-label" htmlFor="lock">Автоблокування при бездіяльності</label>
                <select id="lock" className="vx-select" value={s.lockMinutes} onChange={(e) => set({ lockMinutes: +e.target.value })}>
                  {[1, 5, 15, 30].map((m) => <option key={m} value={m}>{m} хв</option>)}
                </select>
              </div>
            </div>
          </Panel>

          <Panel title="Мої права">
            <div className="list">
              {MODULES.map((m) => (
                <div className="list__row" key={m.id}>
                  <span>{m.name}</span>
                  <span className={`perm perm--${perms[m.id]}`}><i aria-hidden="true" />{LEVEL[perms[m.id]]}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Гарячі клавіші">
            <dl className="meta meta--keys">
              <dt><kbd>Ctrl</kbd> <kbd>K</kbd></dt><dd>Командний рядок</dd>
              <dt><kbd>Ctrl</kbd> <kbd>L</kbd></dt><dd>Заблокувати сесію</dd>
              <dt><kbd>Esc</kbd></dt><dd>Закрити панель</dd>
            </dl>
          </Panel>

          {me.role === 'admin' && (
            <Panel title="Демо-дані">
              <p className="vx-hint">Повертає людей, запити, файли та журнал до початкового стану. Завантажені файли буде видалено з пристрою.</p>
              <button className="vx-btn vx-btn--danger" onClick={async () => {
                if (!confirm('Скинути всі демо-дані?')) return;
                await clearBlobs().catch(() => {});
                dispatch({ type: 'reset' });
                toast('Демо-дані скинуто');
              }}><Icon name="refresh" /> Скинути</button>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
