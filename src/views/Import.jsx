// «Імпорт» into a register from CSV or Excel: match columns to fields, check, import in one audit entry.
import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { Modal } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { Loader } from '../brand/Mark.jsx';
import { CLEARANCE } from '../data/seed.js';
import { registerOf } from '../data/workspaces.js';
import { readTable, autoMap, importableFields, rowToRecord } from '../lib/importer.js';

const titleOfRec = (r) => { const reg = registerOf(r.div, r.col); return String((reg && r[reg.title]) || r.title || r.name || ''); };

export function ImportButton({ d, reg }) {
  const input = useRef(null);
  const [table, setTable] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useStore();
  const pick = async (f) => {
    if (!f) return;
    setBusy(true);
    try { setTable({ ...(await readTable(f)), name: f.name }); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <>
      <input ref={input} type="file" accept=".csv,.xlsx,text/csv" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
      <button className="vx-btn" disabled={busy} onClick={() => input.current.click()} title="CSV або Excel (.xlsx), перший рядок — назви стовпців">
        {busy ? <Loader size={16} /> : <><Icon name="upload" /> Імпорт</>}
      </button>
      {table && <ImportModal d={d} reg={reg} table={table} onClose={() => setTable(null)} />}
    </>
  );
}

function ImportModal({ d, reg, table, onClose }) {
  const { state, me, dispatch, toast } = useStore();
  const [map, setMap] = useState(() => autoMap(reg, table.head));
  const [level, setLevel] = useState(Math.min(reg.level ?? 0, me.clearance));
  const [skipSame, setSkipSame] = useState(true);
  const fields = importableFields(reg);
  const look = useMemo(() => ({
    users: state.users.filter((u) => u.status !== 'suspended'),
    recordsOf: (col) => (state.records || []).filter((r) => r.div === d.id && r.col === col && r.clearance <= me.clearance),
    titleOf: titleOfRec,
  }), [state.users, state.records, d.id, me.clearance]);
  const existing = useMemo(() => new Set((state.records || []).filter((r) => r.div === d.id && r.col === reg.id).map((r) => titleOfRec(r).toLowerCase())), [state.records, d.id, reg.id]);
  const checked = useMemo(() => table.rows.map((row, i) => {
    const { fields: f, problems } = rowToRecord(reg, row, map, look);
    const title = String(f[reg.title] || '').toLowerCase();
    return { i, f, problems, missing: problems.some((p) => p.startsWith('Немає обов')), same: !!title && existing.has(title) };
  }), [table.rows, map, look, reg, existing]);
  const toImport = checked.filter((c) => !c.missing && !(skipSame && c.same));
  const warned = checked.filter((c) => c.problems.length);

  const run = () => {
    const now = new Date().toISOString();
    const records = toImport.map((c, k) => ({
      id: `imp-${Date.now().toString(36)}-${k.toString(36)}`, div: d.id, col: reg.id, stage: reg.stages?.[0] ?? null,
      clearance: level, owner: me.id, at: now, updated: now, ...c.f,
    }));
    dispatch({ type: 'record/bulk', records, where: `${d.name} · ${reg.name}`, label: `імпорт з «${table.name}»: ${records.length}` });
    toast(`Імпортовано: ${records.length}`);
    onClose();
  };

  return (
    <Modal onClose={onClose} label="Імпорт">
      <div className="vx-drawer__head"><h2 className="vx-h2">Імпорт у «{reg.name}»</h2><div className="vx-hint">{table.name} · {table.rows.length} рядків</div></div>
      <div className="vx-drawer__body import">
        <div className="vx-eyebrow">Стовпці</div>
        <div className="import__map">
          {fields.map((f) => (
            <label key={f.id} className="import__row">
              <span>{f.label}{f.required && ' *'}</span>
              <select className="vx-select" value={map[f.id] ?? ''} onChange={(e) => setMap({ ...map, [f.id]: e.target.value === '' ? undefined : +e.target.value })}>
                <option value="">— не імпортувати —</option>
                {table.head.map((h, i) => <option key={i} value={i}>{h || `Стовпець ${i + 1}`}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="form-grid">
          <div className="vx-field">
            <label className="vx-label" htmlFor="imp-level">Гриф усіх записів</label>
            <select id="imp-level" className="vx-select" value={level} onChange={(e) => setLevel(+e.target.value)}>
              {CLEARANCE.filter((c) => c.id <= me.clearance).map((c) => <option key={c.id} value={c.id}>{c.full}</option>)}
            </select>
          </div>
          <label className="check import__skip"><input type="checkbox" checked={skipSame} onChange={(e) => setSkipSame(e.target.checked)} /> Пропускати наявні (за назвою)</label>
        </div>
        <div className="stack">
          <div><b>{toImport.length}</b> буде імпортовано{checked.filter((c) => c.missing).length ? ` · ${checked.filter((c) => c.missing).length} без обов’язкових полів` : ''}{skipSame && checked.filter((c) => c.same).length ? ` · ${checked.filter((c) => c.same).length} уже є` : ''}</div>
          {warned.slice(0, 5).map((c) => <div key={c.i} className="vx-hint">Рядок {c.i + 2}: {c.problems.join('; ')}</div>)}
          {warned.length > 5 && <div className="vx-hint">… і ще {warned.length - 5} рядків із зауваженнями</div>}
        </div>
      </div>
      <div className="vx-drawer__foot">
        <button className="vx-btn vx-btn--ghost" onClick={onClose}>Скасувати</button>
        <button className="vx-btn vx-btn--primary" disabled={!toImport.length} onClick={run}><Icon name="check" /> Імпортувати {toImport.length}</button>
      </div>
    </Modal>
  );
}
