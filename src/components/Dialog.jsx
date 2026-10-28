// Підтвердження всередині платформи (instead of the browser's own confirm / alert windows).
//   if (await ask('Видалити запис?', { ok: 'Видалити', danger: true })) …
//   await tell('Готово');
// <DialogHost /> is mounted once in the app shell.
import { useEffect, useState } from 'react';
import { Modal } from './ui.jsx';

let show = null;

/** Ask a yes/no question; resolves true on «ok». Without a mounted host, resolves false. */
export function ask(message, { ok = 'Так', cancel = 'Скасувати', danger = false, title = '' } = {}) {
  return new Promise((res) => (show ? show({ message, ok, cancel, danger, title, res }) : res(false)));
}
/** Show a message with one button. */
export const tell = (message, { ok = 'Зрозуміло', title = '' } = {}) => ask(message, { ok, cancel: null, title });

export function DialogHost() {
  const [d, setD] = useState(null);
  useEffect(() => { show = (x) => setD(x); return () => { show = null; }; }, []);
  if (!d) return null;
  const close = (v) => { d.res(v); setD(null); };
  return (
    <Modal onClose={() => close(false)} label={d.title || 'Підтвердження'}>
      <div className="vx-drawer__body dlg">
        {d.title && <h2 className="vx-h2">{d.title}</h2>}
        <p className="dlg__text">{d.message}</p>
      </div>
      <div className="vx-drawer__foot">
        {d.cancel && <button className="vx-btn vx-btn--ghost" onClick={() => close(false)}>{d.cancel}</button>}
        <button className={`vx-btn ${d.danger ? 'vx-btn--danger' : 'vx-btn--primary'}`} autoFocus onClick={() => close(true)}>{d.ok}</button>
      </div>
    </Modal>
  );
}
