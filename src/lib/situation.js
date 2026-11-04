// SITUATION — the platform's dashboards. A dashboard is a grid of widgets the analyst arranges; every number on it is
// counted from the platform's own records (what the person may see), never invented. Pure functions: the view
// (src/views/Situation.jsx) draws them, the tests (scripts/test/situation.test.mjs) check them.
import { VISIBLE_DIVISIONS } from '../data/seed.js';
import { registerOf } from '../data/workspaces.js';

const DAY = 86400000;
const WEEK = 7 * DAY;
const t = (iso) => { const v = Date.parse(iso || ''); return Number.isFinite(v) ? v : 0; };

// Widths on a 12-column grid and heights in rows.
export const WIDTHS = [3, 4, 6, 8, 12];
export const PERIODS = [[7, '7 днів'], [30, '30 днів'], [90, '90 днів']];

/** What a widget can show: id → { kind, label, about }. `kind` picks the drawing: kpi · line · bars · table · feed · pulse · news. */
export const METRICS = {
  'records.new': { kind: 'kpi', label: 'Нові записи', about: 'Записи, додані за період, і зміна до попереднього такого ж періоду.' },
  'records.total': { kind: 'kpi', label: 'Усього записів', about: 'Усі записи, які ви бачите за своїм допуском.' },
  'tasks.open': { kind: 'kpi', label: 'Відкриті завдання', about: 'Завдання, ще не виконані.' },
  'tasks.overdue': { kind: 'kpi', label: 'Прострочені завдання', about: 'Відкриті завдання, термін яких минув.' },
  'tasks.done': { kind: 'kpi', label: 'Виконано за період', about: 'Завдання, позначені виконаними за період.' },
  'projects.active': { kind: 'kpi', label: 'Активні проєкти', about: 'Проєкти зі станом «Триває».' },
  'forecasts.open': { kind: 'kpi', label: 'Відкриті прогнози', about: 'Прогнози, результат яких ще не перевірено.' },
  'users.active': { kind: 'kpi', label: 'Активні люди', about: 'Облікові записи зі статусом «активний».' },
  'audit.events': { kind: 'kpi', label: 'Дії на платформі', about: 'Записи журналу аудиту за період.' },
  'records.byWeek': { kind: 'line', label: 'Нові записи за тижнями', about: 'Скільки записів додано щотижня.' },
  'tasks.doneByWeek': { kind: 'line', label: 'Виконані завдання за тижнями', about: 'Скільки завдань виконано щотижня.' },
  'audit.byWeek': { kind: 'line', label: 'Активність за тижнями', about: 'Записи журналу аудиту щотижня.' },
  'records.byDivision': { kind: 'bars', label: 'Записи за напрямами', about: 'Нові записи за період за напрямами. Натисніть стовпчик — дашборд відфільтрується за цим напрямом.', filters: 'div' },
  'tasks.byAssignee': { kind: 'bars', label: 'Відкриті завдання за виконавцями', about: 'Навантаження людей: скільки відкритих завдань на кожному.' },
  'projects.byState': { kind: 'bars', label: 'Проєкти за станом', about: 'Скільки проєктів у кожному стані.' },
  'tasks.upcoming': { kind: 'table', label: 'Найближчі терміни', about: 'Відкриті завдання, найближчі за терміном першими.' },
  'projects.list': { kind: 'table', label: 'Проєкти', about: 'Проєкти зі станом, керівником і терміном.' },
  'records.recent': { kind: 'table', label: 'Останні записи', about: 'Останні змінені записи.' },
  'audit.recent': { kind: 'feed', label: 'Остання активність', about: 'Останні дії в журналі аудиту.' },
  'pulse.gpr': { kind: 'pulse', label: 'Геополітичний ризик · GPR', about: 'Індекс геополітичного ризику з прогнозами платформи.' },
  'news.key': { kind: 'news', label: 'Ключові новини доби', about: 'Перший розділ сьогоднішнього випуску CONTEXT News.' },
};

let n = 0;
const wid = () => `wg-${Date.now().toString(36)}${(n++).toString(36)}`;
const w = (metric, width, extra = {}) => ({ id: wid(), metric, w: width, ...extra });

