// A date field that follows the interface language: dd.mm.yyyy / дд.мм.рррр typed by hand, or picked from the
// calendar. The browser's own date field takes its format from the browser's language, not the platform's.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { isEn } from '../lib/locale.js';

const show = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
// «28.10.2026», «28/10/2026», «28-10-26», «2026-10-28» → «2026-10-28», or null.
export function parseDate(s) {
  const t = String(s || '').trim();
  let y, m, d;
  let x = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(t);
  if (x) [, y, m, d] = x;
  else if ((x = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/.exec(t))) { [, d, m, y] = x; if (y.length === 2) y = `20${y}`; } else return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso;
}

export function DateInput({ value, onChange, id, min, label, className = '' }) {
  const [text, setText] = useState(show(value));
  const picker = useRef(null);
  useEffect(() => { setText(show(value)); }, [value]);
  const bad = text && !parseDate(text);
  const commit = (t) => {
    if (!t.trim()) { onChange(''); return; }
    const iso = parseDate(t);
    if (iso && (!min || iso >= min)) onChange(iso);
  };
  return (
    <span className={`date-in ${className}`}>
      <input id={id} className={`vx-input vx-input--mono ${bad ? 'is-bad' : ''}`} inputMode="numeric" value={text} placeholder={isEn ? 'dd.mm.yyyy' : 'дд.мм.рррр'}
        aria-label={label} onChange={(e) => { setText(e.target.value); commit(e.target.value); }} onBlur={() => setText(show(value))} />
      <input ref={picker} type="date" className="date-in__native" tabIndex={-1} aria-hidden="true" value={value || ''} min={min}
        onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="vx-btn vx-btn--ghost vx-btn--icon vx-btn--sm date-in__btn" aria-label={isEn ? 'Calendar' : 'Календар'}
        onClick={() => { try { picker.current.showPicker(); } catch { picker.current.focus(); } }}><Icon name="calendar" size={16} /></button>
    </span>
  );
}
