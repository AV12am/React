// Vercel Function: the morning brief by e-mail (src/lib/brief.js).
//
// GET  /api/brief   Authorization: Bearer <CRON_SECRET>   (Vercel Cron, daily ≈ 08:00 Kyiv — see vercel.json)
//   For every active member who has not switched the brief off: builds their brief within their clearance
//   and sends it through Resend. Titles above LUMEN never go into the letter — they are counted only.
//   An empty brief (nothing new, nothing waiting) is not sent.
//
// POST /api/brief  Authorization: Bearer <Supabase access token>
//   «Надіслати мені зараз» from Settings: sends the caller their own brief.
//
// Needs RESEND_API_KEY and BRIEF_FROM (e.g. "Reaction Core <brief@your-domain>") in the environment,
// plus SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. APP_URL is the link in the letter (optional).
import { buildBrief, briefHtml, briefText } from '../src/lib/brief.js';
import { env, json, db, caller, SB_URL, SERVICE } from './_core.js';

export const config = { maxDuration: 60 };

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

const subjectOf = (b) => `Ранковий бриф · ${new Date(b.until).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: 'numeric', month: 'long' })}${b.attention ? ` · потребує уваги: ${b.attention}` : ''}`;

async function send(to, b, name, appUrl) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject: subjectOf(b), html: briefHtml(b, { name, appUrl }), text: briefText(b, { name, appUrl }) }),
  });
  if (!res.ok) throw new Error(`mail ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

const briefFor = (m, data, now) => buildBrief({
  records: data.records, requests: data.requests, tasks: data.tasks, comments: data.comments, users: data.members.map((x) => ({ id: x.id, name: x.doc?.name })), now, nameUpTo: 0,
  me: { id: m.id, role: m.doc?.role, clearance: Math.max(0, Math.min(2, +m.doc?.clearance || 0)) },
});
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
    for (const m of data.members) {
      const d = m.doc || {};
      if (!m.email || d.status !== 'active' || d.brief === false) { skipped++; continue; }
      const b = briefFor(m, data, now);
      if (!b.total) { skipped++; continue; }
      try { await send(m.email, b, d.name || '', appUrlOf(req)); sent++; } catch (e) { errors.push(e.message); }
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
    const b = briefFor(m, data, Date.now());
    await send(m.email, b, m.doc?.name || '', appUrlOf(req));
    return json(200, { sent: true, to: m.email, total: b.total });
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
