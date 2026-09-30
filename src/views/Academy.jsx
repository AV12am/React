import { useEffect, useMemo, useState } from 'react';
import { useStore, fmtDate } from '../store.jsx';
import { Panel, ClassBadge, Status, Avatar } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { Loader } from '../brand/Mark.jsx';
import { CLEARANCE, DIVISIONS } from '../data/seed.js';
import { MAX_LEVEL } from '../data/clearance.js';
import { TRACKS, COURSES, GRADES, PASS, REQUIRED, courseById, resultOf, missingFor, loadTrack } from '../data/academy/meta.js';

// Which clearance a course unlocks, if any: { [courseId]: level }.
const UNLOCKS = Object.fromEntries(Object.entries(REQUIRED).flatMap(([lvl, ids]) => ids.map((id) => [id, +lvl])));

/** Training — Academy courses with tests. `focus`: a course id. */
export function Learn({ focus, go }) {
  const course = focus && courseById(focus);
  return course ? <Course key={course.id} course={course} go={go} /> : <Catalogue go={go} />;
}

/* ---------- catalogue ---------- */

function CourseStatus({ user, id }) {
  const r = resultOf(user, id);
  if (!r) return <span className="vx-hint">Не пройдено</span>;
  if (r.fresh) return <Status kind="ok">Складено · {r.best}%</Status>;
  if (r.passed) return <Status kind="warn">Потрібно оновити</Status>;
  return <Status kind="danger">Не складено · {r.best}%</Status>;
}

function Catalogue({ go }) {
  const { state, me } = useStore();
  const passed = COURSES.filter((c) => resultOf(me, c.id)?.fresh).length;
  const next = me.clearance < MAX_LEVEL ? me.clearance + 1 : null;
  const missing = next != null ? missingFor(me, next) : [];
  const canSeeTeam = me.role === 'admin' || me.role === 'lead';

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">Академія</div>
          <h1 className="vx-h1">Навчання</h1>
        </div>
        <div className="learn-progress">
          <span className="vx-mono">{passed} / {COURSES.length}</span>
          <span className="vx-hint">курсів складено</span>
          <div className="vx-meter vx-meter--brass"><span style={{ width: `${(passed / COURSES.length) * 100}%` }} /></div>
        </div>
      </header>

      {next != null && (
        <Panel title={`Для допуску ${CLEARANCE[next].short}`} action={<ClassBadge level={next} />}>
          <div className="stack">
            <div className="vx-hint">
              {missing.length
                ? `Щоб подати запит на ${CLEARANCE[next].short}, складіть обов’язкові курси. Тест складено, якщо правильних відповідей щонайменше ${Math.round(PASS * 100)}%; результат дійсний рік.`
                : 'Усі обов’язкові курси складено — можна подати запит у «Налаштуваннях».'}
            </div>
            <div className="list">
              {REQUIRED[next].map((id) => (
                <button key={id} className="list__row list__row--btn" onClick={() => go('learn', id)}>
                  <span className="list__lead"><Icon name="book" size={16} /> {courseById(id).title}</span>
                  <CourseStatus user={me} id={id} />
                </button>
              ))}
            </div>
            {!missing.length && <button className="vx-btn" onClick={() => go('settings')}>Подати запит <Icon name="chevron" /></button>}
          </div>
        </Panel>
      )}

      {TRACKS.map((t) => (
        <Panel key={t.id} title={t.name} action={<span className="vx-hint">{COURSES.filter((c) => c.track === t.id && resultOf(me, c.id)?.fresh).length} / {COURSES.filter((c) => c.track === t.id).length}</span>}>
          <div className="stack">
            <div className="vx-hint">{t.about}</div>
            <div className="list">
              {COURSES.filter((c) => c.track === t.id).map((c) => (
                <button key={c.id} className="list__row list__row--btn learn-row" onClick={() => go('learn', c.id)}>
                  <span className="learn-row__title">
                    <span>{c.title}</span>
                    <span className="vx-hint">{GRADES[c.grade]} · {c.minutes} хв{UNLOCKS[c.id] ? ` · обов’язковий для ${CLEARANCE[UNLOCKS[c.id]].short}` : ''}</span>
                  </span>
                  <CourseStatus user={me} id={c.id} />
                </button>
              ))}
            </div>
          </div>
        </Panel>
      ))}

      {canSeeTeam && <Team users={state.users} me={me} />}
    </div>
  );
}