/** The ready dashboards, as the popular platforms ship them (Power BI, Tableau, Looker Studio, Metabase, Grafana). */
export const TEMPLATES = [
  {
    id: 'exec', name: 'Огляд керівника', about: 'Ключові показники зі зміною за період, тренд, напрями, найближчі терміни.',
    widgets: () => [w('records.new', 3), w('tasks.open', 3), w('tasks.overdue', 3), w('projects.active', 3),
      w('records.byWeek', 6), w('records.byDivision', 6), w('tasks.upcoming', 6), w('audit.recent', 6)],
  },
  {
    id: 'projects', name: 'Проєкти й завдання', about: 'Стан проєктів, навантаження людей, прострочене й найближче.',
    widgets: () => [w('projects.active', 3), w('tasks.open', 3), w('tasks.overdue', 3), w('tasks.done', 3),
      w('projects.byState', 6), w('tasks.byAssignee', 6), w('projects.list', 12), w('tasks.doneByWeek', 6), w('tasks.upcoming', 6)],
  },
  {
    id: 'situation', name: 'Обстановка', about: 'Геополітичний ризик, ключові новини доби, свіжі записи й прогнози.',
    widgets: () => [w('pulse.gpr', 12), w('news.key', 6), w('records.recent', 6), w('forecasts.open', 3), w('records.new', 3), w('audit.events', 3), w('records.total', 3)],
  },
  { id: 'blank', name: 'Порожній дашборд', about: 'Почніть з чистої сітки й додайте віджети самі.', widgets: () => [] },
];

/** A new dashboard from a template. */
export function newBoard(templateId, me, name) {
  const tpl = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES[0];
  const now = new Date().toISOString();
  return { id: `bd-${Date.now().toString(36)}${(n++).toString(36)}`, name: name || tpl.name, template: tpl.id, owner: me.id, shared: false, clearance: 0,
    filters: { days: 30, div: '' }, widgets: tpl.widgets(), at: now, updated: now };
}
export const addWidget = (board, metric) => ({ ...board, widgets: [...board.widgets, w(metric, METRICS[metric]?.kind === 'kpi' ? 3 : 6)] });

/** The dashboards a person sees: their own, and the shared ones within their clearance. */
export const boardsFor = (boards, me) => (boards || []).filter((b) => (b.clearance ?? 0) <= me.clearance && (b.owner === me.id || b.shared))
  .sort((a, b) => String(a.at).localeCompare(String(b.at)));

/** Moves widget `id` by `step` places (−1 earlier, +1 later). */
export function moveWidget(board, id, step) {
  const list = [...board.widgets];
  const i = list.findIndex((x) => x.id === id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= list.length) return board;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...board, widgets: list };
}
/** Puts widget `id` where widget `before` is (drag and drop). */
export function placeWidget(board, id, before) {
  const list = board.widgets.filter((x) => x.id !== id);
  const it = board.widgets.find((x) => x.id === id);
  const at = list.findIndex((x) => x.id === before);
  if (!it || at < 0) return board;
  list.splice(at, 0, it);
  return { ...board, widgets: list };
}
export const resizeWidget = (board, id) => ({ ...board, widgets: board.widgets.map((x) => (x.id === id ? { ...x, w: WIDTHS[(WIDTHS.indexOf(x.w) + 1) % WIDTHS.length] } : x)) });
export const removeWidget = (board, id) => ({ ...board, widgets: board.widgets.filter((x) => x.id !== id) });

// ── Counting ────────────────────────────────────────────────────────────────────────────────────────────
const recTitle = (r) => { const reg = registerOf(r.div, r.col); return String((reg && r[reg.title]) || r.title || r.name || r.statement || 'Без назви'); };
const divName = (id) => VISIBLE_DIVISIONS.find((d) => d.id === id)?.name || id;

/** The data a person may see, narrowed by the dashboard's filters. */
export function scope(state, me, filters = {}, now = Date.now()) {
  const days = filters.days || 30;
  const seeRec = (r) => (r.clearance ?? 0) <= me.clearance && (!filters.div || r.div === filters.div);
  const records = (state.records || []).filter(seeRec);
  const tasks = (state.tasks || []).filter((x) => (x.clearance ?? 0) <= me.clearance);
  const audit = (state.audit || []).filter((x) => (x.clearance ?? 0) <= me.clearance);
  return { records, tasks, audit, users: state.users || [], now, days, from: now - days * DAY, div: filters.div || '' };
}

const weekly = (items, at, now, weeks = 12) => {
  const data = Array.from({ length: weeks }, (_, i) => {
    const hi = now - (weeks - 1 - i) * WEEK;
    return items.filter((x) => { const v = at(x); return v <= hi && v > hi - WEEK; }).length;
  });
  return { data, labels: data.map((_, i) => (i === weeks - 1 ? 'Цей' : `Т-${weeks - 1 - i}`)) };
};
const today = (now) => new Date(now).toISOString().slice(0, 10);
const doneAt = (x) => t(x.done || (x.status === 'done' ? x.updated : ''));

