// Ранковий бриф: what happened since yesterday and what needs a decision today.
// One pure function, used by the platform (Огляд) and by the daily e-mail (api/brief.js).
//
// A reader sees only records within their clearance. For the e-mail, `nameUpTo` hides the titles of
// anything above that level (it travels through a mail provider): such items are counted, not named.

import { reviewQueue, isOpen, attention } from './provenance.js';
import { registerOf } from '../data/workspaces.js';

const DAY = 86400000;
const DONE = new Set(['Видано', 'Вирішено', 'Закрито', 'Усунено', 'Архів', 'Отримано', 'Завершено', 'Впроваджено', 'Реліз', 'Підтримка', 'Затверджено']);
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

export const titleOfRecord = (r) => {
  const reg = registerOf(r.div, r.col);
  return String((reg && r[reg.title]) || r.title || r.name || r.statement || 'Без назви');
};

/**
 * @param {object} p
 * @param {object[]} p.records  all records the caller has
 * @param {object[]} [p.requests]
 * @param {object} p.me         {id, role, clearance}
 * @param {number} [p.now]
 * @param {number} [p.hours]    look-back window (default 24)
 * @param {number} [p.nameUpTo] highest level whose titles may be shown (default: the reader's clearance)
 * @param {number} [p.limit]    items listed per section (default 6)
 */
