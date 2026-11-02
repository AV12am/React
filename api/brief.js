// Vercel Function: the morning brief by e-mail (src/lib/brief.js).
//
// GET  /api/brief   Authorization: Bearer <CRON_SECRET>   (Vercel Cron, 06:00 UTC: 08:00 Kyiv in winter, 09:00 in summer — see vercel.json)
//   For every active member who has not switched the brief off: builds their brief within their clearance
//   and sends it through Resend. Titles above LUMEN never go into the letter — they are counted only.
//   The letter opens with the analysis: conclusions, the week's activity and projects in bar charts, tasks, a
//   forecast at the present pace and the projects worth developing; then the day's items and CONTEXT's key news.
//   A letter with nothing at all to say (no items, no projects, no tasks, no activity) is not sent.
//
// POST /api/brief  Authorization: Bearer <Supabase access token>
//   «Надіслати мені зараз» from Settings: sends the caller their own brief.
//
// Needs RESEND_API_KEY and BRIEF_FROM (e.g. "Reaction Core <brief@your-domain>") in the environment,
// plus SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. APP_URL is the link in the letter (optional).
import Anthropic from '@anthropic-ai/sdk';
import { briefPdf } from '../src/lib/briefPdf.js';
import { refreshAlerts, readAlerts, uaShapes } from './_alerts.js';
import { buildBrief, briefHtml, briefText, buildInsights, insightsHtml, worldHtml, insightsText, insightsPrompt, readInsights } from '../src/lib/brief.js';
import { env, json, db, caller, SB_URL, SERVICE } from './_core.js';
import { sendPush, pushReady } from './_push.js';

export const config = { maxDuration: 120 };

const RESEND = env.RESEND_API_KEY || '';
const FROM = env.BRIEF_FROM || '';

async function load() {
  const [members, docs] = await Promise.all([
    db('core_members?select=id,email,doc'),
    db('core_docs?select=kind,doc&kind=in.(records,requests,tasks,comments)'),
  ]);
  return {
    members,
    records: docs.filter((d) => d.kind === 'records').map((d) => d.doc),
    requests: docs.filter((d) => d.kind === 'requests').map((d) => d.doc),
    tasks: docs.filter((d) => d.kind === 'tasks').map((d) => d.doc),
    comments: docs.filter((d) => d.kind === 'comments').map((d) => d.doc),
  };
}