/** One widget's numbers. → kpi { value, delta?, note? } · line { data, labels } · bars { rows:[{id,label,value}] } · table { cols, rows:[{id, cells, to?}] } · feed { rows }. */
export function compute(metric, s) {
  const inPeriod = (v) => v > s.from && v <= s.now;
  const inPrev = (v) => v > s.from - s.days * DAY && v <= s.from;
  const open = s.tasks.filter((x) => x.status !== 'done');
  const projects = s.records.filter((r) => r.div === 'prj' && r.col === 'projects');
  const forecasts = s.records.filter((r) => r.outcome);
  switch (metric) {
    case 'records.new': {
      const a = s.records.filter((r) => inPeriod(t(r.at))).length;
      const b = s.records.filter((r) => inPrev(t(r.at))).length;
      return { value: a, delta: a - b, note: `попередній період: ${b}` };
    }
    case 'records.total': return { value: s.records.length };
    case 'tasks.open': return { value: open.length, note: `з них без терміну: ${open.filter((x) => !x.due).length}` };
    case 'tasks.overdue': return { value: open.filter((x) => x.due && x.due < today(s.now)).length, bad: true };
    case 'tasks.done': {
      const a = s.tasks.filter((x) => x.status === 'done' && inPeriod(doneAt(x))).length;
      const b = s.tasks.filter((x) => x.status === 'done' && inPrev(doneAt(x))).length;
      return { value: a, delta: a - b, note: `попередній період: ${b}` };
    }
    case 'projects.active': return { value: projects.filter((r) => r.state === 'Триває').length, note: `усього проєктів: ${projects.length}` };
    case 'forecasts.open': return { value: forecasts.filter((r) => r.outcome === 'Відкрито').length, note: `перевірено: ${forecasts.filter((r) => r.outcome === 'Сталося' || r.outcome === 'Не сталося').length}` };
    case 'users.active': return { value: s.users.filter((u) => u.status === 'active').length };
    case 'audit.events': return { value: s.audit.filter((e) => inPeriod(t(e.at))).length };
    case 'records.byWeek': return weekly(s.records, (r) => t(r.at), s.now);
    case 'tasks.doneByWeek': return weekly(s.tasks.filter((x) => x.status === 'done'), doneAt, s.now);
    case 'audit.byWeek': return weekly(s.audit, (e) => t(e.at), s.now);
    case 'records.byDivision': {
      const rows = VISIBLE_DIVISIONS.map((d) => ({ id: d.id, label: d.name, value: s.records.filter((r) => r.div === d.id && inPeriod(t(r.at))).length }));
      return { rows: rows.filter((r) => r.value || !s.div).sort((a, b) => b.value - a.value) };
    }
    case 'tasks.byAssignee': {
      const by = new Map();
      for (const x of open) by.set(x.assignee || '', (by.get(x.assignee || '') || 0) + 1);
      const name = (id) => s.users.find((u) => u.id === id)?.name || 'Без виконавця';
      return { rows: [...by].map(([id, value]) => ({ id: id || 'none', label: name(id), value })).sort((a, b) => b.value - a.value).slice(0, 10) };
    }
    case 'projects.byState': {
      const states = registerOf('prj', 'projects')?.fields.find((f) => f.id === 'state')?.options || [];
      return { rows: states.map((st) => ({ id: st, label: st, value: projects.filter((r) => r.state === st).length })) };
    }
    case 'tasks.upcoming': {
      const name = (id) => s.users.find((u) => u.id === id)?.name || '—';
      const rows = [...open].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 8)
        .map((x) => {
          const r = x.target && s.records.find((y) => y.id === x.target);
          return { id: x.id, cells: [x.title, name(x.assignee), x.due || 'без терміну'], late: !!(x.due && x.due < today(s.now)), to: r ? { div: r.div, id: `${r.col}:${r.id}` } : null };
        });
      return { cols: ['Завдання', 'Виконавець', 'Термін'], rows };
    }
    case 'projects.list': {
      const name = (id) => s.users.find((u) => u.id === id)?.name || '—';
      const rows = [...projects].sort((a, b) => String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')))
        .map((r) => ({ id: r.id, cells: [recTitle(r), r.state || '—', name(r.lead), r.deadline || '—'], to: { div: r.div, id: `${r.col}:${r.id}` } }));
      return { cols: ['Проєкт', 'Стан', 'Керівник', 'Термін'], rows };
    }
    case 'records.recent': {
      const rows = [...s.records].sort((a, b) => String(b.updated || b.at || '').localeCompare(String(a.updated || a.at || ''))).slice(0, 8)
        .map((r) => ({ id: r.id, cells: [recTitle(r), divName(r.div), String(r.updated || r.at || '').slice(0, 10)], to: { div: r.div, id: `${r.col}:${r.id}` } }));
      return { cols: ['Запис', 'Напрям', 'Змінено'], rows };
    }
    case 'audit.recent': return { rows: s.audit.slice(0, 8).map((e) => ({ id: e.id, text: e.text, actor: e.actor, at: e.at })) };
    default: return null;
  }
}
