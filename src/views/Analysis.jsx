// Analytics screens: the «звідки ми це знаємо» chain in a record, the review queue, forecasts and calibration.
import { useMemo, useState } from 'react';
import { useStore, fmtDate, fmtAgo } from '../store.jsx';
import { Panel, ClassBadge, Status, Avatar } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { registerOf, OUTCOMES } from '../data/workspaces.js';
import { chainOf, reasonsFor, usedBy, reviewQueue, isOpen, attention } from '../lib/provenance.js';
import { OrgExtras } from './Orgs.jsx';
import { wordFor, isForecast, outcomeValue, calibration, summary, byAnalyst, brier, skill } from '../lib/forecast.js';

const titleOf = (r) => {
  const reg = registerOf(r.div, r.col);
  const v = reg && r[reg.title];
  return v == null || v === '' ? 'Без назви' : String(v);
};
const openRecord = (go, r) => go('divisions', r.div, `${r.col}:${r.id}`);
const Redacted = () => <span className="vx-redacted" title="Гриф вище вашого допуску">{'█'.repeat(10)}</span>;
const grade = (intake, source) => `${source?.reliability?.[0] || '?'}${intake?.credibility?.[0] || '?'}`;
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const num = (x, d = 2) => (x == null ? '—' : x.toFixed(d));

/* ---------- inside a record ---------- */

function Reasons({ reasons }) {
  if (!reasons.length) return <Status kind="ok">Ланцюг без змін з останнього перегляду</Status>;
  return (
    <ul className="chain__reasons">
      {reasons.map((r, i) => <li key={i}><Status kind={r.kind === 'review' ? 'danger' : r.kind === 'due' ? 'info' : 'warn'}>{r.text}</Status></li>)}
    </ul>
  );
}