export function buildBrief({ records = [], requests = [], tasks = [], comments = [], users = [], me, now = Date.now(), hours = 24, nameUpTo, limit = 6 }) {
  const since = new Date(now - hours * 3600000).toISOString();
  const today = isoDay(now);
  const soon = isoDay(now + 7 * DAY);
  const in3 = isoDay(now + 3 * DAY);
  const top = nameUpTo ?? me.clearance;
  const mine = records.filter((r) => (r.clearance ?? 0) <= me.clearance && r.div !== 'info'); // «Інформація» is no work record
  const byId = new Map(mine.map((r) => [r.id, r]));
  const item = (r, note) => {
    const level = r.clearance ?? 0;
    return { id: r.id, div: r.div, col: r.col, level, title: level <= top ? titleOfRecord(r) : null, note: note || '' };
  };
  const section = (id, title, list, empty) => ({ id, title, total: list.length, items: list.slice(0, limit), empty });

  const intake = mine.filter((r) => r.col === 'intake' && (r.at || '') >= since).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const watchName = (id) => byId.get(id)?.name;
  const auto = intake.filter((r) => r.origin === 'auto');
  const manual = intake.filter((r) => r.origin !== 'auto');

  const forecasts = mine.filter((r) => r.col === 'judgments' && r.kind === 'Прогноз' && isOpen(r) && r.due && r.due <= soon)
    .sort((a, b) => a.due.localeCompare(b.due));
  const due = forecasts.map((r) => item(r, r.due <= today ? `настала дата перевірки (${r.due})` : `перевірка ${r.due}`));

  const review = reviewQueue(mine, me)
    .filter((x) => x.reasons.some((rr) => attention(rr) && rr.kind !== 'due'))
    .map((x) => item(x.record, x.reasons.find((rr) => rr.kind === 'review')?.text));

  // Companies on watch: their findings, and changes to their cards.
  const watched = new Set(['w-list-orgs-sanctions', 'w-list-orgs-media'].flatMap((id) => String(byId.get(id)?.terms || '').split('\n').map((l) => l.split(';')[0].trim()).filter(Boolean)));
  const orgs = mine.filter((r) => r.col === 'orgs' && (watched.has(r.name) || r.relation && r.relation !== 'Немає'));
  const orgIds = new Set(orgs.map((o) => o.id));
  const orgNews = [
    ...intake.filter((r) => r.org && orgIds.has(r.org)).map((r) => item(r, byId.get(r.org)?.name)),
    ...orgs.filter((o) => (o.updated || '') >= since && (o.at || '') < since).map((o) => item(o, 'картку змінено')),
  ];

  const deadlines = mine.filter((r) => {
    const d = r.due || r.deadline;
    return d && d <= in3 && r.col !== 'judgments' && !DONE.has(r.stage) && r.state !== 'Закрите';
  }).sort((a, b) => (a.due || a.deadline).localeCompare(b.due || b.deadline))
    .map((r) => { const d = r.due || r.deadline; return item(r, d < today ? `прострочено з ${d}` : d === today ? 'сьогодні' : d); });

  // Tasks: mine, open, late or due within three days, or newly given to me.
  const myTasks = tasks.filter((t) => t.assignee === me.id && t.status !== 'done' && (t.clearance ?? 0) <= me.clearance
    && ((t.due && t.due <= in3) || (t.at || '') >= since))
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
    .map((t) => ({ id: t.id, task: true, target: t.target || null, level: t.clearance ?? 0, title: (t.clearance ?? 0) <= top ? t.title : null, note: t.due ? (t.due < today ? `прострочено з ${t.due}` : t.due === today ? 'сьогодні' : `строк ${t.due}`) : 'нове' }));
  const who = (id) => users.find((u) => u.id === id)?.name || 'колега';
  const mentions = comments.filter((c) => (c.mentions || []).includes(me.id) && c.author !== me.id && (c.at || '') >= since && (c.clearance ?? 0) <= me.clearance)
    .map((c) => { const r = byId.get(c.target); return { id: c.id, comment: true, target: c.target, div: r?.div, col: r?.col, level: c.clearance ?? 0, title: (c.clearance ?? 0) <= top ? `${who(c.author)}: ${c.text.slice(0, 140)}` : null, note: r && (r.clearance ?? 0) <= top ? titleOfRecord(r) : '' }; });

  const canDecide = ['admin', 'lead'].includes(me.role);
  const pending = canDecide ? requests.filter((r) => r.status === 'pending') : [];

  const sections = [
    section('tasks', 'Мої завдання', myTasks, 'Термінових завдань немає'),
    section('mentions', 'Вас згадали', mentions, 'Згадок немає'),
    section('watch', 'Знахідки конвеєра', auto.map((r) => item(r, watchName(r.watchlist))), 'Нових знахідок немає'),
    section('intake', 'Нові надходження', manual.map((r) => item(r, r.received)), 'Нових надходжень немає'),
    section('due', 'Прогнози на перевірку', due, 'Прогнозів із близькою датою немає'),
    section('review', 'Потребують перегляду', review, 'Усе переглянуто'),
    section('orgs', 'Компанії під спостереженням', orgNews, 'Змін у компаніях немає'),
    section('deadlines', 'Терміни на 3 дні', deadlines, 'Термінових справ немає'),
    ...(canDecide ? [section('requests', 'Запити на доступ', pending.map((r) => ({ id: r.id, level: 0, title: r.reason || 'Запит на доступ', note: r.kind })), 'Запитів немає')] : []),
  ];
  const attentionCount = myTasks.filter((x) => /прострочено|сьогодні/.test(x.note)).length + mentions.length + due.filter((x) => x.note.startsWith('настала')).length + review.length + deadlines.filter((x) => !/^\d/.test(x.note)).length + pending.length;
  return { since, until: new Date(now).toISOString(), sections, total: sections.reduce((a, s) => a + s.total, 0), attention: attentionCount };
}

