// «Інформація»: the company's documents and certificates (an administrator files them, everyone reads them)
// and the rules of the platform. The rules are written from what the platform actually enforces —
// the classification scale, sign-in, the audit log — not from anything assumed about the company.
import { useStore } from '../store.jsx';
import { Panel, ClassBadge, SealBadge } from '../components/ui.jsx';
import { Attachments } from '../components/Attachments.jsx';
import { LEVELS, SEAL, CUSTOS } from '../data/clearance.js';

// One shared record holds the files; it belongs to no division, so it never shows in a register.
export const INFO_ID = 'info-library';

const RULES = [
  ['Вхід', 'Пароль і ключ доступу пристрою: Face ID, Touch ID, Windows Hello або ключ безпеки. Підтверджений вхід діє добу.'],
  ['Дозволені адреси', 'Якщо в картці людини вказано IP-адреси, вхід — лише з них або з підтвердженням ключем доступу.'],
  ['Журнал аудиту', 'Кожна дія фіксується: хто, що й коли. Записи журналу не можна змінити чи видалити.'],
  ['Закриті матеріали', 'Файли й записи з грифом NOX не залишають системи: їх не завантажують, не друкують і не надсилають поштою. Кожне відкриття — окрема дія з метою.'],
  ['Звіти', 'PDF і Word збирають лише те, що дозволяє гриф запису.'],
  ['CONTEXT · AI-асистент', 'Бачить лише відомості з грифом LUMEN. Нічого не змінює сам — тільки після вашого «Підтвердити».'],
  ['Відкриті джерела', 'Моніторинг працює лише з відкритими й офіційними джерелами. Про людей — тільки публічна ділова роль, без стеження за приватними особами.'],
  ['Сховище', 'До 9,75 ГБ файлів. Великі файли — до 50 МБ кожен.'],
];

export function Info() {
  const { state, me, dispatch } = useStore();
  const lib = (state.records || []).find((r) => r.id === INFO_ID);
  const canEdit = me.role === 'admin';
  const setFiles = (files) => {
    if (lib) dispatch({ type: 'record/update', id: INFO_ID, patch: { files }, where: 'Інформація', label: 'Документи й сертифікати', note: 'файли' });
    else dispatch({ type: 'record/add', record: { id: INFO_ID, div: 'info', col: 'docs', title: 'Документи й сертифікати', clearance: 0, files }, where: 'Інформація', label: 'Документи й сертифікати' });
  };

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">Документи й правила</div>
          <h1 className="vx-h1">Інформація</h1>
        </div>
      </header>

      <Panel title="Документи й сертифікати" info={canEdit ? 'Сертифікати, ліцензії, положення та інструкції компанії. Додаєте ви — переглядати можуть усі в команді.' : 'Сертифікати, ліцензії, положення та інструкції компанії.'}>
        {(lib?.files || []).length || canEdit
          ? <Attachments value={lib?.files || []} onChange={setFiles} canEdit={canEdit} clearance={0} division="info" record={INFO_ID} />
          : <div className="vx-empty"><div>Документів ще немає</div></div>}
      </Panel>

      <Panel title="Правила платформи" bodyClass="vx-panel__body info-rules">
        {RULES.map(([t, text]) => (
          <div className="info-rule" key={t}>
            <div className="info-rule__t">{t}</div>
            <div className="info-rule__d">{text}</div>
          </div>
        ))}
      </Panel>

      <Panel title="Грифи" bodyClass="vx-panel__body info-rules">
        {LEVELS.map((l) => (
          <div className="info-rule" key={l.id}>
            <div className="info-rule__t"><ClassBadge level={l.id} /></div>
            <div className="info-rule__d"><b>{l.tier}.</b> {l.rule} {l.about}</div>
          </div>
        ))}
        <div className="info-rule">
          <div className="info-rule__t"><SealBadge /></div>
          <div className="info-rule__d"><b>{SEAL.gloss}.</b> {SEAL.rule} {SEAL.about}</div>
        </div>
        <div className="info-rule">
          <div className="info-rule__t"><span className="vx-class vx-class--custos">{CUSTOS.name}</span></div>
          <div className="info-rule__d">{CUSTOS.gloss}. {CUSTOS.rule}</div>
        </div>
      </Panel>

      <div className="vx-hint">Версія {__BUILD__}</div>
    </div>
  );
}