function ChainList({ record, go }) {
  const { state, me } = useStore();
  const chain = chainOf(record, state.records || []);
  if (!chain.length) return <div className="vx-hint">Підстав не вказано. Додайте надходження або джерела в полі «Підстави», щоб знати, на чому тримається висновок.</div>;
  return (
    <ol className="chain">
      {chain.map(({ id, record: b, source }) => (
        <li key={id} className="chain__item">
          {!b ? <span className="vx-hint">Підставу видалено</span> : b.clearance > me.clearance ? <><Redacted /> <ClassBadge level={b.clearance} /></> : (
            <>
              <button type="button" className="ws-link" onClick={() => openRecord(go, b)}>{titleOf(b)}</button>
              <span className="chain__meta">
                <ClassBadge level={b.clearance} />
                {b.col === 'intake' && <span className="vx-tag vx-mono" title="Надійність джерела + достовірність інформації">{grade(b, source && source.clearance <= me.clearance ? source : null)}</span>}
                {b.col === 'sources' && <span className="vx-tag">джерело · {b.reliability?.[0] || '?'}</span>}
                <span className="vx-hint">змінено {fmtAgo(b.updated)}</span>
              </span>
              {source && (source.clearance > me.clearance
                ? <div className="chain__source vx-hint">↳ джерело вищого грифа</div>
                : <div className="chain__source vx-hint">↳ джерело: <button type="button" className="ws-link" onClick={() => openRecord(go, source)}>{titleOf(source)}</button> · {source.reliability || 'не оцінено'}{source.state ? ` · ${source.state.toLowerCase()}` : ''}</div>)}
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

function Resolve({ record, canEdit }) {
  const { me, dispatch } = useStore();
  if (!isForecast(record)) return null;
  const where = 'Аналітика · Судження';
  const set = (outcome) => dispatch({
    type: 'record/update', id: record.id, where, label: record.statement, note: `прогноз: ${outcome.toLowerCase()}`,
    patch: { outcome, resolvedAt: new Date().toISOString(), resolvedBy: me.id },
  });
  const o = outcomeValue(record);
  return (
    <div className="stack">
      <div className="vx-eyebrow">Прогноз</div>
      <div>{record.probability}% — {wordFor(record.probability)}{record.due ? `, перевірка ${fmtDate(record.due, false)}` : ''}</div>
      {isOpen(record) ? (canEdit ? (
        <div className="toolbar">
          {OUTCOMES.slice(1).map((x) => <button key={x} className="vx-btn vx-btn--sm" onClick={() => set(x)}>{x}</button>)}
        </div>
      ) : <div className="vx-hint">Результат фіксує аналітик або керівник напряму.</div>) : (
        <div className="vx-hint">
          Результат: <b>{record.outcome}</b>{record.resolvedAt ? ` · ${fmtDate(record.resolvedAt, false)}` : ''}
          {o != null && ` · внесок у бал Браєра ${num((record.probability / 100 - o) ** 2, 3)}`}
        </div>
      )}
    </div>
  );
}

/** Extra sections in a record's drawer: the chain and its flags (products, judgments), what relies on it (intake, sources). */
export function RecordExtras({ reg, record, canEdit, go }) {
  const { state, me, dispatch } = useStore();
  const records = state.records || [];
  if (reg.id === 'judgments' || reg.id === 'products') {
    const reasons = reasonsFor(record, records, me);
    const indicators = reg.id === 'judgments' ? records.filter((r) => r.col === 'indicators' && r.judgment === record.id) : [];
    const review = () => dispatch({ type: 'record/update', id: record.id, patch: { reviewed: new Date().toISOString() }, where: `Аналітика · ${reg.name}`, label: titleOf(record), note: 'переглянуто ланцюг підстав' });
    return (
      <>
        {reg.id === 'judgments' && <Resolve record={record} canEdit={canEdit} />}
        <div className="stack">
          <div className="vx-eyebrow">Звідки ми це знаємо</div>
          <ChainList record={record} go={go} />
          <Reasons reasons={reasons} />
          {canEdit && reasons.some((r) => r.kind === 'review') && (
            <button className="vx-btn vx-btn--sm" onClick={review}><Icon name="check" /> Переглянуто — висновок у силі</button>
          )}
          {record.reviewed && <div className="vx-hint">Останній перегляд: {fmtDate(record.reviewed)}</div>}
        </div>
        {reg.id === 'judgments' && (
          <div className="stack">
            <div className="vx-eyebrow">Індикатори</div>
            {indicators.length ? (
              <ul className="chain__reasons">
                {indicators.map((i) => (i.clearance > me.clearance ? <li key={i.id}><Redacted /></li> : (
                  <li key={i.id}>
                    <button type="button" className="ws-link" onClick={() => openRecord(go, i)}>{i.name}</button>{' '}
                    <span className="vx-hint">· {i.state || 'Не спостерігається'}{i.effect ? ` · ${i.effect.toLowerCase()}` : ''}</span>
                  </li>
                )))}
              </ul>
            ) : <div className="vx-hint">Немає індикаторів. Додайте у вкладці «Індикатори», що саме покаже, що судження треба переглянути.</div>}
          </div>
        )}
      </>
    );
  }
  if (reg.id === 'orgs') {
    const deps = usedBy(record.id, records).filter((r) => r.clearance <= me.clearance);
    const about = records.filter((r) => r.col === 'intake' && r.org === record.id && r.clearance <= me.clearance);
    return (
      <>
        <OrgExtras record={record} />
        <div className="stack">
          <div className="vx-eyebrow">Пов’язані записи</div>
          {deps.length || about.length ? (
            <ul className="chain__reasons">
              {[...about, ...deps].map((r) => <li key={r.id}><span className="vx-tag">{registerOf(r.div, r.col)?.one}</span> <button type="button" className="ws-link" onClick={() => openRecord(go, r)}>{titleOf(r)}</button></li>)}
            </ul>
          ) : <div className="vx-hint">Надходжень і суджень про цю організацію ще немає.</div>}
        </div>
      </>
    );
  }
  if (reg.id === 'intake' || reg.id === 'sources') {
    const deps = usedBy(record.id, records);
    const visible = deps.filter((r) => r.clearance <= me.clearance);
    return (
      <div className="stack">
        <div className="vx-eyebrow">На цьому тримається</div>
        {deps.length ? <>
          <ul className="chain__reasons">
            {visible.map((r) => <li key={r.id}><span className="vx-tag">{registerOf(r.div, r.col)?.one}</span> <button type="button" className="ws-link" onClick={() => openRecord(go, r)}>{titleOf(r)}</button></li>)}
            {deps.length > visible.length && <li className="vx-hint">і ще {deps.length - visible.length} вищого грифа</li>}
          </ul>
          <div className="vx-hint">Зміна {reg.id === 'sources' ? 'оцінки джерела' : 'цього надходження'} позначить їх для перегляду.</div>
        </> : <div className="vx-hint">Жоден продукт чи судження ще не посилається на цей запис.</div>}
      </div>
    );
  }
  return null;
}

/* ---------- review queue ---------- */

export function ReviewView({ access, go }) {
  const { state, me, dispatch } = useStore();
  const [mine, setMine] = useState(false);
  const records = state.records || [];
  const queue = reviewQueue(records, me).filter((x) => !mine || (x.record.analyst || x.record.owner) === me.id);
  const toReview = queue.filter((x) => x.reasons.some(attention));
  const onlyWarn = queue.filter((x) => !x.reasons.some(attention));
  const review = (r) => dispatch({ type: 'record/update', id: r.id, patch: { reviewed: new Date().toISOString() }, where: `Аналітика · ${registerOf(r.div, r.col).name}`, label: titleOf(r), note: 'переглянуто ланцюг підстав' });
  const Item = ({ x }) => {
    const who = state.users.find((u) => u.id === (x.record.analyst || x.record.owner));
    return (
      <div className="review-item">
        <div className="review-item__head">
          <span className="vx-tag">{registerOf(x.record.div, x.record.col).one}</span>
          <button className="ws-link review-item__title" onClick={() => openRecord(go, x.record)}>{titleOf(x.record)}</button>
          <ClassBadge level={x.record.clearance} />
        </div>
        <Reasons reasons={x.reasons} />
        <div className="review-item__foot">
          <span className="vx-hint">{who ? who.name : '—'} · змінено {fmtAgo(x.record.updated)}</span>
          {access.canEdit && x.reasons.some((r) => r.kind === 'review') && <button className="vx-btn vx-btn--sm" onClick={() => review(x.record)}><Icon name="check" /> Переглянуто</button>}
        </div>
      </div>
    );
  };
  return (
    <div className="stack">
      <div className="toolbar">
        <div className="vx-hint toolbar__grow">
          Судження й продукти, у ланцюгу підстав яких щось змінилося з останнього перегляду: переоцінено джерело, змінено або видалено надходження, спрацював індикатор, настала дата прогнозу.
        </div>
        <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Лише мої</label>
      </div>
      <Panel title={`Потребує перегляду · ${toReview.length}`}>
        {toReview.length ? <div className="review-list">{toReview.map((x) => <Item key={x.record.id} x={x} />)}</div>
          : <div className="vx-empty"><Icon name="ok" /><div>Усі висновки актуальні</div></div>}
      </Panel>
      {!!onlyWarn.length && (
        <Panel title={`Слабкі підстави · ${onlyWarn.length}`}>
          <div className="review-list">{onlyWarn.map((x) => <Item key={x.record.id} x={x} />)}</div>
        </Panel>
      )}
    </div>
  );
}

/* ---------- forecasts and calibration ---------- */

function CalibrationChart({ bins }) {
  const [hover, setHover] = useState(null);
  const W = 330, H = 320, P = 50;
  const x = (v) => P + v * (W - P - 12);
  const y = (v) => H - P - v * (H - P - 12);
  const pts = bins.filter((b) => b.n);
  const maxN = Math.max(1, ...pts.map((b) => b.n));
  return (
    <div className="calib">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Калібрування: передбачена ймовірність проти частоти подій">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t} className="calib__grid">
            <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} />
            <text x={P - 6} y={y(t) + 4} textAnchor="end">{t * 100}%</text>
            <text x={x(t)} y={H - P + 16} textAnchor="middle">{t * 100}%</text>
          </g>
        ))}
        <line className="calib__ideal" x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} />
        <text className="calib__label" x={x(0.2)} y={y(0.24)} transform={`rotate(-45 ${x(0.2)} ${y(0.24)})`}>ідеальне калібрування</text>
        {pts.map((b) => (
          <g key={b.from} onMouseEnter={() => setHover(b)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(b)} onBlur={() => setHover(null)} tabIndex={0}>
            <circle className="calib__hit" cx={x(b.mean)} cy={y(b.freq)} r={16} />
            <circle className="calib__dot" cx={x(b.mean)} cy={y(b.freq)} r={5 + 5 * Math.sqrt(b.n / maxN)} />
          </g>
        ))}
        <text className="calib__axis" x={(x(0) + x(1)) / 2} y={H - 2} textAnchor="middle">передбачена ймовірність</text>
        <text className="calib__axis" x={10} y={(y(0) + y(1)) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(y(0) + y(1)) / 2})`}>як часто справдилося</text>
      </svg>
      {hover && (
        <div className="calib__tip" style={{ left: `${(x(hover.mean) / W) * 100}%`, top: `${(y(hover.freq) / H) * 100}%` }}>
          <b>{hover.from}–{hover.to}%</b><br />прогнозів: {hover.n}<br />у середньому: {pct(hover.mean)}<br />справдилося: {pct(hover.freq)}
        </div>
      )}
    </div>
  );
}

export function ForecastsView({ access, go }) {
  const { state, me, dispatch } = useStore();
  const records = (state.records || []).filter((r) => r.clearance <= me.clearance);
  const forecasts = records.filter(isForecast);
  const s = summary(forecasts);
  const today = new Date().toISOString().slice(0, 10);
  const due = forecasts.filter((r) => isOpen(r) && r.due && r.due <= today).sort((a, b) => a.due.localeCompare(b.due));
  const upcoming = forecasts.filter((r) => isOpen(r) && (!r.due || r.due > today)).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const resolved = forecasts.filter((r) => !isOpen(r)).sort((a, b) => (b.resolvedAt || '').localeCompare(a.resolvedAt || ''));
  const bins = useMemo(() => calibration(forecasts), [forecasts]);
  const people = byAnalyst(forecasts);
  const userName = (id) => state.users.find((u) => u.id === id)?.name || '—';
  const set = (r, outcome) => dispatch({ type: 'record/update', id: r.id, where: 'Аналітика · Судження', label: r.statement, note: `прогноз: ${outcome.toLowerCase()}`, patch: { outcome, resolvedAt: new Date().toISOString(), resolvedBy: me.id } });
  const b = brier(forecasts);

  const Row = ({ r, resolve }) => (
    <tr className="is-clickable" onClick={() => openRecord(go, r)}>
      <td>{r.statement}</td>
      <td className="vx-num">{r.probability}% <span className="vx-hint">{wordFor(r.probability)}</span></td>
      <td className="vx-num">{r.due ? fmtDate(r.due, false) : '—'}</td>
      <td>{userName(r.analyst || r.owner)}</td>
      <td onClick={(e) => e.stopPropagation()}>
        {resolve && access.canEdit ? <span className="row-btns">{OUTCOMES.slice(1).map((o) => <button key={o} className="vx-btn vx-btn--sm" onClick={() => set(r, o)}>{o}</button>)}</span>
          : r.outcome && r.outcome !== 'Відкрито' ? <Status kind={r.outcome === 'Сталося' ? 'ok' : r.outcome === 'Не сталося' ? 'danger' : 'idle'}>{r.outcome}</Status> : <span className="vx-hint">відкрито</span>}
      </td>
    </tr>
  );
  const Table = ({ rows, resolve }) => (
    <table className="vx-table">
      <thead><tr><th>Прогноз</th><th>Ймовірність</th><th>Перевірка</th><th>Аналітик</th><th>Результат</th></tr></thead>
      <tbody>{rows.map((r) => <Row key={r.id} r={r} resolve={resolve} />)}</tbody>
    </table>
  );

  return (
    <div className="stack">
      <div className="grid grid--stats grid--4 vx-panel">
        <div className="vx-stat"><div className="vx-stat__label">Прогнозів</div><div className="vx-stat__value">{s.total}</div><div className="vx-hint">{s.open} відкритих</div></div>
        <div className="vx-stat"><div className="vx-stat__label">Чекають результату</div><div className="vx-stat__value">{s.due}</div><div className="vx-hint">настала дата перевірки</div></div>
        <div className="vx-stat"><div className="vx-stat__label">Бал Браєра</div><div className="vx-stat__value">{num(b)}</div><div className="vx-hint">0 — ідеально, 0.25 — «завжди 50%»</div></div>
        <div className="vx-stat"><div className="vx-stat__label">Навичка</div><div className="vx-stat__value">{b == null ? '—' : pct(skill(b))}</div><div className="vx-hint">краще за монетку на цю частку · {s.resolved} вирішених</div></div>
      </div>

      {!!due.length && <Panel title={`Настала дата перевірки · ${due.length}`} bodyClass="vx-table-wrap"><Table rows={due} resolve /></Panel>}

      <div className="grid grid--2">
        <Panel title="Калібрування команди">
          <div className="stack">
            {s.resolved ? <CalibrationChart bins={bins} /> : <div className="vx-empty"><Icon name="target" /><div>Ще немає вирішених прогнозів</div></div>}
            <div className="vx-hint">Точки на діагоналі — аналітики кажуть «70%», і справджується ~70%. Нижче діагоналі — надто впевнені, вище — надто обережні. Показово від ~20 вирішених прогнозів.</div>
          </div>
        </Panel>
        <Panel title="Аналітики" bodyClass="vx-table-wrap">
          <table className="vx-table">
            <thead><tr><th>Аналітик</th><th>Прогнозів</th><th>Вирішено</th><th>Браєр</th><th>Навичка</th><th>Схильність</th></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.analyst}>
                  <td><div className="cell-person"><Avatar name={userName(p.analyst)} /> {userName(p.analyst)}</div></td>
                  <td className="vx-num">{p.total}</td>
                  <td className="vx-num">{p.resolved}</td>
                  <td className="vx-num">{num(p.brier)}</td>
                  <td className="vx-num">{p.skill == null ? '—' : pct(p.skill)}</td>
                  <td>{p.over == null ? <span className="vx-hint">мало даних</span> : p.over > 0.05 ? 'надто впевнений' : p.over < -0.05 ? 'надто обережний' : 'збалансований'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!people.length && <div className="vx-empty"><div>Прогнози з’являться, коли в «Судженнях» буде тип «Прогноз»</div></div>}
        </Panel>
      </div>

      {s.resolved > 0 && (
        <Panel title="Дані калібрування" bodyClass="vx-table-wrap">
          <table className="vx-table">
            <thead><tr><th>Діапазон</th><th>Прогнозів</th><th>Середня ймовірність</th><th>Справдилося</th></tr></thead>
            <tbody>{bins.filter((x) => x.n).map((x) => <tr key={x.from}><td>{x.from}–{x.to}%</td><td className="vx-num">{x.n}</td><td className="vx-num">{pct(x.mean)}</td><td className="vx-num">{pct(x.freq)}</td></tr>)}</tbody>
          </table>
        </Panel>
      )}

      <Panel title={`Відкриті прогнози · ${upcoming.length}`} bodyClass="vx-table-wrap">
        {upcoming.length ? <Table rows={upcoming} /> : <div className="vx-empty"><div>Немає відкритих прогнозів</div></div>}
      </Panel>
      {!!resolved.length && <Panel title={`Вирішені · ${resolved.length}`} bodyClass="vx-table-wrap"><Table rows={resolved.slice(0, 50)} /></Panel>}
    </div>
  );
}

/** How many judgments and products need review — for the analytics overview. */
export const reviewCount = (records, me) => reviewQueue(records, me).filter((x) => x.reasons.some(attention)).length;