/** Plain-text and HTML renderings for the e-mail. */
export function briefText(b, { name = '', appUrl = '', extraText = '' } = {}) {
  const lines = [`Ранковий бриф Reaction Core${name ? ` — ${name}` : ''}`, `За добу до ${new Date(b.until).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}`, '', ...(extraText ? [extraText, ''] : [])];
  for (const s of b.sections) {
    lines.push(`${s.title}: ${s.total}`);
    for (const i of s.items) lines.push(`  · ${i.title ?? 'запис вищого грифа'}${i.note ? ` — ${i.note}` : ''}`);
    if (s.total > s.items.length) lines.push(`  … і ще ${s.total - s.items.length}`);
  }
  if (appUrl) lines.push('', `Відкрити: ${appUrl}`);
  return lines.join('\n');
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function briefHtml(b, { name = '', appUrl = '', extra = '' } = {}) {
  const quiet = b.sections.filter((s) => !s.total);
  const sec = (extra ? `<tr><td style="padding:22px 0 0;font:600 13px/18px Georgia,serif;letter-spacing:.06em;text-transform:uppercase;color:#8c1c32">◆ За добу</td></tr>` : '') + b.sections.filter((s) => s.total || !extra).map((s) => `
    <tr><td style="padding:18px 0 6px;font:600 13px/18px Georgia,serif;letter-spacing:.06em;text-transform:uppercase;color:#8c1c32">◆ ${esc(s.title)} · ${s.total}</td></tr>
    ${s.items.length ? s.items.map((i) => `<tr><td style="padding:4px 0;font:15px/21px Georgia,serif;color:#1a1a1a">${i.title ? esc(i.title) : '<i style="color:#777">запис вищого грифа — відкрийте платформу</i>'}${i.note ? ` <span style="color:#777">— ${esc(i.note)}</span>` : ''}</td></tr>`).join('') : `<tr><td style="padding:4px 0;font:14px/20px Georgia,serif;color:#999">${esc(s.empty)}</td></tr>`}
    ${s.total > s.items.length ? `<tr><td style="padding:2px 0;font:13px Georgia,serif;color:#777">… і ще ${s.total - s.items.length}</td></tr>` : ''}`).join('')
    + (extra && quiet.length ? `<tr><td style="padding:8px 0 0;font:13px/19px Georgia,serif;color:#999">Без змін: ${quiet.map((s) => esc(s.title.toLowerCase())).join(', ')}.</td></tr>` : '');
  return `<!doctype html><html><body style="margin:0;background:#f4f3f1">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f1"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2e0dc;padding:28px 32px">
    <tr><td style="font:600 12px/16px Georgia,serif;letter-spacing:.2em;color:#555">REACTION CORE</td></tr>
    <tr><td style="padding-top:6px;font:400 28px/34px Georgia,serif;color:#111">Ранковий бриф${name ? `, ${esc(name.split(' ')[0])}` : ''}</td></tr>
    <tr><td style="padding-top:4px;font:14px Georgia,serif;color:#777">За добу до ${esc(new Date(b.until).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))} · потребує уваги: ${b.attention}</td></tr>
    ${extra}
    ${sec}
    ${appUrl ? `<tr><td style="padding-top:24px"><a href="${esc(appUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font:600 14px Georgia,serif;padding:12px 20px">Відкрити платформу</a></td></tr>` : ''}
    <tr><td style="padding-top:24px;font:12px/17px Georgia,serif;color:#999">Назви записів вище грифа LUMEN у листі не показуються. Вимкнути бриф: Налаштування → Ранковий бриф.</td></tr>
  </table></td></tr></table></body></html>`;
}

/* ---------- The analytical part of the e-mail: charts, forecast, what to develop ---------- */

const PROJECT_STATES = ['Планується', 'Триває', 'На паузі', 'Завершено'];
const daysBetween = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / DAY);

/**
 * Figures for the analytical part: the week's activity by day, projects by state, tasks, a forecast at the present
 * pace and the projects worth developing (or deciding on). Pure: the same records the brief reads.
 * Titles above `nameUpTo` are not given (only «засекречений проєкт»).
 */