// Admins see everyone, leads — their division: who has passed what the next clearance needs.
function Team({ users, me }) {
  const people = users.filter((u) => u.status !== 'suspended' && (me.role === 'admin' || u.division === me.division));
  const count = (u, lvl) => REQUIRED[lvl].filter((id) => resultOf(u, id)?.fresh).length;
  return (
    <Panel title="Прогрес команди" bodyClass="">
      <table className="vx-table">
        <thead><tr><th>Співробітник</th><th>Допуск</th><th>Курси для UMBRA</th><th>Курси для NOX</th><th>Складено всього</th></tr></thead>
        <tbody>
          {people.map((u) => (
            <tr key={u.id}>
              <td><div className="cell-person"><Avatar name={u.name} /><div><div>{u.name}</div><div className="vx-hint">{DIVISIONS.find((d) => d.id === u.division)?.name}</div></div></div></td>
              <td><ClassBadge level={u.clearance} /></td>
              <td>{count(u, 1)} / {REQUIRED[1].length}</td>
              <td>{count(u, 2)} / {REQUIRED[2].length}</td>
              <td>{COURSES.filter((c) => resultOf(u, c.id)?.fresh).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/* ---------- course ---------- */

function Block({ b }) {
  if (typeof b === 'string') return <p>{b}</p>;
  const [kind, v] = b;
  if (kind === 'h') return <h3>{v}</h3>;
  if (kind === 'ul') return <ul>{v.map((x) => <li key={x}>{x}</li>)}</ul>;
  if (kind === 'ol') return <ol>{v.map((x) => <li key={x}>{x}</li>)}</ol>;
  if (kind === 'note') return <aside className="course__note"><Icon name="info" size={16} /> <span>{v}</span></aside>;
  if (kind === 'tbl') {
    const [head, ...rows] = v;
    return (
      <div className="course__tbl"><table className="vx-table">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table></div>
    );
  }
  return null;
}

const shuffle = (n) => {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

function Course({ course, go }) {
  const { me } = useStore();
  const [content, setContent] = useState(null);
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);
  useEffect(() => { loadTrack(course.track).then((t) => setContent(t[course.id])).catch((e) => setErr(e.message)); }, [course]);
  useEffect(() => { window.scrollTo(0, 0); }, [testing]);
  const track = TRACKS.find((t) => t.id === course.track);
  const r = resultOf(me, course.id);

  return (
    <div className="page course">
      <header className="page__head">
        <div>
          <button className="vx-eyebrow ws-back" onClick={() => go('learn')}><Icon name="chevron" size={12} className="ws-back__icon" /> Навчання · {track.name}</button>
          <h1 className="vx-h1">{course.title}</h1>
          <div className="vx-hint">{GRADES[course.grade]} · {course.minutes} хв{UNLOCKS[course.id] ? ` · обов’язковий для ${CLEARANCE[UNLOCKS[course.id]].short}` : ''}</div>
        </div>
        <CourseStatus user={me} id={course.id} />
      </header>
      {err && <div className="vx-error">{err}</div>}
      {!content ? !err && <div className="vx-empty"><Loader size={40} label="Завантаження курсу" /></div>
        : testing ? <Quiz course={course} quiz={content.quiz} onClose={() => setTesting(false)} go={go} />
          : <>
            <p className="course__summary">{content.summary}</p>
            <article className="course__body vx-panel">{content.body.map((b, i) => <Block key={i} b={b} />)}</article>
            <div className="course__foot">
              <div className="vx-hint">
                Тест: {content.quiz.length} питань, прохідний поріг {Math.round(PASS * 100)}%.
                {r ? ` Спроб: ${r.attempts}, найкращий результат ${r.best}%${r.passed && r.at ? `, складено ${fmtDate(r.at, false)}` : ''}.` : ''}
              </div>
              <button className="vx-btn vx-btn--primary" onClick={() => setTesting(true)}><Icon name="check" /> Пройти тест</button>
            </div>
          </>}
    </div>
  );
}

function Quiz({ course, quiz, onClose, go }) {
  const { dispatch } = useStore();
  const [round, setRound] = useState(0);
  // Options shuffled on every attempt; the right one is first in the data.
  const items = useMemo(() => quiz.map(([q, opts, why]) => { const order = shuffle(opts.length); return { q, why, opts: order.map((i) => opts[i]), right: order.indexOf(0) }; }), [quiz, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState({});
  const [done, setDone] = useState(false);
  const score = items.filter((it, i) => picked[i] === it.right).length;
  const passed = score / items.length >= PASS;
  const all = Object.keys(picked).length === items.length;

  const submit = () => {
    setDone(true);
    dispatch({ type: 'training/result', course: course.id, title: course.title, score, total: items.length, passed });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const again = () => { setPicked({}); setDone(false); setRound((n) => n + 1); window.scrollTo(0, 0); };

  return (
    <div className="quiz">
      {done && (
        <Panel className={`quiz__result ${passed ? 'is-pass' : 'is-fail'}`}>
          <div className="quiz__score">
            <span className="vx-mono">{score} / {items.length}</span>
            <Status kind={passed ? 'ok' : 'danger'}>{passed ? 'Складено' : `Не складено — потрібно ${Math.round(PASS * 100)}%`}</Status>
          </div>
          <div className="toolbar">
            {!passed && <button className="vx-btn vx-btn--primary" onClick={again}>Пройти ще раз</button>}
            <button className="vx-btn" onClick={onClose}>До матеріалу</button>
            <button className="vx-btn vx-btn--ghost" onClick={() => go('learn')}>До курсів</button>
          </div>
        </Panel>
      )}
      <ol className="quiz__list">
        {items.map((it, i) => (
          <li key={`${round}-${i}`} className="quiz__q vx-panel">
            <fieldset disabled={done}>
              <legend>{it.q}</legend>
              {it.opts.map((o, j) => {
                const state = done ? (j === it.right ? 'is-right' : picked[i] === j ? 'is-wrong' : '') : '';
                return (
                  <label key={j} className={`quiz__opt ${state}`}>
                    <input type="radio" name={`q${round}-${i}`} checked={picked[i] === j} onChange={() => setPicked({ ...picked, [i]: j })} />
                    <span>{o}</span>
                  </label>
                );
              })}
              {done && <div className="quiz__why vx-hint">{picked[i] === it.right ? '✓ ' : '✗ '}{it.why}</div>}
            </fieldset>
          </li>
        ))}
      </ol>
      {!done && (
        <div className="course__foot">
          <span className="vx-hint">Відповіді: {Object.keys(picked).length} з {items.length}</span>
          <button className="vx-btn vx-btn--primary" disabled={!all} onClick={submit}>Завершити тест</button>
        </div>
      )}
    </div>
  );
}
