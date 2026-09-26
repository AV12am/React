import { useState } from 'react';
import { useStore, fmtDate } from '../store.jsx';
import { Panel, Avatar } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const TYPES = { auth: 'Вхід', access: 'Доступ', vault: 'Сховище', security: 'Безпека', system: 'Система' };

// A short, stable fingerprint so each entry can be cited in reports.
const fp = (e) => {
  let h = 2166136261;
  for (const c of `${e.at}|${e.actor}|${e.text}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
};

export function Audit() {
  const { state, dispatch, userById, toast } = useStore();
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const rows = state.audit.filter((e) => (type === 'all' || e.type === type)
    && `${e.text} ${userById(e.actor)?.name ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  const exportCsv = () => {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Час', 'Відбиток', 'Користувач', 'Код', 'Тип', 'Подія'].map(esc).join(',')]
      .concat(rows.map((e) => {
        const u = userById(e.actor);
        return [fmtDate(e.at), fp(e), u?.name ?? 'Система', u?.code ?? '', TYPES[e.type], e.text].map(esc).join(',');
      }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }));
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    dispatch({ type: 'audit/export' });
    toast(`Експортовано ${rows.length} записів`);
  };

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">Кожна дія фіксується</div>
          <h1 className="vx-h1">Журнал аудиту</h1>
        </div>
        <button className="vx-btn" onClick={exportCsv}><Icon name="download" /> Експорт CSV</button>
      </header>
      <div className="toolbar">
        <div className="vx-search toolbar__grow">
          <Icon name="search" />
          <input className="vx-input" placeholder="Пошук у журналі" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Пошук у журналі" />
        </div>
        <div className="segmented" role="group" aria-label="Тип подій">
          <button className={type === 'all' ? 'is-active' : ''} onClick={() => setType('all')}>Усі</button>
          {Object.entries(TYPES).map(([k, l]) => <button key={k} className={type === k ? 'is-active' : ''} onClick={() => setType(k)}>{l}</button>)}
        </div>
      </div>
      <Panel bodyClass="vx-table-wrap">
        <table className="vx-table">
          <thead><tr><th>Час</th><th>Користувач</th><th>Тип</th><th>Подія</th><th>Відбиток</th></tr></thead>
          <tbody>
            {rows.map((e) => {
              const u = userById(e.actor);
              return (
                <tr key={e.id}>
                  <td className="vx-hint vx-num nowrap">{fmtDate(e.at)}</td>
                  <td><div className="cell-person">{u ? <Avatar name={u.name} /> : <span className="vx-avatar"><Icon name="cpu" size={14} /></span>}<span className="nowrap">{u?.name ?? 'Система'}</span></div></td>
                  <td><span className="vx-tag">{TYPES[e.type]}</span></td>
                  <td>{e.text}</td>
                  <td className="vx-mono vx-muted">{fp(e)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="vx-empty"><Icon name="audit" /> Записів не знайдено</div>}
      </Panel>
    </div>
  );
}
