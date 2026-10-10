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
  const mine = records.filter((r) => (r.clearance ?? 0) <= me.clearance);
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
    .map((t) => ({ id: t.id, task: true, target: t.target || null, level: t.clearance ?? 0, title: (t.clearance ?? 0) <= top ? t.title : null, note: t.due ? (t.due < today ? `прострочено з ${t.due}` : t.due === today ? 'сьогодні' : `до ${t.due}`) : 'нове' }));
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
export function briefText(b, { name = '', appUrl = '' } = {}) {
  const lines = [`Ранковий бриф Reaction Core${name ? ` — ${name}` : ''}`, `За добу до ${new Date(b.until).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}`, ''];
  for (const s of b.sections) {
    lines.push(`${s.title}: ${s.total}`);
    for (const i of s.items) lines.push(`  · ${i.title ?? 'запис вищого грифа'}${i.note ? ` — ${i.note}` : ''}`);
    if (s.total > s.items.length) lines.push(`  … і ще ${s.total - s.items.length}`);
  }
  if (appUrl) lines.push('', `Відкрити: ${appUrl}`);
  return lines.join('\n');
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function briefHtml(b, { name = '', appUrl = '' } = {}) {
  const sec = b.sections.map((s) => `
    <tr><td style="padding:18px 0 6px;font:600 13px/18px Georgia,serif;letter-spacing:.06em;text-transform:uppercase;color:#8c1c32">◆ ${esc(s.title)} · ${s.total}</td></tr>
    ${s.items.length ? s.items.map((i) => `<tr><td style="padding:4px 0;font:15px/21px Georgia,serif;color:#1a1a1a">${i.title ? esc(i.title) : '<i style="color:#777">запис вищого грифа — відкрийте платформу</i>'}${i.note ? ` <span style="color:#777">— ${esc(i.note)}</span>` : ''}</td></tr>`).join('') : `<tr><td style="padding:4px 0;font:14px/20px Georgia,serif;color:#999">${esc(s.empty)}</td></tr>`}
    ${s.total > s.items.length ? `<tr><td style="padding:2px 0;font:13px Georgia,serif;color:#777">… і ще ${s.total - s.items.length}</td></tr>` : ''}`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f4f3f1">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f1"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2e0dc;padding:28px 32px">
    <tr><td style="font:600 12px/16px Georgia,serif;letter-spacing:.2em;color:#555">REACTION CORE</td></tr>
    <tr><td style="padding-top:6px;font:400 28px/34px Georgia,serif;color:#111">Ранковий бриф${name ? `, ${esc(name.split(' ')[0])}` : ''}</td></tr>
    <tr><td style="padding-top:4px;font:14px Georgia,serif;color:#777">За добу до ${esc(new Date(b.until).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))} · потребує уваги: ${b.attention}</td></tr>
    ${sec}
    ${appUrl ? `<tr><td style="padding-top:24px"><a href="${esc(appUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font:600 14px Georgia,serif;padding:12px 20px">Відкрити платформу</a></td></tr>` : ''}
    <tr><td style="padding-top:24px;font:12px/17px Georgia,serif;color:#999">Назви записів вище грифа LUMEN у листі не показуються. Вимкнути бриф: Налаштування → Ранковий бриф.</td></tr>
  </table></td></tr></table></body></html>`;
}
