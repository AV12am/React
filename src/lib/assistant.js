// AI-помічник платформи: what goes to the model and what may come back.
//
// The model (Cloudflare Workers AI through api/assistant.js) sees only LUMEN: the guide below, where the
// person is, and the LUMEN records around them. Nothing classified UMBRA or NOX — not even a title — leaves
// the platform. The model answers with text and proposed actions; every action is checked here against the
// person's own rights, record lookups happen locally (so they may reach classified records the person sees,
// without the model ever learning their names), and anything that changes data waits for «Підтвердити».
import { DIVISIONS } from '../data/seed.js';
import { registersOf, registerOf } from '../data/workspaces.js';
import { workspaceAccess } from './access.js';

export const GUIDE = `Ти — CONTEXT, AI-асистент внутрішньої платформи Reaction Core. Відповідай українською (або мовою питання), коротко й по суті.
Розділи: «Огляд» (головна), «Напрями» (Розвідка — компанії, джерела, опрацювання; Аналітика — продукти зі звітами PDF/Word; Академія; Дослідження; Проєкти),
«Сховище» (файли з грифами, папки), «Карта», «Адміністрування» (Доступи — люди, ролі, допуски, паролі, дозволені IP; Журнал аудиту), «Інформація» (документи й сертифікати компанії, правила платформи, грифи), «Налаштування» (мова, тема, блокування, ключі доступу).
Кожен запис спершу створюється карткою опису, потім відкривається своєю сторінкою: опис, фото обкладинки, одна зона «Файли» (усі файли потрапляють у звіт), робочі записи, завдання, обговорення.
Грифи: LUMEN (відкритий у межах команди), UMBRA (обмежений), NOX (лише в системі, кожне відкриття — окрема дія з метою), NON OCULIS (за окремою підставою).
Ти бачиш лише відомості з грифом LUMEN. Про закриті записи не вигадуй — запропонуй відкрити чи знайти їх дією.
Ніколи не вигадуй фактів про компанії, людей чи події; якщо даних немає — скажи про це.

Відповідай ЛИШЕ JSON-об'єктом: {"reply": "текст відповіді", "actions": [ ... ]}. actions може бути порожнім. Можливі дії:
{"type":"go","to":"overview|divisions|vault|map|access|audit|info|settings","division":"int|ana|acad|res|prj","register":"<id реєстру>"} — перейти до розділу;
{"type":"open","query":"назва запису"} — відкрити запис за назвою;
{"type":"search","query":"слова"} — знайти записи;
{"type":"task","title":"що зробити","due":"РРРР-ММ-ДД"} — створити завдання (до відкритого запису, якщо він є). due — лише коли людина назвала строк; рахуй його від дати «Сьогодні» з контексту («завтра», «до п’ятниці», «наступного тижня» — від сьогодні) і ніколи не став дату в минулому. Строку не названо — не додавай due;
{"type":"entry","title":"заголовок","text":"текст"} — додати робочий запис до відкритого запису;
{"type":"record","division":"res|prj|ana|int|acad","register":"<id реєстру>","title":"назва","about":"опис"} — створити новий запис.
Пропонуй дію лише тоді, коли людина про це просить.
Ти сам нічого не змінюєш: дія з actions лише пропонується, і виконується тільки після того, як людина натисне «Підтвердити».
Тому НІКОЛИ не пиши, що щось уже створено, додано, збережено чи виконано. Пиши «Підготував завдання — підтвердіть», «Пропоную створити…».
Якщо потрібної дії немає в списку вище — прямо скажи, що цього зробити не можеш. Не обіцяй того, чого не робиш.
Рядки «[Система: …]» в історії — це те, що справді сталося з діями; довіряй лише їм.`;

const LUMEN = 0;
const cut = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
const visibleDivs = () => DIVISIONS.filter((d) => !d.hidden);
const titleOf = (r) => { const reg = registerOf(r.div, r.col); return String((reg && r[reg.title]) || r.title || r.name || 'Без назви'); };

/** The record open on screen, from the route ({ view, sub, id }), or null. */
export function openRecord(state, route) {
  if (route?.view !== 'divisions' || !route.id || !String(route.id).includes(':')) return null;
  const rid = String(route.id).split(':').slice(1).join(':');
  return (state.records || []).find((r) => r.id === rid && r.div === route.sub) || null;
}

// Today in Kyiv as YYYY-MM-DD, and its weekday — the model has no clock of its own.
export const todayKyiv = (now = Date.now()) => new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
const weekday = (now) => new Date(now).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', weekday: 'long' });
const dmy = (iso) => iso.split('-').reverse().join('.');

