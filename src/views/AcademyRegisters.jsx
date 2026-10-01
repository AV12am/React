// Academy workspace: the built-in curriculum shown in its registers, above what the team adds itself.
//   Матеріали  — every course text, by track, basic → advanced
//   Курси      — the eight tracks as programmes, with this person's progress
//   Атестації  — test results of the team (who passed what, when, with what score)
import { useState } from 'react';
import { useStore, fmtDate } from '../store.jsx';
import { Panel, Status, Avatar } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { CLEARANCE } from '../data/seed.js';
import { TRACKS, COURSES, GRADES, REQUIRED, resultOf } from '../data/academy/meta.js';

const GRADE_ORDER = { Б: 0, С: 1, П: 2 };
const UNLOCKS = Object.fromEntries(Object.entries(REQUIRED).flatMap(([lvl, ids]) => ids.map((id) => [id, +lvl])));
// Learning order: tracks as listed; within a track basic → intermediate → advanced, then in the order written.
export const sortedCourses = (track) => COURSES
  .map((c, i) => ({ ...c, i }))
  .filter((c) => !track || c.track === track)
  .sort((a, b) => TRACKS.findIndex((t) => t.id === a.track) - TRACKS.findIndex((t) => t.id === b.track)
    || GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || a.i - b.i);

function Mark({ user, id }) {
  const r = resultOf(user, id);
  if (!r) return <span className="vx-hint">не пройдено</span>;
  if (r.fresh) return <Status kind="ok">{r.best}%</Status>;
  return <Status kind={r.passed ? 'warn' : 'danger'}>{r.passed ? 'оновити' : `${r.best}%`}</Status>;
}

function Materials({ go }) {
  const { me } = useStore();
  const [track, setTrack] = useState('');
  const list = sortedCourses(track);
  return (
    <Panel title={`Програма Академії · ${COURSES.length} матеріалів`} bodyClass="vx-table-wrap"
      action={<button className="vx-btn vx-btn--ghost vx-btn--sm" onClick={() => go('learn')}>Навчання й тести <Icon name="chevron" /></button>}>
      <div className="acad-filter">
        <div className="segmented" role="group" aria-label="Трек">
          <button className={!track ? 'is-active' : ''} onClick={() => setTrack('')}>Усі</button>
          {TRACKS.map((t) => <button key={t.id} className={track === t.id ? 'is-active' : ''} onClick={() => setTrack(t.id)}>{t.name}</button>)}
        </div>
      </div>
      <table className="vx-table">
        <thead><tr><th>Матеріал</th><th>Трек</th><th>Рівень</th><th>Тривалість</th><th>Обов’язковий</th><th>Мій результат</th></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id} className="is-clickable" onClick={() => go('learn', c.id)}>
              <td>{c.title}</td>
              <td className="vx-hint">{TRACKS.find((t) => t.id === c.track).name}</td>
              <td>{GRADES[c.grade]}</td>
              <td className="vx-num">{c.minutes} хв</td>
              <td>{UNLOCKS[c.id] ? <span className="vx-tag">для {CLEARANCE[UNLOCKS[c.id]].short}</span> : <span className="vx-hint">—</span>}</td>
              <td><Mark user={me} id={c.id} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Programs({ go }) {
  const { me } = useStore();
  return (
    <div className="grid grid--2">
      {TRACKS.map((t) => {
        const list = sortedCourses(t.id);
        const done = list.filter((c) => resultOf(me, c.id)?.fresh).length;
        const minutes = list.reduce((a, c) => a + c.minutes, 0);
        return (
          <Panel key={t.id} title={t.name} action={<span className="vx-hint vx-num">{done} / {list.length}</span>}>
            <div className="stack">
              <div className="vx-hint">{t.about}</div>
              <div className="vx-meter vx-meter--brass"><span style={{ width: `${(done / list.length) * 100}%` }} /></div>
              <ol className="acad-program">
                {list.map((c) => (
                  <li key={c.id}>
                    <button className="ws-link" onClick={() => go('learn', c.id)}>{c.title}</button>
                    <span className="vx-hint"> · {GRADES[c.grade].toLowerCase()} · {c.minutes} хв</span>
                    {resultOf(me, c.id)?.fresh && <Icon name="check" size={14} className="acad-done" />}
                  </li>
                ))}
              </ol>
              <div className="vx-hint">Разом ≈ {Math.round(minutes / 6) / 10} год</div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function Results({ go }) {
  const { state, me } = useStore();
  const all = me.role === 'admin' || me.role === 'lead';
  const people = state.users.filter((u) => u.status !== 'suspended' && (all ? me.role === 'admin' || u.division === me.division : u.id === me.id));
  const rows = people.flatMap((u) => Object.keys(u.training || {}).map((id) => ({ u, c: COURSES.find((x) => x.id === id), r: resultOf(u, id) })))
    .filter((x) => x.c)
    .sort((a, b) => (b.r.tried || b.r.at || '').localeCompare(a.r.tried || a.r.at || ''));
  return (
    <Panel title={`Результати тестів · ${rows.length}`} bodyClass="vx-table-wrap">
      <table className="vx-table">
        <thead><tr><th>Хто</th><th>Курс</th><th>Найкращий результат</th><th>Спроб</th><th>Складено</th><th>Статус</th></tr></thead>
        <tbody>
          {rows.map(({ u, c, r }) => (
            <tr key={`${u.id}-${c.id}`} className="is-clickable" onClick={() => go('learn', c.id)}>
              <td><div className="cell-person"><Avatar name={u.name} /> {u.name}</div></td>
              <td>{c.title}</td>
              <td className="vx-num">{r.best}%</td>
              <td className="vx-num">{r.attempts}</td>
              <td className="vx-num">{r.at ? fmtDate(r.at, false) : '—'}</td>
              <td>{r.fresh ? <Status kind="ok">Чинна</Status> : r.passed ? <Status kind="warn">Потрібно оновити</Status> : <Status kind="danger">Не складено</Status>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="vx-empty"><Icon name="check" /><div>Тестів ще не проходили. Почніть у «Навчанні».</div></div>}
    </Panel>
  );
}

/** Built-in sections by register: shown above the register's own records. */
export const BUILTIN = { 'acad:materials': Materials, 'acad:courses': Programs, 'acad:certs': Results };
export const BUILTIN_NOTE = {
  'acad:materials': 'Власні матеріали команди',
  'acad:courses': 'Очні курси й набори',
  'acad:certs': 'Атестації, внесені вручну',
};
/** For the overview tiles: how many built-in items a register has. */
export const builtinCount = (div, col, users) => (
  div === 'acad' && col === 'materials' ? COURSES.length
    : div === 'acad' && col === 'courses' ? TRACKS.length
      : div === 'acad' && col === 'certs' ? users.reduce((a, u) => a + Object.keys(u.training || {}).length, 0) : 0
);