export function buildInsights({ records = [], tasks = [], me, now = Date.now(), nameUpTo }) {
  const top = nameUpTo ?? me.clearance;
  const mine = records.filter((r) => (r.clearance ?? 0) <= me.clearance && r.div !== 'info');
  // A classified project is named by its number among the classified ones (never by its title).
  const hidden = new Map();
  const name = (r) => ((r.clearance ?? 0) <= top ? titleOfRecord(r) : `засекречений проєкт ${hidden.get(r.id) || hidden.set(r.id, hidden.size + 1).get(r.id)}`);
  const today = isoDay(now);
  const day0 = isoDay(now - 6 * DAY);

  // Activity of the last 7 days: records created, records changed, notes added to projects' work logs.
  const days = Array.from({ length: 7 }, (_, i) => isoDay(now - (6 - i) * DAY));
  const activity = days.map((d) => ({ day: d, created: 0, updated: 0, notes: 0 }));
  const at = (iso) => activity.find((x) => x.day === String(iso || '').slice(0, 10));
  for (const r of mine) {
    const c = at(r.at); if (c) c.created++;
    const u = at(r.updated); if (u && String(r.updated).slice(0, 10) !== String(r.at || '').slice(0, 10)) u.updated++;
    for (const e of Array.isArray(r.entries) ? r.entries : []) { const n = at(e.at); if (n) n.notes++; }
  }
  const sum = (list) => list.reduce((a, x) => a + x.created + x.updated + x.notes, 0);
  const prevWeek = mine.filter((r) => { const t = String(r.updated || r.at || '').slice(0, 10); return t >= isoDay(now - 13 * DAY) && t < day0; }).length;
  const thisWeek = sum(activity);

  // Projects.
  const projects = mine.filter((r) => r.div === 'prj' && r.col === 'projects');
  const byState = PROJECT_STATES.map((s) => ({ label: s, n: projects.filter((p) => (p.state || 'Планується') === s).length }));
  const live = projects.filter((p) => p.state !== 'Завершено');
  const lastMove = (p) => {
    const notes = (Array.isArray(p.entries) ? p.entries : []).map((e) => e.at).filter(Boolean);
    return [p.updated, p.at, ...notes].filter(Boolean).sort().pop() || p.at;
  };
  const view = (p, why, score) => ({ id: p.id, title: name(p), level: p.clearance ?? 0, state: p.state || 'Планується', why, score });
  const ideas = [];
  for (const p of live) {
    const idle = lastMove(p) ? daysBetween(lastMove(p), new Date(now).toISOString()) : 0;
    const notes7 = (Array.isArray(p.entries) ? p.entries : []).filter((e) => String(e.at || '') >= day0).length;
    if (p.deadline && p.deadline < today) ideas.push(view(p, `термін минув ${p.deadline} — оновіть термін або завершіть`, 90));
    else if (p.deadline && p.deadline <= isoDay(now + 14 * DAY)) ideas.push(view(p, `термін ${p.deadline}, лишилося ${daysBetween(today, p.deadline)} дн.`, 80 - daysBetween(today, p.deadline)));
    if (p.state === 'Триває' && idle >= 7) ideas.push(view(p, `без руху ${idle} дн. — варто повернутися або поставити на паузу`, 60 + Math.min(idle, 30)));
    if (p.state === 'Планується' && idle >= 14) ideas.push(view(p, `планується вже ${idle} дн. — запустити чи відкласти`, 50));
    if (p.state === 'Триває' && notes7 >= 3) ideas.push(view(p, `набирає темп: ${notes7} записів за тиждень — варто розвивати далі`, 40 + notes7));
    if (p.state === 'На паузі' && idle >= 30) ideas.push(view(p, `на паузі ${idle} дн. — вирішити: відновити чи закрити`, 30));
  }
  const seen = new Set();
  const develop = ideas.sort((a, b) => b.score - a.score).filter((x) => (seen.has(x.id) ? false : seen.add(x.id))).slice(0, 5);

  // Tasks: open, overdue, done this week, and the pace.
  const myTasks = tasks.filter((t) => (t.clearance ?? 0) <= me.clearance && (t.assignee === me.id || t.author === me.id));
  const open = myTasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.due && t.due < today);
  const doneWeek = myTasks.filter((t) => t.status === 'done' && String(t.doneAt || t.updated || '').slice(0, 10) >= day0);
  const newWeek = myTasks.filter((t) => String(t.at || '').slice(0, 10) >= day0);
  const pace = doneWeek.length / 7; // a day
  const forecast = {
    tasksOpen: open.length,
    clearDays: pace > 0 ? Math.ceil(open.length / pace) : null,
    backlogTrend: newWeek.length - doneWeek.length, // > 0: the pile grows
    deadlines30: live.filter((p) => p.deadline && p.deadline >= today && p.deadline <= isoDay(now + 30 * DAY)).length,
    forecastsDue: mine.filter((r) => r.col === 'judgments' && r.kind === 'Прогноз' && isOpen(r) && r.due && r.due <= isoDay(now + 7 * DAY)).length,
    activityTrend: prevWeek ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100) : null,
  };
  return {
    activity, thisWeek, prevWeek,
    projects: { total: projects.length, live: live.length, byState },
    tasks: { open: open.length, overdue: overdue.length, doneWeek: doneWeek.length, newWeek: newWeek.length },
    forecast, develop,
  };
}

