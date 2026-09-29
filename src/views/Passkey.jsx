import { useEffect, useState } from 'react';
import { Loader } from '../brand/Mark.jsx';
import { Icon } from '../components/Icon.jsx';
import { CUSTOS } from '../data/clearance.js';
import { enroll, confirm, passkeyError, browserSupportsWebAuthn } from '../lib/passkey.js';
import { copyText } from '../lib/io.js';

// Second step of every Supabase sign-in: confirm with a passkey (Face ID / Touch ID / Windows Hello),
// create the first one, or bind a new device with a code from CUSTOS. `st` comes from api/passkey status.
export function PasskeyStep({ st, onDone, onCancel }) {
  const [mode, setMode] = useState(st.keys ? 'confirm' : st.enrollFree ? 'first' : 'code');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [recovery, setRecovery] = useState(null);
  const [saved, setSaved] = useState(false);
  const supported = browserSupportsWebAuthn();

  const run = async (fn) => {
    setErr(''); setBusy(true);
    try { return await fn(); } catch (e) { setErr(passkeyError(e)); return null; } finally { setBusy(false); }
  };
  const doConfirm = () => run(async () => { await confirm(); onDone(); });
  const doEnroll = (withCode) => run(async () => {
    const r = await enroll(withCode ? code : undefined);
    if (r.recovery?.length) setRecovery(r.recovery); else onDone();
  });

  // Auto-offer Face ID / Touch ID right away when the person already has a key.
  useEffect(() => { if (mode === 'confirm' && supported) doConfirm(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!supported) {
    return (
      <div className="login__form">
        <div className="vx-error">Цей браузер не підтримує ключі доступу. Відкрийте сайт у Safari, Chrome або Edge останньої версії.</div>
        <button type="button" className="vx-btn vx-btn--ghost" onClick={onCancel}>Вийти</button>
      </div>
    );
  }

  if (recovery) {
    return (
      <div className="login__form">
        <div className="vx-eyebrow">{CUSTOS.name} · резервні коди</div>
        <p className="vx-muted">Ключ створено. Це ваші резервні коди — <b>єдиний спосіб повернути доступ</b>, якщо ви втратите всі пристрої з ключами. Кожен код діє один раз. Збережіть їх офлайн (папір, сейф) і не надсилайте в месенджерах.</p>
        <div className="pk-codes vx-mono">{recovery.map((c) => <span key={c}>{c}</span>)}</div>
        <button type="button" className="vx-btn" onClick={() => copyText(recovery.join('\n'))}><Icon name="copy" /> Скопіювати</button>
        <label className="vx-check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> <span>Я зберіг коди в надійному місці</span></label>
        <button type="button" className="vx-btn vx-btn--primary login__submit" disabled={!saved} onClick={onDone}>Продовжити</button>
      </div>
    );
  }

  return (
    <div className="login__form">
      {mode === 'confirm' && <>
        <p className="vx-muted">Підтвердіть, що це ви: Face ID, Touch ID, Windows Hello або ключ безпеки.</p>
        <button type="button" className="vx-btn vx-btn--primary login__submit" disabled={busy} onClick={doConfirm}>
          {busy ? <Loader size={18} label="Очікування" /> : <><Icon name="key" /> Підтвердити ключем</>}
        </button>
        <button type="button" className="vx-btn vx-btn--ghost" onClick={() => { setMode('code'); setErr(''); }}>Новий пристрій або втратили ключ?</button>
      </>}

      {mode === 'first' && <>
        <p className="vx-muted">Ви — <b>{CUSTOS.name}</b>, {CUSTOS.gloss}. Створіть ключ доступу на цьому пристрої: далі вхід підтверджуватиметься Face ID, Touch ID або Windows Hello. Обличчя й відбиток не залишають пристрою.</p>
        <button type="button" className="vx-btn vx-btn--primary login__submit" disabled={busy} onClick={() => doEnroll(false)}>
          {busy ? <Loader size={18} label="Очікування" /> : <><Icon name="key" /> Створити ключ доступу</>}
        </button>
      </>}

      {mode === 'code' && <>
        <p className="vx-muted">
          Щоб прив’язати цей пристрій, потрібен одноразовий <b>код прив’язки</b> від {CUSTOS.name}{st.custosName ? ` (${st.custosName})` : ''}.
          {st.custos && ' Якщо ви CUSTOS і втратили всі ключі — введіть один із резервних кодів.'}
        </p>
        <div className="vx-field">
          <label className="vx-label" htmlFor="pk-code">Код</label>
          <input id="pk-code" className="vx-input vx-input--mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XX" autoComplete="one-time-code" autoFocus />
        </div>
        <button type="button" className="vx-btn vx-btn--primary login__submit" disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length < 8} onClick={() => doEnroll(true)}>
          {busy ? <Loader size={18} label="Очікування" /> : <><Icon name="key" /> Прив’язати пристрій</>}
        </button>
        {st.keys > 0 && <button type="button" className="vx-btn vx-btn--ghost" onClick={() => { setMode('confirm'); setErr(''); }}>Назад</button>}
      </>}

      {err && <div className="vx-error" role="alert">{err}</div>}
      <button type="button" className="vx-btn vx-btn--ghost" onClick={onCancel}>Вийти</button>
    </div>
  );
}
