// Intelligence · «Конвеєр»: watchlists → open sources (api/watch.js) → intake items with source and date.
import { useState } from 'react';
import { useStore, fmtDate, fmtAgo } from '../store.jsx';
import { Panel, ClassBadge, Status } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { Loader } from '../brand/Mark.jsx';
import { supabaseOn, authHeaders } from '../lib/supabase.js';

const openRecord = (go, r) => go('divisions', r.div, `${r.col}:${r.id}`);
const terms = (w) => String(w.terms || '').split(/\n/).filter((l) => l.trim()).length;

// The intake record a finding becomes — the same shape the daily job writes (scripts/lib/watch.mjs toIntake).
const toIntake = (f, sources) => ({
  id: `w-auto-${f.fingerprint.slice(0, 20)}`, div: 'int', col: 'intake', stage: 'Надійшло',
  title: f.title.slice(0, 300), source: sources[f.source].id, credibility: f.credibility, received: f.received,
  summary: f.summary, url: f.url, watchlist: f.watchlist, fingerprint: f.fingerprint, origin: 'auto', clearance: f.clearance,
});
const toSource = (s) => ({ ...s, div: 'int', col: 'sources', state: 'Активне', clearance: 0 });

export function WatchView({ access, go }) {
  const { state, me, dispatch, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const records = state.records || [];
  const lists = records.filter((r) => r.div === 'int' && r.col === 'watchlists' && r.clearance <= me.clearance);
  const active = lists.filter((w) => (w.state || 'Активний') === 'Активний');
  const found = records.filter((r) => r.col === 'intake' && r.origin === 'auto' && r.clearance <= me.clearance)
    .sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 40);
  const listName = (id) => lists.find((w) => w.id === id)?.name || '—';

  const run = async () => {
    setBusy(true); setLast(null);
    try {
      const res = await fetch(new URL('api/watch', document.baseURI), {
        method: 'POST',
        headers: supabaseOn ? await authHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlists: active.map(({ id, name, kind, terms: t, feeds, clearance }) => ({ id, name, kind, terms: t, feeds, clearance })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || (res.status === 404 ? 'Серверна функція недоступна (працює лише на Vercel)' : `HTTP ${res.status}`));
      const have = new Set(records.filter((r) => r.col === 'intake' && r.fingerprint).map((r) => r.fingerprint));
      const fresh = body.findings.filter((f) => !have.has(f.fingerprint));
      const needSources = [...new Set(fresh.map((f) => f.source))].map((k) => body.sources[k]).filter((s) => !records.some((r) => r.id === s.id));
      const now = new Date().toISOString();
      const patches = active.map((w) => ({ id: w.id, patch: { lastRun: now, lastFound: fresh.filter((f) => f.watchlist === w.id).length } }));
      dispatch({
        type: 'record/bulk', where: 'Розвідка · Конвеєр', label: `запуск: ${active.length} списків, нових надходжень ${fresh.length}`,
        records: [...needSources.map(toSource), ...fresh.map((f) => toIntake(f, body.sources))], patches,
      });
      setLast({ total: body.findings.length, fresh: fresh.length, errors: body.errors || [] });
      toast(fresh.length ? `Нових надходжень: ${fresh.length}` : 'Нового не знайдено');
    } catch (e) {
      setLast({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <Panel title="Конвеєр спостереження" action={access.canEdit && (
        <button className="vx-btn vx-btn--primary" onClick={run} disabled={busy || !active.length}>
          {busy ? <Loader size={18} label="Пошук" /> : <><Icon name="refresh" /> Запустити зараз</>}
        </button>
      )}>
        <div className="stack">
          <div className="vx-hint">
            Щодня зранку конвеєр перевіряє відкриті джерела за активними списками спостереження й додає знахідки в «Опрацювання» на етап «Надійшло» — з посиланням, датою, джерелом і попередньою оцінкою достовірності. Аналітик підтверджує, відкидає або бере в роботу.
          </div>
          <ul className="watch-sources">
            <li><b>Медіа</b> — GDELT (світовий індекс новин, 65+ мов) і ваші RSS-стрічки.</li>
            <li><b>Контрагенти й санкції</b> — санкційні списки OFAC (США) і ЄС: збіг за назвою (з транслітерацією) або за кодом.</li>
          </ul>
          {last && (last.error ? <div className="vx-error">{last.error}</div> : (
            <div className="stack">
              <Status kind="ok">Знайдено {last.total}, нових {last.fresh}</Status>
              {last.errors.map((e, i) => <Status key={i} kind="warn">{e.source}: {e.message}</Status>)}
            </div>
          ))}
          {!active.length && <div className="vx-hint">Немає активних списків. Додайте їх у вкладці «Списки спостереження».</div>}
        </div>
      </Panel>

      <Panel title={`Списки · ${lists.length}`} bodyClass="vx-table-wrap" action={<button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => go('divisions', 'int', 'watchlists')}>Керувати <Icon name="chevron" /></button>}>
        <table className="vx-table">
          <thead><tr><th>Список</th><th>Що шукати</th><th>Об’єктів</th><th>Стан</th><th>Останній запуск</th><th>Нових</th><th>Гриф</th></tr></thead>
          <tbody>
            {lists.map((w) => (
              <tr key={w.id} className="is-clickable" onClick={() => openRecord(go, w)}>
                <td>{w.name}</td><td>{w.kind}</td><td className="vx-num">{terms(w)}</td><td>{w.state || 'Активний'}</td>
                <td className="vx-hint">{w.lastRun ? fmtAgo(w.lastRun) : 'ще не запускався'}</td>
                <td className="vx-num">{w.lastFound ?? '—'}</td>
                <td><ClassBadge level={w.clearance} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lists.length && <div className="vx-empty"><Icon name="eye" /><div>Списків спостереження ще немає</div></div>}
      </Panel>

      <Panel title="Останні знахідки" bodyClass="list">
        {found.map((r) => (
          <button key={r.id} className="list__row list__row--btn list__row--top" onClick={() => openRecord(go, r)}>
            <Icon name={r.source === 'w-src-ofac' || r.source === 'w-src-eu' ? 'shield' : 'layers'} size={16} />
            <span className="list__text">
              <span>{r.title}</span>
              <span className="vx-hint">{listName(r.watchlist)} · {r.stage} · {fmtDate(r.received, false)}{r.url ? ` · ${(() => { try { return new URL(r.url).host; } catch { return ''; } })()}` : ''}</span>
            </span>
          </button>
        ))}
        {!found.length && <div className="list__row vx-hint">Знахідок ще немає.</div>}
      </Panel>

      <div className="vx-hint">
        Лише відкриті й офіційні джерела. Об’єкти спостереження — компанії, ринки, теми; не приватні особи. Список спостереження сам є UMBRA: він показує інтереси компанії.
        Збіг назви з санкційним списком — привід перевірити, а не висновок.
      </div>
    </div>
  );
}
