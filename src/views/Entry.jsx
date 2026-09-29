import { useEffect, useState } from 'react';
import { Mark, Loader } from '../brand/Mark.jsx';
import { Icon } from '../components/Icon.jsx';
import { Avatar } from '../components/ui.jsx';
import { useStore } from '../store.jsx';
import { ROLES } from '../data/seed.js';
import { supabaseOn, signIn, signOut, rest, rpc, currentEmail } from '../lib/supabase.js';

const AUTH_MESSAGES = {
  invalid_credentials: 'Невірна пошта або пароль.',
  email_not_confirmed: 'Пошту ще не підтверджено. Перевірте лист від Supabase.',
  over_request_rate_limit: 'Забагато спроб. Зачекайте хвилину.',
};

// Sign-in through Supabase Auth. The team's people come from the server; the first person to sign in
// on a new installation becomes the administrator (core_claim_first_admin in deploy/supabase.sql).
function SupabaseLogin() {
  const { dispatch } = useStore();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await signIn(email, pass);
      const addr = currentEmail();
      let rows = await rest('core_members?select=id,doc');
      if (!rows.length && !(await rpc('core_initialised', {}))) {
        const id = `u-${Date.now().toString(36)}`;
        await rpc('core_claim_first_admin', { p_id: id, p_doc: { name: addr.split('@')[0], code: 'V-001', title: 'Адміністратор платформи', division: 'it', mfa: false, lastSeen: null } });
        rows = await rest('core_members?select=id,doc');
      }
      const people = rows.map((r) => ({ ...r.doc, id: r.id }));
      const me = people.find((u) => u.email === addr);
      if (!me) {
        await signOut();
        setErr(`Вас ще не додано до команди. Попросіть адміністратора додати ${addr} у «Доступи».`);
        return;
      }
      if (me.status === 'invited') {
        // First sign-in accepts the invitation (the only status change a person may make themselves).
        me.status = 'active';
        await rest(`core_members?id=eq.${encodeURIComponent(me.id)}`, { method: 'PATCH', body: { doc: { ...me } } });
      }
      dispatch({ type: 'shared/sync', kind: 'users', items: people });
      dispatch({ type: 'login', userId: me.id, via: 'supabase' });
    } catch (x) {
      setErr(AUTH_MESSAGES[x.code] || (x.status === 400 ? AUTH_MESSAGES.invalid_credentials : `Не вдалося увійти: ${x.message}`));
      if (currentEmail()) await signOut();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="login__form" onSubmit={submit}>
      <div className="vx-field">
        <label className="vx-label" htmlFor="email">Робоча пошта</label>
        <input id="email" type="email" className="vx-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
      </div>
      <div className="vx-field">
        <label className="vx-label" htmlFor="pass">Пароль</label>
        <input id="pass" type="password" className="vx-input" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required />
      </div>
      {err && <div className="vx-error" role="alert">{err}</div>}
      <button className="vx-btn vx-btn--primary login__submit" disabled={busy}>
        {busy ? <Loader size={18} label="Вхід" /> : <>Увійти <Icon name="lock" /></>}
      </button>
      <div className="vx-hint">Облікові записи створює адміністратор. Вхід захищено сервером: без нього дані не видаються.</div>
    </form>
  );
}

const BOOT = [
  'Встановлення захищеного з’єднання',
  'Перевірка цілісності клієнта',
  'Синхронізація ключів',
  'Готово',
];

// The boot splash shows the same cornflower loader as the rest of the app, only larger.
export function Splash({ onDone }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = [500, 1100, 1700, 2500].map((ms, i) => setTimeout(() => (i < 3 ? setStep(i + 1) : onDone()), ms));
    return () => t.forEach(clearTimeout);
  }, [onDone]);
  return (
    <div className="splash" onClick={onDone}>
      <Loader size={180} label="Reaction · завантаження" />
      <div className="splash__word vx-wordmark">Reaction</div>
      <div className="vx-tagline splash__tag">Tradecraft for intelligence</div>
      <div className="splash__status vx-mono">{BOOT[step]}{step < 3 ? '…' : ''}</div>
    </div>
  );
}