/** What the model may know: where the person is and the LUMEN records around them. */
export function buildContext({ state, me, route, now = Date.now() }) {
  const lines = [`Сьогодні: ${todayKyiv(now)} (${weekday(now)}).`];
  const div = DIVISIONS.find((d) => d.id === route?.sub);
  lines.push(`Розділ: ${route?.view || 'overview'}${div ? ` · напрям «${div.name}» (${div.id})` : ''}. Роль користувача: ${me.role}.`);
  lines.push(`Напрями й реєстри: ${visibleDivs().map((d) => `${d.name} (${d.id}): ${registersOf(d.id).map((r) => `${r.name}=${r.id}`).join(', ')}`).join('; ')}.`);
  const rec = openRecord(state, route);
  if (rec) {
    if ((+rec.clearance || 0) > LUMEN) lines.push('Відкрито запис із грифом вище LUMEN — його вміст тобі недоступний.');
    else {
      const reg = registerOf(rec.div, rec.col);
      const fields = (reg?.fields || []).filter((f) => !f.hidden && !['files', 'image', 'file', 'links', 'ref', 'user'].includes(f.type) && rec[f.id] != null && rec[f.id] !== '')
        .map((f) => `${f.label}: ${cut(rec[f.id], 600)}`);
      lines.push(`Відкритий запис (${reg?.name || rec.col}): «${cut(titleOf(rec), 160)}». ${fields.join('. ')}`);
      const entries = (rec.entries || []).filter((e) => !e.clearance).slice(0, 8).map((e) => `— ${cut(e.title || 'Запис', 80)}: ${cut(e.text, 300)}`);
      if (entries.length) lines.push(`Робочі записи:\n${entries.join('\n')}`);
      const files = (rec.files || []).filter((f) => typeof f === 'object' && !(+f.clearance > LUMEN)).slice(0, 10).map((f) => f.name);
      if (files.length) lines.push(`Файли: ${files.join(', ')}.`);
    }
  }
  // LUMEN records of the division on screen (titles only), so the person can ask about them.
  if (div) {
    const around = (state.records || []).filter((r) => r.div === div.id && !(+r.clearance > LUMEN) && r.col !== 'orgs').slice(0, 40).map((r) => `«${cut(titleOf(r), 80)}»`);
    if (around.length) lines.push(`Записи LUMEN у цьому напрямі: ${around.join(', ')}.`);
  }
  return lines.join('\n').slice(0, 9000);
}

// «Створив», «додано», «готово»… — a reply that says something was done. Only the person's «Підтвердити»
// does anything, so such words without an action waiting for it are not true.
const DONE = /(^|[^\p{L}])(створ(ив|ила|ено)|дода(в|ла|но)|збер(іг|егла|ежено)|викона(в|ла|но)|зроби(в|ла)|оновл(ено|ив)|видал(ив|ено)|готово|created|added|saved|done)(?=[^\p{L}]|$)/iu;
export const claimsDone = (text) => DONE.test(String(text || ''));

/** What the person reads under a reply: whether anything really happened. */
export function honestyNote(reply, checked) {
  const pending = checked.filter((a) => a.confirm && !a.error);
  if (pending.length) return 'Нічого ще не змінено — дія виконається лише після «Підтвердити».';
  if (claimsDone(reply)) return 'Увага: жодної дії не виконано. CONTEXT лише відповів текстом — попросіть його ще раз або зробіть це вручну.';
  return '';
}

/** The model's answer: { reply, actions } — tolerant of text around the JSON or plain text. */
export function parseReply(raw) {
  if (raw && typeof raw === 'object') return { reply: String(raw.reply || ''), actions: Array.isArray(raw.actions) ? raw.actions : [] };
  const s = String(raw || '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const j = JSON.parse(s.slice(a, b + 1));
      if (j && (j.reply != null || j.actions)) return { reply: String(j.reply || ''), actions: Array.isArray(j.actions) ? j.actions.slice(0, 4) : [] };
    } catch { /* not JSON: plain text */ }
  }
  return { reply: s, actions: [] };
}

/** Records the person may see that match a query (locally, classified included), best first. */
export function findRecords(state, me, query, limit = 6) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const divs = new Set(visibleDivs().map((d) => d.id));
  return (state.records || [])
    .filter((r) => divs.has(r.div) && (+r.clearance || 0) <= me.clearance)
    .map((r) => {
      const t = titleOf(r).toLowerCase();
      const body = `${t} ${String(r.about || '').toLowerCase()}`;
      const score = words.reduce((s, w) => s + (t.includes(w) ? 3 : body.includes(w) ? 1 : 0), 0);
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => ({ id: x.r.id, div: x.r.div, col: x.r.col, title: titleOf(x.r), clearance: +x.r.clearance || 0 }));
}

