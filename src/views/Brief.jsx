// «Ранковий бриф» on the overview: what changed in the last day and what needs a decision today.
// The same summary goes out by e-mail each morning (api/brief.js) to those who keep it on in Settings.
import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { Panel, ClassBadge } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { buildBrief } from '../lib/brief.js';

const ICON = { watch: 'eye', intake: 'layers', due: 'target', review: 'warn', orgs: 'divisions', deadlines: 'bell', requests: 'key' };

export function BriefPanel({ go }) {
  const { state, me } = useStore();
  const [hours, setHours] = useState(24);
  const brief = useMemo(() => buildBrief({ records: state.records || [], requests: state.requests || [], me, hours }), [state.records, state.requests, me, hours]);
  const shown = brief.sections.filter((s) => s.total > 0);
  const open = (s, i) => (s.id === 'requests' ? go('access') : go('divisions', i.div, `${i.col}:${i.id}`));
  return (
    <Panel className="brief" title="Ранковий бриф"
      action={(
        <span className="segmented brief__range" role="group" aria-label="Період">
          {[[24, 'Доба'], [72, '3 доби'], [168, 'Тиждень']].map(([h, l]) => <button key={h} className={hours === h ? 'is-active' : ''} onClick={() => setHours(h)}>{l}</button>)}
        </span>
      )}>
      {!shown.length ? (
        <div className="vx-hint">За цей період нічого нового, і нічого не чекає на рішення.</div>
      ) : (
        <div className="brief__grid">
          {shown.map((s) => (
            <section key={s.id} className={`brief__sec ${['due', 'review', 'deadlines', 'requests'].includes(s.id) ? 'is-act' : ''}`}>
              <header className="brief__head"><Icon name={ICON[s.id]} size={16} /> <span>{s.title}</span> <b className="vx-num">{s.total}</b></header>
              {s.items.map((i) => (
                <button key={i.id} className="brief__item" onClick={() => open(s, i)}>
                  <span className="brief__title">{i.title}</span>
                  {i.note && <span className="vx-hint">{i.note}</span>}
                  {i.level > 0 && <ClassBadge level={i.level} />}
                </button>
              ))}
              {s.total > s.items.length && <div className="vx-hint brief__more">і ще {s.total - s.items.length}</div>}
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