export function Login() {
  const { state, dispatch } = useStore();
  const [stage, setStage] = useState('id');
  const [code, setCode] = useState('V-001');
  const [pass, setPass] = useState('');
  const [otp, setOtp] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const user = state.users.find((u) => u.code.toLowerCase() === code.trim().toLowerCase());

  const submitId = (e) => {
    e.preventDefault();
    setErr('');
    if (!user) return setErr('Ідентифікатор не знайдено.');
    if (user.status === 'suspended') return setErr('Обліковий запис призупинено. Зверніться до служби безпеки.');
    if (pass.length < 6) return setErr('Пароль має містити щонайменше 6 символів.');
    setBusy(true);
    setTimeout(() => { setBusy(false); setStage('otp'); }, 700);
  };
  const submitOtp = (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) return setErr('Введіть шість цифр з додатка автентифікації.');
    setBusy(true);
    setTimeout(() => dispatch({ type: 'login', userId: user.id }), 900);
  };

  return (
    <div className="login">
      <div className="login__brand">
        <Mark className="login__ghost" size={720} />
        <div className="login__lockup">
          <Mark size={64} />
          <div className="vx-wordmark login__word">Reaction</div>
          <div className="vx-tagline">Tradecraft for intelligence</div>
        </div>
        <p className="login__motto">Багато джерел. Один центр. Єдине рішення.</p>
      </div>

      <div className="login__panel">
        <div className="login__mobile-brand"><Mark size={40} /><div className="vx-wordmark">Reaction</div></div>
        <div className="vx-eyebrow">Core · внутрішня платформа</div>
        <h1 className="vx-h1">{supabaseOn || stage === 'id' ? 'Вхід' : 'Підтвердження'}</h1>

        {supabaseOn ? <SupabaseLogin /> : stage === 'id' ? (
          <form className="login__form" onSubmit={submitId}>
            <div className="vx-field">
              <label className="vx-label" htmlFor="code">Ідентифікатор</label>
              <input id="code" className="vx-input vx-input--mono" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="username" />
            </div>
            <div className="vx-field">
              <label className="vx-label" htmlFor="pass">Пароль</label>
              <input id="pass" type="password" className="vx-input" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" placeholder="Щонайменше 6 символів" autoFocus />
            </div>
            {err && <div className="vx-error" role="alert">{err}</div>}
            <button className="vx-btn vx-btn--primary login__submit" disabled={busy}>
              {busy ? <Loader size={18} label="Перевірка" /> : <>Продовжити <Icon name="chevron" /></>}
            </button>
          </form>
        ) : (
          <form className="login__form" onSubmit={submitOtp}>
            <div className="login__who">
              <Avatar name={user.name} />
              <div>
                <div>{user.name}</div>
                <div className="vx-hint">{user.code} · {ROLES.find((r) => r.id === user.role).name}</div>
              </div>
            </div>
            <div className="vx-field">
              <label className="vx-label" htmlFor="otp">Код 2FA</label>
              <input id="otp" className="vx-input vx-input--mono login__otp" inputMode="numeric" maxLength={6} value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" autoFocus autoComplete="one-time-code" />
              <div className="vx-hint">Шість цифр з корпоративного додатка автентифікації.</div>
            </div>
            {err && <div className="vx-error" role="alert">{err}</div>}
            <button className="vx-btn vx-btn--primary login__submit" disabled={busy}>
              {busy ? <Loader size={18} label="Вхід" /> : <>Увійти <Icon name="lock" /></>}
            </button>
            <button type="button" className="vx-btn vx-btn--ghost" onClick={() => { setStage('id'); setOtp(''); setErr(''); }}>Назад</button>
          </form>
        )}

        {!supabaseOn && state.users.length === 1 && (
          <div className="login__demo">
            <div className="vx-eyebrow">Перший вхід</div>
            <div className="vx-hint">Ідентифікатор <span className="vx-mono">{state.users[0].code}</span>. Після входу змініть ім’я в «Доступ» і запросіть команду.</div>
          </div>
        )}
        <div className="login__foot vx-hint">Доступ лише для персоналу. Усі дії фіксуються в журналі аудиту.</div>
      </div>
    </div>
  );
}

export function Lock({ onUnlock }) {
  const { me, dispatch } = useStore();
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (pass.length < 6) return setErr('Пароль має містити щонайменше 6 символів.');
    if (supabaseOn) {
      try { await signIn(me.email || currentEmail(), pass); } catch { return setErr('Невірний пароль.'); }
    }
    dispatch({ type: 'unlock' });
    onUnlock();
  };
  return (
    <div className="lock">
      <Loader size={72} label="Сесію заблоковано" />
      <div className="vx-eyebrow">Сесію заблоковано</div>
      <div className="lock__who"><Avatar name={me.name} /> <span>{me.name}</span> <span className="vx-mono vx-muted">{me.code}</span></div>
      <form className="lock__form" onSubmit={submit}>
        <input type="password" className="vx-input" placeholder="Пароль" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus aria-label="Пароль" />
        <button className="vx-btn vx-btn--primary">Розблокувати</button>
      </form>
      {err && <div className="vx-error">{err}</div>}
      <button className="vx-btn vx-btn--ghost" onClick={() => dispatch({ type: 'logout' })}>Вийти з облікового запису</button>
    </div>
  );
}
