// Vercel Function: passwords of the team, set by an administrator.
//
// POST /api/users  Authorization: Bearer <the administrator's Supabase access token>
//   { op: 'password', memberId, password } → { ok, created }
//
// Only an administrator with a passkey-confirmed session (_core.caller) may do it. CUSTOS's password is
// changed only by CUSTOS. The person's Supabase Auth account is created when there is none yet (sign-in
// ready at once, e-mail confirmed); otherwise its password is replaced and their confirmed sessions end, so
// the old password and any open session stop working. The password itself is never stored or logged here.
import crypto from 'node:crypto';
import { json, db, caller, SB_URL, SERVICE } from './_core.js';

export const config = { maxDuration: 15 };

const MIN = 10;

async function auth(path, { method = 'GET', body } = {}) {
  const headers = { apikey: SERVICE, 'Content-Type': 'application/json' };
  if (SERVICE.startsWith('eyJ')) headers.Authorization = `Bearer ${SERVICE}`;
  const res = await fetch(`${SB_URL}/auth/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.msg || data.message || data.error_description || `auth ${res.status}`), { status: res.status });
  return data;
}

// The Auth account with this e-mail, or null (looked through page by page).
async function accountOf(email) {
  for (let page = 1; page <= 50; page++) {
    const r = await auth(`admin/users?page=${page}&per_page=200`);
    const list = r.users || [];
    const hit = list.find((u) => String(u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (list.length < 200) return null;
  }
  return null;
}

export function passwordProblem(p) {
  const s = String(p || '');
  if (s.length < MIN) return `Пароль має містити щонайменше ${MIN} символів`;
  if (s.length > 72) return 'Пароль задовгий (до 72 символів)';
  if (!/[a-zа-яіїєґ]/i.test(s) || !/\d/.test(s)) return 'Пароль має містити літери й цифри';
  return null;
}

export async function POST(req) {
  if (!SB_URL || !SERVICE) return json(503, { error: 'not_configured', message: 'Потрібні SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY' });
  try {
    const m = await caller(req);
    if (!m) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    const body = await req.json().catch(() => ({}));
    if (body.op !== 'password') return json(400, { error: 'op', message: 'Невідома дія' });
    if (m.doc?.role !== 'admin') return json(403, { error: 'role', message: 'Паролі змінює лише адміністратор' });
    const bad = passwordProblem(body.password);
    if (bad) return json(400, { error: 'weak', message: bad });
    const [t] = await db(`core_members?id=eq.${encodeURIComponent(String(body.memberId || ''))}&select=id,email,doc`);
    if (!t) return json(404, { error: 'member', message: 'Співробітника ще не збережено на сервері — спробуйте за кілька секунд' });
    if (!t.email) return json(400, { error: 'email', message: 'У співробітника немає пошти для входу' });
    if (t.doc?.custos && t.id !== m.id) return json(403, { error: 'custos', message: 'Пароль CUSTOS змінює лише CUSTOS' });
    const email = t.email.toLowerCase();
    const acc = await accountOf(email);
    if (acc) await auth(`admin/users/${acc.id}`, { method: 'PUT', body: { password: body.password } });
    else await auth('admin/users', { method: 'POST', body: { email, password: body.password, email_confirm: true } });
    // The old password's sessions end: without the passkey confirmation the database answers nothing.
    // The administrator's own current session is kept.
    const sid = JSON.parse(Buffer.from(((req.headers.get('authorization') || '').split('.')[1]) || '', 'base64url').toString() || '{}').session_id;
    await db(`core_verified?member_id=eq.${encodeURIComponent(t.id)}${t.id === m.id && sid ? `&session_id=neq.${encodeURIComponent(sid)}` : ''}`, { method: 'DELETE' }).catch(() => {});
    const id = `a-pw-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
    await db('core_docs', { method: 'POST', prefer: 'return=minimal', body: { kind: 'audit', id, doc: { id, at: new Date().toISOString(), actor: m.id, type: 'access', text: `${acc ? 'Змінено' : 'Встановлено'} пароль: ${t.doc?.code || ''} ${t.doc?.name || email}` } } }).catch(() => {});
    return json(200, { ok: true, created: !acc });
  } catch (e) {
    return json(e.status === 422 ? 400 : 500, { error: 'error', message: e.status === 422 ? `Supabase відхилив пароль: ${e.message}` : e.message });
  }
}