/** Conclusions without the model: plain statements read off the figures (also the fallback when no model answers). */
export function plainConclusions(ins) {
  const out = [];
  const f = ins.forecast;
  if (f.activityTrend != null) out.push(f.activityTrend >= 0 ? `Активність за тиждень зросла на ${f.activityTrend}% порівняно з попереднім.` : `Активність за тиждень знизилась на ${-f.activityTrend}% порівняно з попереднім.`);
  else if (ins.thisWeek) out.push(`За тиждень — ${ins.thisWeek} дій у записах і проєктах.`);
  if (ins.projects.live) out.push(`У роботі ${ins.projects.live} з ${ins.projects.total} проєктів.`);
  if (ins.tasks.overdue) out.push(`Прострочених завдань: ${ins.tasks.overdue} — їх варто закрити або перенести першими.`);
  if (f.backlogTrend > 0) out.push(`Нових завдань за тиждень більше, ніж виконаних (+${f.backlogTrend}): черга росте.`);
  if (f.clearDays != null && ins.tasks.open) out.push(`За поточного темпу відкриті завдання (${ins.tasks.open}) буде закрито приблизно за ${f.clearDays} дн.`);
  if (f.deadlines30) out.push(`Термінів проєктів у найближчі 30 днів: ${f.deadlines30}.`);
  if (!out.length) out.push('За тиждень змін небагато — гарний момент спланувати наступні кроки в проєктах.');
  return out.slice(0, 5);
}

/** What the model is given: figures and the names it may see, nothing above LUMEN. */
export function insightsPrompt(ins, b) {
  const facts = {
    activity7days: ins.activity.map((x) => ({ day: x.day, actions: x.created + x.updated + x.notes })),
    thisWeek: ins.thisWeek, prevWeek: ins.prevWeek,
    projects: ins.projects, tasks: ins.tasks, forecast: ins.forecast,
    candidates: ins.develop.map((x) => ({ project: x.title, state: x.state, signal: x.why })),
    today: b ? b.sections.filter((s) => s.total).map((s) => ({ section: s.title, count: s.total })) : [],
  };
  return [
    { role: 'system', content: 'Ти — аналітик внутрішньої платформи. За цифрами нижче напиши українською стислий ранковий аналіз для керівника. '
      + 'Спирайся лише на подані цифри й назви, нічого не вигадуй. Пиши «рф», «росія» з малої. '
      + 'Відповідай лише JSON: {"conclusions": ["2–4 висновки, кожен одне речення з цифрою"], "forecast": "1–2 речення: що буде за поточного темпу за тиждень", "develop": [{"project": "назва з candidates", "next": "один конкретний наступний крок"}]} — develop до 3, лише з candidates.' },
    { role: 'user', content: JSON.stringify(facts) },
  ];
}
export function readInsights(raw, ins) {
  try {
    const s = String(raw || '');
    const j = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    const names = new Set(ins.develop.map((x) => x.title));
    return {
      conclusions: (Array.isArray(j.conclusions) ? j.conclusions : []).map(String).filter((x) => x.length > 10).slice(0, 4),
      forecast: typeof j.forecast === 'string' ? j.forecast.slice(0, 400) : '',
      develop: (Array.isArray(j.develop) ? j.develop : []).filter((x) => x && names.has(x.project) && x.next).map((x) => ({ project: String(x.project), next: String(x.next).slice(0, 240) })).slice(0, 3),
    };
  } catch { return null; }
}