export const recordRoute = (r) => ['divisions', r.div, r.col === 'orgs' ? `companies:${r.id}` : `${r.col}:${r.id}`];

const VIEWS = ['overview', 'divisions', 'vault', 'map', 'access', 'audit', 'info', 'settings'];
const VIEW_NAME = { overview: 'Огляд', divisions: 'Напрями', vault: 'Сховище', map: 'Карта', access: 'Доступи', audit: 'Журнал аудиту', info: 'Інформація', settings: 'Налаштування' };
const str = (v, n) => cut(v, n);

/**
 * One proposed action, checked against the person's rights → { kind, label, confirm, ... } or { error }.
 * `allowed`: the sections this person may open (App.jsx).
 */
export function checkAction(a, { state, me, perms, route, allowed = VIEWS, now = Date.now() }) {
  const type = a?.type;
  if (type === 'go') {
    const to = VIEWS.includes(a.to) ? a.to : null;
    if (!to || !allowed.includes(to)) return { error: 'Цей розділ вам недоступний' };
    const d = to === 'divisions' && a.division ? visibleDivs().find((x) => x.id === a.division) : null;
    const reg = d && a.register ? registersOf(d.id).find((r) => r.id === a.register) : null;
    return { kind: 'go', confirm: false, label: `Перейти: ${d ? `${d.name}${reg ? ` · ${reg.name}` : ''}` : VIEW_NAME[to]}`, route: [to, d?.id || null, reg?.id || null] };
  }
  if (type === 'open' || type === 'search') {
    const found = findRecords(state, me, a.query, type === 'open' ? 3 : 8);
    if (!found.length) return { error: `Нічого не знайдено: «${str(a.query, 60)}»` };
    return { kind: 'results', confirm: false, label: type === 'open' ? 'Відкрити' : 'Знайдено', found, auto: type === 'open' && found.length === 1 };
  }
  const rec = openRecord(state, route);
  if (type === 'task') {
    const title = str(a.title, 140);
    if (!title) return { error: 'Немає назви завдання' };
    // A date in the past is a mistake of the model, not the person's wish: the task goes without one.
    const due = /^\d{4}-\d{2}-\d{2}$/.test(a.due || '') && a.due >= todayKyiv(now) ? a.due : null;
    return { kind: 'task', confirm: true, label: `Створити завдання «${title}»${due ? ` до ${dmy(due)}` : ''}${rec ? ` у «${str(titleOf(rec), 60)}»` : ''}`,
      task: { title, assignee: me.id, due, target: rec?.id || null, clearance: rec ? +rec.clearance || 0 : 0 } };
  }
  if (type === 'entry') {
    if (!rec) return { error: 'Спершу відкрийте запис, до якого додати' };
    const d = DIVISIONS.find((x) => x.id === rec.div);
    if (!d || !workspaceAccess(me, perms, d).canEdit) return { error: 'Немає прав змінювати цей запис' };
    const text = str(a.text, 4000);
    if (!text) return { error: 'Порожній запис' };
    return { kind: 'entry', confirm: true, label: `Додати робочий запис${a.title ? ` «${str(a.title, 80)}»` : ''} до «${str(titleOf(rec), 60)}»`, record: rec, entry: { title: str(a.title, 120), text } };
  }
  if (type === 'record') {
    const d = visibleDivs().find((x) => x.id === a.division);
    const reg = d && (registersOf(d.id).find((r) => r.id === a.register) || registersOf(d.id).find((r) => r.layout === 'cards'));
    if (!d || !reg) return { error: 'Невідомий напрям або реєстр' };
    if (!workspaceAccess(me, perms, d).canEdit) return { error: `Немає прав додавати в «${d.name}»` };
    const title = str(a.title, 160);
    if (!title) return { error: 'Немає назви' };
    const record = { div: d.id, col: reg.id, [reg.title]: title, clearance: Math.min(reg.level ?? 0, me.clearance), ...(reg.about && a.about ? { [reg.about]: str(a.about, 2000) } : {}) };
    return { kind: 'record', confirm: true, label: `Створити в «${d.name} · ${reg.name}»: «${title}»`, record, reg, d };
  }
  return { error: 'Невідома дія' };
}
