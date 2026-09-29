import { useState } from 'react';
import { useStore, fmtAgo, fmtDate } from '../store.jsx';
import { SealBadge, Panel, Status, Avatar, Drawer, ClassBadge, Switch } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { DIVISIONS, ROLES, CLEARANCE, MODULES, PERMISSIONS } from '../data/seed.js';
import { LEVELS, SEAL, CUSTOS } from '../data/clearance.js';
import { supabaseOn } from '../lib/supabase.js';
import { issueCode } from '../lib/passkey.js';
import { copyText } from '../lib/io.js';

const STATUS = {
  active: ['ok', 'Активний'],
  suspended: ['danger', 'Призупинено'],
  invited: ['info', 'Запрошено'],
};
const LEVEL = ['—', 'Перегляд', 'Редагування', 'Керування'];

export function Access({ tab, setTab, focus, setFocus }) {
  const { state } = useStore();
  const pending = state.requests.filter((r) => r.status === 'pending').length;
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">Ідентичності та права</div>
          <h1 className="vx-h1">Доступи</h1>
        </div>
      </header>
      <nav className="vx-tabs" role="tablist">
        {[['people', 'Люди'], ['requests', `Запити${pending ? ` · ${pending}` : ''}`], ['roles', 'Ролі та права'], ['levels', 'Рівні допуску']].map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`vx-tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>{l}</button>
        ))}
      </nav>
      {tab === 'people' && <People focus={focus} setFocus={setFocus} />}
      {tab === 'requests' && <Requests />}
      {tab === 'roles' && <Roles />}
      {tab === 'levels' && <Levels />}
    </div>
  );
}

function canManage(me, perms, target) {
  if (perms.access < 2) return false;
  if (me.role === 'admin') return true;
  return target ? target.division === me.division && target.id !== me.id : true;
}

function People({ focus, setFocus }) {
  const { state, me, perms } = useStore();
  const [q, setQ] = useState('');
  const [div, setDiv] = useState('all');
  const [st, setSt] = useState('all');
  const edit = focus && state.users.some((u) => u.id === focus) ? focus : null;
  const setEdit = (id) => setFocus(id);
  const [invite, setInvite] = useState(false);

  const rows = state.users.filter((u) =>
    (div === 'all' || u.division === div) &&
    (st === 'all' || u.status === st) &&
    (`${u.name} ${u.code} ${u.title}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="toolbar">
        <div className="vx-search toolbar__grow">
          <Icon name="search" />
          <input className="vx-input" placeholder="Пошук за ім'ям, кодом, посадою" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Пошук людей" />
        </div>
        <select className="vx-select toolbar__sel" value={div} onChange={(e) => setDiv(e.target.value)} aria-label="Напрям">
          <option value="all">Усі напрями</option>
          {DIVISIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="vx-select toolbar__sel" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Статус">
          <option value="all">Будь-який статус</option>
          {Object.entries(STATUS).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {me.role === 'admin' && <button className="vx-btn vx-btn--primary" onClick={() => setInvite(true)}><Icon name="plus" /> Запросити</button>}
      </div>

      <Panel bodyClass="vx-table-wrap">
        <table className="vx-table">
          <thead>
            <tr><th>Співробітник</th><th>Напрям</th><th>Роль</th><th>Допуск</th><th>MFA</th><th>Статус</th><th>Активність</th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="is-clickable" onClick={() => setEdit(u.id)}>
                <td>
                  <div className="cell-person">
                    <Avatar name={u.name} />
                    <div><div>{u.name}</div><div className="vx-hint"><span className="vx-mono">{u.code}</span> · {u.title}</div></div>
                  </div>
                </td>
                <td>{DIVISIONS.find((d) => d.id === u.division)?.name}</td>
                <td>{ROLES.find((r) => r.id === u.role).name}</td>
                <td><ClassBadge level={u.clearance} /></td>
                <td>{u.mfa ? <Status kind="ok">Так</Status> : <Status kind="warn">Ні</Status>}</td>
                <td><Status kind={STATUS[u.status][0]}>{STATUS[u.status][1]}</Status></td>
                <td className="vx-hint">{fmtAgo(u.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="vx-empty"><Icon name="users" /> Нікого не знайдено</div>}
      </Panel>

      {edit && <EditUser id={edit} onClose={() => setEdit(null)} readOnly={!canManage(me, perms, state.users.find((u) => u.id === edit))} />}
      {invite && <Invite onClose={() => setInvite(false)} />}
    </>
  );
}

// CUSTOS only: bind a new device for someone, or reset lost keys. The code is shown once.
function KeyAccess({ u }) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(null);
  const [err, setErr] = useState('');
  const [armed, setArmed] = useState(false);
  const run = async (reset) => {
    if (reset && !armed) { setArmed(true); return; }
    setBusy(true); setErr(''); setArmed(false);
    try { setCode(await issueCode(u.id, reset)); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div className="vx-eyebrow">Ключі доступу · {CUSTOS.name}</div>
      {code ? <>
        <div className="pk-code-box">{code.code}</div>
        <div className="vx-hint">Передайте код особисто. Діє {code.expiresHours} год, один раз. Людина вводить його після пароля й прив’язує свій пристрій Face ID / Touch ID / Windows Hello.</div>
        <button className="vx-btn vx-btn--sm" onClick={() => copyText(code.code)}><Icon name="copy" /> Скопіювати</button>
      </> : <>
        <div className="vx-hint">Лише ви можете видати код прив’язки або скинути ключі, якщо пристрій втрачено.</div>
        <div className="toolbar">
          <button className="vx-btn vx-btn--sm" disabled={busy} onClick={() => run(false)}><Icon name="key" /> Видати код прив’язки</button>
          <button className="vx-btn vx-btn--sm vx-btn--danger" disabled={busy} onClick={() => run(true)} onBlur={() => setArmed(false)}>{armed ? 'Точно скинути всі ключі?' : 'Скинути ключі й видати код'}</button>
        </div>
      </>}
      {err && <div className="vx-error">{err}</div>}
    </div>
  );
}

function EditUser({ id, onClose, readOnly: ro }) {
  const { state, me, dispatch, toast } = useStore();
  const u = state.users.find((x) => x.id === id);
  // The CUSTOS card is changed only by CUSTOS (the server enforces it too).
  const readOnly = ro || (u.custos && u.id !== me.id);
  const [draft, setDraft] = useState({ role: u.role, division: u.division, clearance: u.clearance, status: u.status, mfa: u.mfa });
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const save = () => {
    dispatch({ type: 'user/update', id, patch: draft });
    toast(`Зміни для ${u.name} збережено й записано в журнал`);
    onClose();
  };
  const history = state.audit.filter((e) => e.text.includes(u.code) || e.actor === u.id).slice(0, 5);

  return (
    <Drawer title={u.name} onClose={onClose}
      footer={readOnly ? <span className="vx-hint">Лише перегляд — недостатньо прав для змін.</span> : <>
        <button className="vx-btn vx-btn--ghost" onClick={onClose}>Скасувати</button>
        <button className="vx-btn vx-btn--primary" onClick={save}>Зберегти</button>
      </>}>
      <div className="cell-person">
        <Avatar name={u.name} lg />
        <div><div className="vx-mono">{u.code}{u.custos && <span className="vx-class vx-class--custos" title={CUSTOS.rule}>{CUSTOS.name}</span>}</div><div className="vx-muted">{u.title}</div></div>
      </div>
      {u.custos && u.id !== me.id && <div className="vx-hint">{CUSTOS.name} — {CUSTOS.gloss}. Цей профіль змінює лише власник.</div>}
      <div className="form-grid">
        <div className="vx-field">
          <label className="vx-label" htmlFor="role">Роль</label>
          <select id="role" className="vx-select" value={draft.role} disabled={readOnly || me.role !== 'admin'} onChange={(e) => set('role')(e.target.value)}>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="vx-field">
          <label className="vx-label" htmlFor="division">Напрям</label>
          <select id="division" className="vx-select" value={draft.division} disabled={readOnly || me.role !== 'admin'} onChange={(e) => set('division')(e.target.value)}>
            {DIVISIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="vx-field">
          <label className="vx-label" htmlFor="clearance">Рівень допуску</label>
          <select id="clearance" className="vx-select" value={draft.clearance} disabled={readOnly} onChange={(e) => set('clearance')(+e.target.value)}>
            {CLEARANCE.filter((c) => c.id <= me.clearance).map((c) => <option key={c.id} value={c.id}>{c.full}</option>)}
          </select>
          {!readOnly && <div className="vx-hint">Можна надати допуск не вищий за власний.</div>}
        </div>
        <div className="vx-field">
          <label className="vx-label" htmlFor="status">Статус</label>
          <select id="status" className="vx-select" value={draft.status} disabled={readOnly || u.id === me.id} onChange={(e) => set('status')(e.target.value)}>
            <option value="active">Активний</option>
            <option value="suspended">Призупинено</option>
            {u.status === 'invited' && <option value="invited">Запрошено</option>}
          </select>
        </div>
      </div>
      {!readOnly && !supabaseOn && <Switch checked={draft.mfa} onChange={set('mfa')} label="Двофакторна автентифікація обов'язкова" />}
      {supabaseOn && me.custos && u.id !== me.id && <KeyAccess u={u} />}
      <div>
        <div className="vx-eyebrow">Остання активність у журналі</div>
        <div className="list">
          {history.length ? history.map((e) => (
            <div className="list__row list__row--top" key={e.id}>
              <div className="list__text"><div>{e.text}</div><div className="vx-hint">{fmtDate(e.at)}</div></div>
            </div>
          )) : <div className="vx-hint">Записів немає.</div>}
        </div>
      </div>
    </Drawer>
  );
}

function Invite({ onClose }) {
  const { me, dispatch, toast } = useStore();
  const { state } = useStore();
  const [f, setF] = useState({ name: '', email: '', title: '', role: 'analyst', division: 'int', clearance: 0 });
  const set = (k) => (e) => setF({ ...f, [k]: k === 'clearance' ? +e.target.value : e.target.value });
  const email = f.email.trim().toLowerCase();
  const taken = email && state.users.some((u) => u.email === email);
  const ok = f.name.trim().split(/\s+/).length >= 2 && (!supabaseOn || (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !taken));
  const send = () => {
    dispatch({ type: 'user/invite', user: { ...f, name: f.name.trim() } });
    toast(`Запрошення для ${f.name.trim()} створено`);
    onClose();
  };
  return (
    <Drawer title="Новий співробітник" onClose={onClose}
      footer={<><button className="vx-btn vx-btn--ghost" onClick={onClose}>Скасувати</button><button className="vx-btn vx-btn--primary" disabled={!ok} onClick={send}>Надіслати запрошення</button></>}>
      <div className="vx-field"><label className="vx-label" htmlFor="n">Ім'я та прізвище</label><input id="n" className="vx-input" value={f.name} onChange={set('name')} autoFocus /></div>
      <div className="vx-field"><label className="vx-label" htmlFor="e">Робоча пошта{supabaseOn && ' *'}</label>
        <input id="e" type="email" className="vx-input" value={f.email} onChange={set('email')} />
        {taken && <div className="vx-error">Ця пошта вже є в команді.</div>}
      </div>
      <div className="vx-field"><label className="vx-label" htmlFor="t">Посада</label><input id="t" className="vx-input" value={f.title} onChange={set('title')} /></div>
      <div className="form-grid">
        <div className="vx-field"><label className="vx-label" htmlFor="r">Роль</label>
          <select id="r" className="vx-select" value={f.role} onChange={set('role')}>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div className="vx-field"><label className="vx-label" htmlFor="d">Напрям</label>
          <select id="d" className="vx-select" value={f.division} onChange={set('division')}>{DIVISIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        <div className="vx-field"><label className="vx-label" htmlFor="c">Допуск</label>
          <select id="c" className="vx-select" value={f.clearance} onChange={set('clearance')}>{CLEARANCE.filter((c) => c.id <= me.clearance).map((c) => <option key={c.id} value={c.id}>{c.full}</option>)}</select></div>
      </div>
      {supabaseOn
        ? <p className="vx-hint">Створіть цій пошті вхід у Supabase: Authentication → Users → Add user (пароль) або Invite user (лист). Людина увійде саме з цією поштою; права й допуск задаються тут.</p>
        : <p className="vx-hint">Запрошений отримає одноразове посилання. Обліковий запис стане активним після налаштування MFA.</p>}
    </Drawer>
  );
}

function Requests() {
  const { state, me, perms, dispatch, userById, toast } = useStore();
  const [show, setShow] = useState('pending');
  const rows = state.requests.filter((r) => (show === 'pending' ? r.status === 'pending' : r.status !== 'pending'));
  const decide = (r, approve) => {
    dispatch({ type: 'request/resolve', id: r.id, approve });
    toast(approve ? 'Запит схвалено' : 'Запит відхилено');
  };
  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Фільтр запитів">
          <button className={show === 'pending' ? 'is-active' : ''} onClick={() => setShow('pending')}>Очікують</button>
          <button className={show === 'done' ? 'is-active' : ''} onClick={() => setShow('done')}>Розглянуті</button>
        </div>
      </div>
      <div className="stack">
        {rows.map((r) => {
          const u = userById(r.user);
          const basisFile = r.kind === 'basis' ? state.files.find((f) => f.id === r.file) : null;
          const canDecide = perms.access >= 2 && (me.role === 'admin' || u.division === me.division) && u.id !== me.id
            && (r.kind !== 'clearance' || r.to <= me.clearance)
            && (r.kind !== 'basis' || (basisFile && basisFile.clearance <= me.clearance));
          const folder = state.folders.find((f) => f.id === r.folder);
          return (
            <div className="vx-panel request" key={r.id}>
              <div className="cell-person">
                <Avatar name={u.name} />
                <div>
                  <div>{u.name} <span className="vx-mono vx-muted">{u.code}</span></div>
                  <div className="vx-hint">{DIVISIONS.find((d) => d.id === u.division)?.name} · {fmtAgo(r.at)}</div>
                </div>
              </div>
              <div className="request__what">
                <div className="request__line">
                  {r.kind === 'clearance'
                    ? <>Підвищення допуску <ClassBadge level={r.from} /> <Icon name="chevron" size={14} /> <ClassBadge level={r.to} /></>
                    : r.kind === 'basis'
                      ? <>Підстава на документ <span className="vx-mono">{basisFile?.number}</span> <b>{basisFile?.name ?? '—'}</b> <ClassBadge level={basisFile?.clearance ?? 0} sealed /></>
                      : <>Доступ до папки <b>{folder?.name}</b> <ClassBadge level={folder?.clearance ?? 0} /></>}
                </div>
                <div className="vx-muted">«{r.reason}»</div>
              </div>
              <div className="request__actions">
                {r.status === 'pending' ? (canDecide ? <>
                  <button className="vx-btn vx-btn--sm" onClick={() => decide(r, false)}><Icon name="close" /> Відхилити</button>
                  <button className="vx-btn vx-btn--sm vx-btn--brass" onClick={() => decide(r, true)}><Icon name="check" /> Схвалити</button>
                </> : <span className="vx-hint">Потрібне рішення уповноваженої особи</span>)
                  : <Status kind={r.status === 'approved' ? 'ok' : 'danger'}>{r.status === 'approved' ? 'Схвалено' : 'Відхилено'}</Status>}
              </div>
            </div>
          );
        })}
        {!rows.length && <Panel><div className="vx-empty"><Icon name="check" /> Немає запитів у цьому списку</div></Panel>}
      </div>
    </>
  );
}

function Roles() {
  return (
    <Panel bodyClass="vx-table-wrap">
      <table className="vx-table matrix">
        <thead>
          <tr><th>Модуль</th>{ROLES.map((r) => <th key={r.id}>{r.name}</th>)}</tr>
        </thead>
        <tbody>
          {MODULES.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              {ROLES.map((r) => {
                const v = PERMISSIONS[r.id][m.id];
                return <td key={r.id}><span className={`perm perm--${v}`}><i aria-hidden="true" />{LEVEL[v]}</span></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Levels() {
  const { state } = useStore();
  const count = (id) => ({
    people: state.users.filter((u) => u.clearance === id).length,
    files: state.files.filter((f) => f.clearance === id).length,
  });
  const sealed = state.files.filter((f) => f.sealed).length;
  const year = new Date().getFullYear();
  return (
    <div className="stack">
      <div className="grid grid--3l">
        {LEVELS.map((l) => {
          const n = count(l.id);
          return (
            <div className="vx-panel vx-stat level-card" key={l.id}>
              <div className="level-card__tier">{l.tier}</div>
              <div className="level-card__name">{l.name}<small>{l.gloss}</small></div>
              <ClassBadge level={l.id} />
              <div className="level-card__rule">{l.rule}</div>
              <p>{l.about}</p>
              <div className="vx-hint">Мають допуск: {n.people} · файлів: {n.files} · номер <span className="vx-mono">RC-{l.code}-…</span></div>
            </div>
          );
        })}
      </div>

      <div className="vx-panel vx-stat level-card level-card--seal">
        <div className="level-card__tier">{SEAL.tier}</div>
        <div className="level-card__name">{SEAL.name}<small>{SEAL.gloss}</small></div>
        <SealBadge />
        <div className="level-card__rule">{SEAL.rule}</div>
        <p>{SEAL.about}</p>
        <div className="vx-hint">Ставиться поверх будь-якого рівня. Підставу видає уповноважена особа на конкретний документ; кожне відкриття записується в журнал безпеки. Документів: {sealed} · номер <span className="vx-mono">RC-{SEAL.code}-…</span></div>
      </div>

      <div className="grid grid--2">
        <Panel title="Що робить систему цілісною">
          <div className="stack">
            <div className="scale" aria-hidden="true"><i /><i /><i /></div>
            <p className="vx-muted">Перші три — шкала одного виміру: скільки світла падає на документ. NON OCULIS лежить поза шкалою. Латинь тут не прикраса, а спосіб не плутати ці рівні з державними грифами, які мають юридичне значення.</p>
            <table className="vx-table">
              <tbody>
                {LEVELS.map((l) => <tr key={l.id}><td><ClassBadge level={l.id} /></td><td>{l.rule}</td></tr>)}
                <tr><td><SealBadge /></td><td>{SEAL.rule}</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Номер і зниження грифа">
          <div className="stack">
            <div className="doc-num">RC-<b>UMB</b>-{year}-0007</div>
            <p className="vx-muted">Позначка рівня — частина номера документа, тож вона не губиться при пересиланні. З системи файл виходить з номером у назві. Порядковий номер незмінний; при зниженні грифа змінюється лише позначка: <span className="vx-mono">RC-UMB-…-0007 → RC-LUM-…-0007</span>.</p>
            <p className="vx-muted">Зниження — на один крок (NOX → UMBRA → LUMEN) за правилом, заданим при реєстрації: після дати або після настання події, з якою відомості втрачають чутливість. Коли умова настала, документ позначається «до зниження», а знижує власник, керівник напряму чи адміністратор — із записом у журналі. NON OCULIS не знижується автоматично.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