// E-mail-safe charts: plain table bars (pictures and SVG are blocked by many mail clients).
const bar = (n, max, color = '#8c1c32') => (n > 0 && max
  ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr><td style="height:12px;width:${Math.max(2, Math.round((n / max) * 100))}%;background:${color}"></td><td style="height:12px"></td></tr></table>`
  : '<div style="height:12px;border-bottom:1px solid #e2e0dc"></div>');
const DAYS_UA = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export function insightsHtml(ins, ai = null, news = []) {
  const head = (t) => `<tr><td style="padding:22px 0 8px;font:600 13px/18px Georgia,serif;letter-spacing:.06em;text-transform:uppercase;color:#8c1c32">◆ ${esc(t)}</td></tr>`;
  const p = (t, c = '#1a1a1a') => `<tr><td style="padding:3px 0;font:15px/22px Georgia,serif;color:${c}">${t}</td></tr>`;
  const maxA = Math.max(1, ...ins.activity.map((x) => x.created + x.updated + x.notes));
  const act = ins.activity.map((x) => { const n = x.created + x.updated + x.notes; return `<tr><td style="width:36px;font:12px Georgia,serif;color:#777;padding:2px 6px 2px 0">${DAYS_UA[new Date(x.day).getUTCDay()]} ${+x.day.slice(8)}</td><td style="padding:2px 0">${bar(n, maxA)}</td><td style="width:28px;text-align:right;font:12px Georgia,serif;color:#555">${n}</td></tr>`; }).join('');
  const maxS = Math.max(1, ...ins.projects.byState.map((x) => x.n));
  const states = ins.projects.byState.map((x) => `<tr><td style="width:96px;font:12px Georgia,serif;color:#777;padding:2px 6px 2px 0">${esc(x.label)}</td><td style="padding:2px 0">${bar(x.n, maxS, '#333')}</td><td style="width:28px;text-align:right;font:12px Georgia,serif;color:#555">${x.n}</td></tr>`).join('');
  const t = ins.tasks;
  const conclusions = (ai?.conclusions?.length ? ai.conclusions : plainConclusions(ins)).map((c) => p(`· ${esc(c)}`)).join('');
  const f = ins.forecast;
  const forecastText = ai?.forecast || [
    f.clearDays != null && t.open ? `За поточного темпу (${t.doneWeek} виконано за тиждень) відкриті завдання буде закрито приблизно за ${f.clearDays} дн.` : t.open ? `Відкритих завдань ${t.open}, а за тиждень жодне не закрито — без руху черга лишиться.` : 'Відкритих завдань немає.',
    f.deadlines30 ? `Найближчі 30 днів: ${f.deadlines30} термін(и) проєктів.` : '',
    f.forecastsDue ? `Аналітичних прогнозів на перевірку цього тижня: ${f.forecastsDue}.` : '',
  ].filter(Boolean).join(' ');
  const steps = new Map((ai?.develop || []).map((x) => [x.project, x.next]));
  const develop = ins.develop.length ? ins.develop.map((x) => p(`<b>${esc(x.title)}</b> <span style="color:#777">· ${esc(x.state)}</span><br><span style="color:#555">${esc(x.why)}${steps.get(x.title) ? `. Наступний крок: ${esc(steps.get(x.title))}` : ''}</span>`)).join('') : p('Усі проєкти рухаються за планом — нових сигналів немає.', '#999');
  const newsRows = news.length ? head('Ключові новини доби · CONTEXT') + news.map((n) => p(`· ${esc(n)}`)).join('') : '';
  return `
    ${p('<span style="font-size:13px;color:#777">Повний бриф із графіками й схемами — у PDF у вкладенні.</span>')}
    ${head('Аналітичні висновки')}${conclusions}
    ${head('Активність за 7 днів')}<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${act}</table></td></tr>
    ${p(`<span style="font-size:13px;color:#777">Створено, змінено записів і додано записів у роботу над проєктами. Цього тижня: ${ins.thisWeek}${ins.prevWeek ? `, минулого: ${ins.prevWeek}` : ''}.</span>`)}
    ${ins.projects.total ? `${head(`Проєкти за станом · ${ins.projects.total}`)}<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${states}</table></td></tr>` : ''}
    ${head('Завдання')}<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${[['відкрито', t.open, '#111'], ['прострочено', t.overdue, '#8c1c32'], ['нових за тиждень', t.newWeek, '#555'], ['виконано за тиждень', t.doneWeek, '#2e6b3f']].map(([l, n, c]) => `<td style="padding:6px 8px 6px 0;vertical-align:top"><div style="font:400 26px/30px Georgia,serif;color:${c}">${n}</div><div style="font:12px Georgia,serif;color:#777">${l}</div></td>`).join('')}
    </tr></table></td></tr>
    ${head('Прогноз')}${p(esc(forecastText))}
    ${head('Що варто розвивати')}${develop}
    ${newsRows}`;
}

/** The analytical part in plain text (the letter's text version). */
export function insightsText(ins, ai = null, news = []) {
  const f = ins.forecast;
  const lines = ['АНАЛІТИЧНІ ВИСНОВКИ', ...(ai?.conclusions?.length ? ai.conclusions : plainConclusions(ins)).map((c) => `  · ${c}`)];
  lines.push('', `АКТИВНІСТЬ ЗА 7 ДНІВ: ${ins.activity.map((x) => x.created + x.updated + x.notes).join(' · ')} (цього тижня ${ins.thisWeek}${ins.prevWeek ? `, минулого ${ins.prevWeek}` : ''})`);
  lines.push(`ЗАВДАННЯ: відкрито ${ins.tasks.open}, прострочено ${ins.tasks.overdue}, виконано за тиждень ${ins.tasks.doneWeek}`);
  if (ai?.forecast) lines.push('', `ПРОГНОЗ: ${ai.forecast}`);
  else if (f.clearDays != null) lines.push('', `ПРОГНОЗ: відкриті завдання буде закрито приблизно за ${f.clearDays} дн.`);
  if (ins.develop.length) {
    const steps = new Map((ai?.develop || []).map((x) => [x.project, x.next]));
    lines.push('', 'ЩО ВАРТО РОЗВИВАТИ', ...ins.develop.map((x) => `  · ${x.title} (${x.state}): ${x.why}${steps.get(x.title) ? `. Наступний крок: ${steps.get(x.title)}` : ''}`));
  }
  if (news.length) lines.push('', 'КЛЮЧОВІ НОВИНИ ДОБИ · CONTEXT', ...news.map((n) => `  · ${n}`));
  return lines.join('\n');
}

/* ---------- Security picture: the GPR index and the oblasts' official air-raid alerts ---------- */

// A schematic map of Ukraine: one tile per oblast in its rough place (west → east, north → south). A tile map reads
// at a glance in a letter and needs no borders; it is a scheme, not a geographic map.
export const UA_GRID = [
  ['Волинська', 1, 0], ['Рівненська', 2, 0], ['Житомирська', 3, 0], ['Київська', 4, 0], ['Чернігівська', 5, 0], ['Сумська', 6, 0],
  ['Львівська', 0, 1], ['Тернопільська', 1, 1], ['Хмельницька', 2, 1], ['Вінницька', 3, 1], ['Київ', 4, 1], ['Полтавська', 5, 1], ['Харківська', 6, 1], ['Луганська', 7, 1],
  ['Закарпатська', 0, 2], ['Івано-Франківська', 1, 2], ['Чернівецька', 2, 2], ['Кіровоградська', 3, 2], ['Черкаська', 4, 2], ['Дніпропетровська', 5, 2], ['Донецька', 6, 2],
  ['Одеська', 3, 3], ['Миколаївська', 4, 3], ['Херсонська', 5, 3], ['Запорізька', 6, 3],
  ['Севастополь', 4, 4], ['Крим', 5, 4],
];
const OCCUPIED = new Set(['Крим', 'Севастополь']); // temporarily occupied: no alerts data, shown apart
const keyOf = (name) => String(name || '').replace(/^м\.\s*|^місто\s*/i, '').replace(/\s*(область|обл\.?)$/i, '').replace(/^Автономна Республіка\s*/i, '').trim();
/** Tiles with the oblasts' alert hours (7 days and 24 hours); null where no data was read. */
export function alertTiles(alerts) {
  const by = new Map(Object.entries(alerts?.byOblast || {}).map(([n, v]) => [keyOf(n), v]));
  return UA_GRID.map(([key, c, r]) => ({ key, c, r, occupied: OCCUPIED.has(key), h7: by.get(key)?.h7 ?? null, h24: by.get(key)?.h24 ?? null }));
}
/** The GPR picture: the last 30 days (raw daily values), the week's mean against the month's. */
export function gprPicture(series) {
  const s = (series || []).filter((p) => Number.isFinite(p?.value)).slice(-30);
  if (s.length < 10) return null;
  const mean = (l) => l.reduce((a, p) => a + p.value, 0) / (l.length || 1);
  const week = mean(s.slice(-7)); const month = mean(s);
  return { days: s, week: Math.round(week), month: Math.round(month), change: Math.round(((week - month) / month) * 100), last: s.at(-1).date };
}
// A tile's colour: the brand crimson at a strength that follows the hours (semi-transparent over the page).
export const heat = (h, max) => (h == null || !max ? 0 : Math.max(0.08, Math.min(1, h / max)));
const mix = (a) => { const c = [140, 28, 50]; const w = [255, 255, 255]; return `#${c.map((v, i) => Math.round(w[i] + (v - w[i]) * a).toString(16).padStart(2, '0')).join('')}`; };

export function worldHtml({ gpr, alerts } = {}) {
  const head = (t) => `<tr><td style="padding:22px 0 8px;font:600 13px/18px Georgia,serif;letter-spacing:.06em;text-transform:uppercase;color:#8c1c32">◆ ${esc(t)}</td></tr>`;
  const note = (t) => `<tr><td style="padding:4px 0;font:12px/17px Georgia,serif;color:#777">${t}</td></tr>`;
  let out = '';
  const g = gprPicture(gpr);
  if (g) {
    const max = Math.max(...g.days.map((d) => d.value));
    const bars = g.days.map((d) => `<td style="vertical-align:bottom;padding:0 1px"><div style="height:${Math.max(2, Math.round((d.value / max) * 56))}px;background:${d.value >= g.month ? '#8c1c32' : '#c9b48f'}"></div></td>`).join('');
    out += head('Індекс геополітичного ризику (GPR)')
      + `<tr><td style="font:15px/22px Georgia,serif;color:#1a1a1a">Середнє за тиждень <b>${g.week}</b> · за місяць ${g.month} · ${g.change >= 0 ? 'вище' : 'нижче'} місячного на ${Math.abs(g.change)}%</td></tr>`
      + `<tr><td style="padding-top:6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:58px"><tr>${bars}</tr></table></td></tr>`
      + note(`Щоденний індекс Caldara–Iacoviello за 30 днів (100 — середній рівень 1985–2019), останній день у даних — ${esc(g.last)}. Бордовим — дні вище місячного середнього.`);
  }
  const tiles = alertTiles(alerts);
  const known = tiles.filter((t) => t.h7 != null);
  if (known.length) {
    const max = Math.max(1, ...known.map((t) => t.h7));
    const rows = [0, 1, 2, 3, 4].map((r) => `<tr>${Array.from({ length: 8 }, (_, c) => {
      const t = tiles.find((x) => x.r === r && x.c === c);
      if (!t) return '<td style="width:12.5%;padding:2px"></td>';
      const bg = t.occupied ? '#e4e1dc' : t.h7 == null ? '#f4f3f1' : mix(heat(t.h7, max));
      const dark = !t.occupied && t.h7 != null && heat(t.h7, max) > 0.55;
      return `<td style="width:12.5%;padding:2px"><div style="background:${bg};border:1px solid ${t.occupied ? '#cfcac2' : '#e2e0dc'};height:46px;padding:4px;font:10px/12px Georgia,serif;color:${dark ? '#fff' : '#333'}">${esc(t.key.slice(0, 10))}<br><b style="font-size:13px">${t.occupied ? 'окуп.' : t.h7 == null ? '—' : `${Math.round(t.h7)} год`}</b></div></td>`;
    }).join('')}</tr>`).join('');
    const top = [...known].filter((t) => !t.occupied).sort((a, b) => b.h7 - a.h7).slice(0, 3);
    out += head('Повітряні тривоги за 7 днів')
      + `<tr><td style="font:15px/22px Georgia,serif;color:#1a1a1a">Найдовше під тривогою: ${top.map((t) => `<b>${esc(t.key)}</b> (${Math.round(t.h7)} год)`).join(', ')}.</td></tr>`
      + `<tr><td style="padding-top:6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`
      + note('Схема областей, не карта. Насиченість — сумарні години офіційних повітряних тривог за тиждень (дані alerts.in.ua). Це огляд минулого тижня, а не прогноз; тимчасово окуповані території — сірим.');
  }
  return out;
}
