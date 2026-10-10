import { useEffect, useState } from 'react';
import { useStore, fmtDate } from '../store.jsx';
import { Panel, Avatar, ClassBadge, Switch, Status } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { ROLES, DIVISIONS, CLEARANCE, MODULES } from '../data/seed.js';
import { MAX_LEVEL, CUSTOS } from '../data/clearance.js';
import { supabaseOn, authHeaders } from '../lib/supabase.js';
import { isTouch, useInstall } from '../lib/mobile.js';
import { missingFor } from '../data/academy/meta.js';
import { listKeys, enroll, removeKey, passkeyError, listSessions, endSessions } from '../lib/passkey.js';
import { clearBlobs } from '../vaultdb.js';

const LEVEL = ['Немає', 'Перегляд', 'Редагування', 'Керування'];
const touch = isTouch();

// The morning brief by e-mail (api/brief.js): on by default; titles above LUMEN never go into the letter.
function BriefMail() {
  const { me, dispatch, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const on = me.brief !== false;
  const sendNow = async () => {
    setBusy(true);
    try {
      const res = await fetch(new URL('api/brief', document.baseURI), { method: 'POST', headers: await authHeaders({ 'Content-Type': 'application/json' }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || (res.status === 404 ? 'Серверна функція недоступна (працює лише на Vercel)' : `HTTP ${res.status}`));
      toast(`Бриф надіслано на ${body.to}`);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Panel title="Ранковий бриф">
      <div className="stack">
        <Switch checked={on} onChange={(v) => dispatch({ type: 'user/update', id: me.id, patch: { brief: v } })} label="Щоранку о 8:00 на пошту" />
        <div className="vx-hint">{me.email ? `Адреса: ${me.email}. ` : ''}Лист приходить, лише коли є що повідомити. Назви записів вище грифа LUMEN у листі не показуються — лише їх кількість.</div>
        {supabaseOn && <button className="vx-btn vx-btn--sm" onClick={sendNow} disabled={busy}><Icon name="bell" /> {busy ? 'Надсилаю…' : 'Надіслати мені зараз'}</button>}
      </div>
    </Panel>
  );
}

// Push notifications on this device (api/push.js, public/sw.js): mentions, tasks, requests, conveyor, brief.
const b64ToBytes = (b64) => { const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
function PushSettings() {
  const { toast } = useStore();
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [on, setOn] = useState(null);
  const [busy, setBusy] = useState(false);
  const ios = /iPhone|iPad/.test(navigator.userAgent) && !window.matchMedia?.('(display-mode: standalone)').matches;
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.getRegistration('/sw.js').then((r) => r?.pushManager.getSubscription()).then((s) => setOn(!!s)).catch(() => setOn(false));
  }, [supported]);
  const api = async (payload) => {
    const res = await fetch(new URL('api/push', document.baseURI), { method: 'POST', headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
  };
  const enable = async () => {
    setBusy(true);
    try {
      const keyRes = await fetch(new URL('api/push', document.baseURI));
      const key = await keyRes.json().catch(() => ({}));
      if (!keyRes.ok) throw new Error(key.message || 'Push недоступний на сервері');
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Сповіщення заборонено в налаштуваннях браузера');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key.publicKey) });
      await api({ subscribe: sub.toJSON() });
      setOn(true); toast('Сповіщення на цьому пристрої увімкнено');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await api({ unsubscribe: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
      setOn(false); toast('Сповіщення вимкнено');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Panel title="Сповіщення на пристрій">
      <div className="stack">
        <div className="vx-hint">Згадки, нові завдання, запити на доступ, знахідки конвеєра й ранковий бриф — навіть коли платформу закрито. Текст сповіщення короткий; подробиці — лише після входу.</div>
        {!supported ? <div className="vx-hint">Цей браузер не підтримує push-сповіщення.</div>
          : ios ? <div className="vx-hint">На iPhone спершу додайте платформу на початковий екран (Поділитися → «На початковий екран»), відкрийте звідти — і ввімкніть тут.</div>
            : <button className="vx-btn vx-btn--sm" disabled={busy || on === null} onClick={on ? disable : enable}><Icon name="bell" /> {on ? 'Вимкнути на цьому пристрої' : 'Увімкнути на цьому пристрої'}</button>}
      </div>
    </Panel>
  );
}

// Phone only: install to the home screen, what happens when the app is put away.
function ThisPhone() {
  const { state, dispatch, toast } = useStore();
  const inst = useInstall();
  const hideLock = state.settings.hideLock ?? -1;
  const install = async () => { if (await inst.prompt()) toast('Reaction додано на головний екран'); };
  return (
    <Panel title="Цей телефон">
      <div className="stack">
        {inst.installed ? (
          <div className="vx-status"><Icon name="ok" /> Відкрито з головного екрана — окреме вікно без адресного рядка.</div>
        ) : inst.canPrompt ? (
          <button className="vx-btn vx-btn--primary" onClick={install}><Icon name="download" /> Встановити на головний екран</button>
        ) : inst.ios ? (
          <div className="vx-hint install-ios">
            <b>Встановити на iPhone:</b> у Safari натисніть <Icon name="share" size={15} /> «Поділитися» → «На початковий екран» → «Додати».
            Застосунок відкриватиметься окремо, на весь екран.
          </div>
        ) : (
          <div className="vx-hint">Встановити: меню браузера ⋮ → «Додати на головний екран» / «Встановити застосунок».</div>
        )}
        <div className="vx-field">
          <label className="vx-label" htmlFor="hide-lock">Блокувати, коли застосунок згорнуто</label>
          <select id="hide-lock" className="vx-select" value={hideLock} onChange={(e) => dispatch({ type: 'settings', patch: { hideLock: +e.target.value } })}>
            <option value={0}>Одразу</option>
            <option value={60}>Через 1 хв</option>
            <option value={300}>Через 5 хв</option>
            <option value={1800}>Через 30 хв</option>
            <option value={-1}>Не блокувати</option>
          </select>
          <div className="vx-hint">У перемикачі застосунків екран Reaction завжди прихований.{supabaseOn ? ' Розблокування — Face ID / Touch ID.' : ''}</div>
        </div>
      </div>
    </Panel>
  );
}

// This person's passkeys: add another device, remove one (never the last).
// Administrator: an encrypted backup of the database now (the weekly one runs by itself).
function BackupNow() {
  const { toast } = useStore();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch(new URL('api/backup', document.baseURI), { method: 'POST', headers: await authHeaders() });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || `HTTP ${res.status}`); }
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'backup.json.enc';
      const { saveFile } = await import('../lib/io.js');
      await saveFile(name, await res.blob());
      toast(`Резервну копію створено: ${name}`);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Panel title="Резервні копії">
      <div className="stack">
        <div className="vx-hint">Щопонеділка база (люди, записи, обговорення, індекс Сховища, налаштування) зберігається зашифрованою в Supabase Storage; зберігаються 8 останніх копій. Розшифрувати можна лише фразою BACKUP_KEY — зберігайте її окремо від платформи.</div>
        <button className="vx-btn vx-btn--sm" disabled={busy} onClick={run}><Icon name="download" /> {busy ? 'Створюю…' : 'Створити й завантажити копію зараз'}</button>
      </div>
    </Panel>
  );
}

// «Мої сеанси»: where I am signed in (confirmed with a key), and ending those sessions.
const deviceOf = (ua) => {
  if (!ua) return 'Невідомий пристрій';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Пристрій';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'браузер';
  return `${os} · ${br}`;
};
function Sessions() {
  const { toast } = useStore();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const load = () => listSessions().then((r) => setList(r.sessions)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const end = async (opts) => {
    try { await endSessions(opts); toast(opts.all ? 'Усі інші сеанси завершено' : 'Сеанс завершено'); await load(); } catch (e) { toast(e.message, 'error'); }
  };
  const others = (list || []).filter((s) => !s.current);
  return (
    <Panel title="Мої сеанси" action={others.length > 0 && <button className="vx-btn vx-btn--sm vx-btn--danger" onClick={() => end({ all: true })}>Вийти на всіх інших</button>}>
      <div className="list">
        {err && <div className="list__row vx-error">{err}</div>}
        {!list && !err && <div className="list__row vx-hint">Завантаження…</div>}
        {(list || []).map((s) => (
          <div className="list__row" key={s.id}>
            <span className="list__text">
              <span>{deviceOf(s.ua)}{s.current && <span className="vx-tag"> цей пристрій</span>}</span>
              <span className="vx-hint">Підтверджено {fmtDate(s.verifiedAt)}{s.key ? ` · ключ «${s.key}»` : ''} · діє до {fmtDate(s.expiresAt)}</span>
            </span>
            {!s.current && <button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => end({ id: s.id })}>Завершити</button>}
          </div>
        ))}
        <div className="list__row vx-hint">Незнайомий пристрій — завершіть сеанс і змініть пароль. Завершений сеанс одразу втрачає доступ до даних.</div>
      </div>
    </Panel>
  );
}

function Keys() {
  const { me, toast } = useStore();
  const [keys, setKeys] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => listKeys().then((r) => setKeys(r.keys)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const add = async () => {
    setBusy(true); setErr('');
    try { await enroll(); toast('Ключ цього пристрою додано'); await load(); } catch (e) { setErr(passkeyError(e)); } finally { setBusy(false); }
  };
  const drop = async (id) => {
    try { await removeKey(id); toast('Ключ видалено'); await load(); } catch (e) { setErr(e.message); }
  };
  return (
    <Panel title="Ключі доступу" action={me.custos ? <span className="vx-class vx-class--custos" title={CUSTOS.rule}>{CUSTOS.name}</span> : null}>
      <div className="stack">
        <div className="vx-hint">Вхід підтверджується Face ID, Touch ID, Windows Hello або ключем безпеки. Додайте другий пристрій, щоб не втратити доступ.</div>
        {keys ? <div className="list">
          {keys.map((k) => (
            <div className="list__row" key={k.id}>
              <span className="list__lead pk-key"><Icon name="key" size={16} /> {k.device || 'Пристрій'}</span>
              <span className="vx-hint">додано {fmtDate(k.created_at, false)}{k.last_used_at ? ` · вхід ${fmtDate(k.last_used_at)}` : ''}</span>
              {keys.length > 1 && <button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => drop(k.id)}>Видалити</button>}
            </div>
          ))}
        </div> : !err && <div className="vx-hint">Завантаження…</div>}
        <button className="vx-btn" disabled={busy} onClick={add}><Icon name="plus" /> Додати цей пристрій</button>
        {me.custos && <div className="vx-hint">Ви — {CUSTOS.name}, {CUSTOS.gloss}. Якщо втратите всі пристрої, допоможуть лише резервні коди, які ви зберегли при першому ключі.</div>}
        {err && <div className="vx-error">{err}</div>}
      </div>
    </Panel>
  );
}

export function Settings({ go }) {
  const { state, me, perms, dispatch, toast } = useStore();
  const s = state.settings;
  const set = (patch) => dispatch({ type: 'settings', patch });
  const [reason, setReason] = useState('');
  const [armed, setArmed] = useState(false);
  const missing = me.clearance < MAX_LEVEL ? missingFor(me, me.clearance + 1) : [];
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
          <div className="vx-hint">Версія {__BUILD__}</div>
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
          {me.clearance < MAX_LEVEL && (
            <form className="ask" onSubmit={ask}>
              <div className="vx-eyebrow">Підвищення допуску до «{CLEARANCE[me.clearance + 1].short}»</div>
              {hasPending ? <div className="vx-hint">Ваш запит уже розглядається.</div> : missing.length ? <>
                <div className="vx-hint">Спершу складіть обов’язкові курси в «Навчанні»:</div>
                <div className="req-courses">
                  {missing.map((c) => <button type="button" key={c.id} className="vx-btn vx-btn--sm" onClick={() => go?.('learn', c.id)}><Icon name="book" /> {c.title}</button>)}
                </div>
              </> : <>
                <input className="vx-input" placeholder="Обґрунтування" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Обґрунтування запиту" />
                <button className="vx-btn" disabled={reason.trim().length < 8}>Надіслати запит</button>
              </>}
            </form>
          )}
        </Panel>

        <div className="stack">
          {touch && <ThisPhone />}
          {supabaseOn && <Keys />}
          {supabaseOn && <Sessions />}
          {supabaseOn && me.role === 'admin' && <BackupNow />}
          <BriefMail />
          {supabaseOn && <PushSettings />}
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
                  <option value={0}>Не блокувати</option>
                  {[15, 30, 60, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} хв` : `${m / 60} год`}</option>)}
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

          <Panel title="Гарячі клавіші" className="only-desktop">
            <dl className="meta meta--keys">
              <dt><kbd>Ctrl</kbd> <kbd>K</kbd></dt><dd>Командний рядок</dd>
              <dt><kbd>Ctrl</kbd> <kbd>L</kbd></dt><dd>Заблокувати сесію</dd>
              <dt><kbd>Esc</kbd></dt><dd>Закрити панель</dd>
            </dl>
          </Panel>

          {me.role === 'admin' && (
            <Panel title="Демо-дані">
              <p className="vx-hint">Повертає людей, запити, файли та журнал до початкового стану. Завантажені файли буде видалено з пристрою.</p>
              <button className="vx-btn vx-btn--danger" onBlur={() => setArmed(false)} onClick={async () => {
                if (!armed) return setArmed(true);
                setArmed(false);
                await clearBlobs().catch(() => {});
                dispatch({ type: 'reset' });
                toast('Демо-дані скинуто');
              }}><Icon name="refresh" /> {armed ? 'Точно скинути?' : 'Скинути'}</button>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