// The analytical part: figures from the records; the conclusions, the forecast and the next steps written by Claude Haiku
// (the same key as CONTEXT News; well under a cent a letter) — and read off the figures when no model answers.
// The model is given numbers and the names of LUMEN records only.
const claudeKey = () => env.ANTHROPIC_API_KEY || env.context_new || '';
let claude = null;
async function analyse(ins, b) {
  if (!claudeKey()) return null;
  try {
    claude ||= new Anthropic({ apiKey: claudeKey(), maxRetries: 1 });
    const [sys, user] = insightsPrompt(ins, b);
    const res = await claude.messages.create({
      model: 'claude-haiku-5-5', max_tokens: 700, thinking: { type: 'disabled' }, output_config: { effort: 'low' },
      system: sys.content, messages: [{ role: 'user', content: user.content }],
    }, { timeout: 20000 });
    return readInsights(res.content.filter((x) => x.type === 'text').map((x) => x.text).join(''), ins);
  } catch { return null; }
}
// Yesterday's key news from CONTEXT News (the first sentence of each), for the letter's last part.
async function keyNews() {
  try {
    const [row] = await db('core_docs?kind=eq.news&id=eq.issue&select=doc');
    const key = row?.doc?.sections?.find((s) => s.id === 'key');
    return (key?.items || []).slice(0, 5).map((x) => String(x.summary || x.title || '').split(/(?<=[.!?])\s/)[0].slice(0, 220)).filter(Boolean);
  } catch { return []; }
}
const insightsFor = (m, data, now) => buildInsights({
  records: data.records, tasks: data.tasks, now, nameUpTo: 0,
  me: { id: m.id, role: m.doc?.role, clearance: Math.max(0, Math.min(2, +m.doc?.clearance || 0)) },
});
// The designed PDF goes with the letter (charts, schemes, the full analysis). Its font (Noto Serif, with Cyrillic)
// is the site's own, read once per run.
let fontsP = null;
const pdfFonts = (appUrl) => (fontsP ||= Promise.all(['Regular', 'Bold'].map(async (w) => {
  const res = await fetch(`${appUrl.replace(/\/$/, '')}/fonts/NotoSerif-${w}.ttf`);
  if (!res.ok) throw new Error(`font ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
})).catch((e) => { fontsP = null; throw e; }));
// The security picture for every letter of the run: the GPR series the platform already keeps, and the oblasts'
// air-raid alerts (refreshed here as far as the API lets; what was read before stands otherwise).
async function worldOf(refresh) {
  const [gprRow, alerts] = await Promise.all([
    db('core_docs?kind=eq.pulse&id=eq.gpr&select=doc').catch(() => []),
    refresh ? refreshAlerts(30000).catch(() => readAlerts()) : readAlerts(),
  ]);
  // The oblasts' outlines only when there are alerts to show on them.
  const shapes = Object.keys(alerts?.byOblast || {}).length ? await uaShapes() : [];
  return { gpr: gprRow?.[0]?.doc?.series || [], alerts, shapes };
}
async function letter(m, data, now, news, appUrl, world = {}) {
  const b = briefFor(m, data, now);
  const ins = insightsFor(m, data, now);
  const ai = await analyse(ins, b);
  let pdf = null;
  try {
    const bytes = await briefPdf({ brief: b, insights: ins, ai, news, world, name: m.doc?.name || '', fonts: await pdfFonts(appUrl) });
    pdf = { filename: `Reaction-brief-${new Date(now).toISOString().slice(0, 10)}.pdf`, content: Buffer.from(bytes).toString('base64') };
  } catch { pdf = null; } // the letter goes without the PDF rather than not at all
  return { b, ins, pdf, extra: insightsHtml(ins, ai, news) + worldHtml(world), extraText: insightsText(ins, ai, news), ai: Boolean(ai) };
}

const subjectOf = (b) => `Ранковий бриф · ${new Date(b.until).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: 'numeric', month: 'long' })}${b.attention ? ` · потребує уваги: ${b.attention}` : ''}`;

async function send(to, b, name, appUrl, extra = '', extraText = '', pdf = null) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject: subjectOf(b), html: briefHtml(b, { name, appUrl, extra }), text: briefText(b, { name, appUrl, extraText }), ...(pdf ? { attachments: [pdf] } : {}) }),
  });
  if (!res.ok) throw new Error(`mail ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

const briefFor = (m, data, now) => buildBrief({
  records: data.records, requests: data.requests, tasks: data.tasks, comments: data.comments, users: data.members.map((x) => ({ id: x.id, name: x.doc?.name })), now, nameUpTo: 0,
  me: { id: m.id, role: m.doc?.role, clearance: Math.max(0, Math.min(2, +m.doc?.clearance || 0)) },
});
// Where the letter goes: the address the person gave for letters; the sign-in address (a login, not always a real
// mailbox) only when none is given.
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const mailOf = (m) => { const own = String(m?.doc?.mailTo || '').trim(); return MAIL.test(own) ? own : own ? '' : (MAIL.test(m?.email || '') ? m.email : ''); };
const appUrlOf = (req) => env.APP_URL || `https://${req.headers.get('host') || ''}`;
const notReady = () => (!SB_URL || !SERVICE ? 'Потрібні SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY'
  : !RESEND || !FROM ? 'Поштова розсилка не налаштована: додайте RESEND_API_KEY і BRIEF_FROM у Vercel' : '');

export async function GET(req) {
  const secret = env.CRON_SECRET;
  if (!secret) return json(503, { error: 'not_configured', message: 'CRON_SECRET не задано' });
  if ((req.headers.get('authorization') || '') !== `Bearer ${secret}`) return json(401, { error: 'unauthorized' });
  const why = notReady();
  if (why) return json(503, { error: 'not_configured', message: why });
  try {
    const data = await load();
    const now = Date.now();
    let sent = 0; let skipped = 0; const errors = [];
    const [news, world] = await Promise.all([keyNews(), worldOf(true)]);
    for (const m of data.members) {
      const d = m.doc || {};
      const to = mailOf(m);
      if (!to || d.status !== 'active' || d.brief === false) { skipped++; continue; }
      const { b, ins, extra, extraText, pdf } = await letter(m, data, now, news, appUrlOf(req), world);
      // Sent when there is something to read: the day's items, or a week with projects, tasks or activity.
      if (!b.total && !ins.projects.total && !ins.tasks.open && !ins.thisWeek) { skipped++; continue; }
      try { await send(to, b, d.name || '', appUrlOf(req), extra, extraText, pdf); sent++; } catch (e) { errors.push(e.message); }
      if (b.attention && pushReady()) await sendPush([m.id], { title: 'Ранковий бриф', body: `Потребує уваги: ${b.attention}. Відкрийте «Огляд».`, url: '/#/overview', tag: 'brief' }).catch(() => {});
    }
    return json(200, { sent, skipped, errors });
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}

export async function POST(req) {
  if (!SB_URL || !SERVICE) return json(503, { error: 'not_configured', message: notReady() });
  try {
    const m = await caller(req);
    if (!m) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    const why = notReady();
    if (why) return json(503, { error: 'not_configured', message: why });
    const data = await load();
    const to = mailOf(m);
    if (!to) return json(400, { error: 'no_mail', message: 'Додайте адресу для листів у «Налаштуваннях» → «Ранковий бриф»' });
    const [news, world] = await Promise.all([keyNews(), worldOf(true)]);
    const { b, extra, extraText, ai, pdf } = await letter(m, data, Date.now(), news, appUrlOf(req), world);
    await send(to, b, m.doc?.name || '', appUrlOf(req), extra, extraText, pdf);
    return json(200, { sent: true, to, total: b.total, ai, pdf: Boolean(pdf) });
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
