// Intelligence · «Джерела»: the starter set of open sources (those the briefs and the platform itself draw on).
import { useStore } from '../store.jsx';
import { Panel, Status } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { SOURCES_UA } from '../data/sources-ua.js';

const toRecord = (s) => ({ ...s, div: 'int', col: 'sources', clearance: 0 });

export function SourceDirectory() {
  const { state, dispatch, toast } = useStore();
  const have = new Set((state.records || []).map((r) => r.id));
  const missing = SOURCES_UA.filter((s) => !have.has(s.id));
  const load = () => {
    dispatch({ type: 'record/bulk', records: missing.map(toRecord), where: 'Розвідка · Джерела', label: `завантажено базовий набір: ${missing.length} джерел` });
    toast(`Додано ${missing.length} джерел`);
  };
  return (
    <Panel title={`Базовий набір відкритих джерел: ${SOURCES_UA.length}`}>
      <div className="stack">
        <div className="vx-hint">
          Стрічки новин, дані й сервіси, з яких складаються Morning briefing і CONTEXT News (тривоги, GPR, Prozorro, санкції, ACLED, DeepStateMap), а також офіційні й аналітичні джерела.
          У кожного — клас, надійність за шкалою A–F, посилання й де використовується. Оцінка надійності — робоча: змінюйте її за власним досвідом. Людських джерел (HUMINT) тут немає.
        </div>
        <div className="toolbar">
          {missing.length > 0 && <button className="vx-btn vx-btn--primary" onClick={load}><Icon name="download" /> Додати в реєстр ({missing.length})</button>}
          {missing.length === 0 && <Status kind="ok">Базовий набір додано</Status>}
        </div>
      </div>
    </Panel>
  );
}
