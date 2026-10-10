// Vercel Function: passkeys (WebAuthn — Face ID, Touch ID, Windows Hello, security keys) as the second
// factor for every Supabase sign-in, and CUSTOS — the single owner who alone issues enrolment codes and
// resets lost keys.
//
// POST /api/passkey  { op, ... }   Authorization: Bearer <the person's Supabase access token>
//   status            → who am I, do I have keys, is this session confirmed, may I enrol without a code
//   register-options  → options to create a passkey ({ code } when enrolling with a code from CUSTOS)
//   register-verify   → store the new passkey, confirm the session; CUSTOS's first key returns recovery codes
//   login-options     → options to confirm the session with an existing passkey
//   login-verify      → confirm the session
//   keys              → my passkeys;  remove-key { id } → remove one of mine (never the last)
//   issue-code        { memberId, reset } → CUSTOS only: one-time enrolment code; reset drops the person's keys
//
// The database (deploy/supabase.sql) returns nothing to a session that is not in core_verified, and only
// this function writes there — with the service key, which never leaves the server.
import crypto from 'node:crypto';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const env = process.env;
const SB_URL = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '';
const RP_NAME = 'Reaction Core';
const SESSION_HOURS = 24; // a confirmed sign-in lasts a day
const CODE_HOURS = 72;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class Fail extends Error { constructor(status, code, message) { super(message || code); this.status = status; this.code = code; } }

/* ---------- Supabase with the service key (server only) ---------- */

async function db(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: SERVICE, 'Content-Type': 'application/json' };
  if (SERVICE.startsWith('eyJ')) headers.Authorization = `Bearer ${SERVICE}`; // legacy JWT keys; sb_secret_… keys go in apikey only
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // A table from deploy/supabase.sql is missing: the schema in Supabase is older than the app.
    if (/PGRST205|42P01/.test(text)) throw new Fail(503, 'schema', 'Схема бази застаріла: запустіть оновлений deploy/supabase.sql у Supabase → SQL Editor і повторіть вхід.');
    throw new Fail(502, 'db', `${res.status} ${text}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}
const q = encodeURIComponent;

/* ---------- helpers ---------- */

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function newCode(len = 10) {
  const bytes = crypto.randomBytes(len);
  const raw = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return raw.match(/.{1,4}/g).join('-');
}
const later = (hours) => new Date(Date.now() + hours * 3600e3).toISOString();

// Which site is asking: passkeys are bound to the host name (RP ID).
function site(req) {
  const origin = req.headers.get('origin');
  if (!origin) throw new Fail(400, 'origin');
  const allowed = (env.PASSKEY_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const u = new URL(origin);
  if (allowed.length ? !allowed.includes(origin) : u.host !== host) throw new Fail(403, 'origin', 'Unknown origin');
  return { origin, rpID: u.hostname };
}

// The person behind the access token, checked by Supabase Auth itself.
async function whoami(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Fail(401, 'signin');
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Fail(401, 'signin');
  const user = await res.json();
  const claims = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString() || '{}');
  const email = String(user.email || '').toLowerCase();
  const sessionId = claims.session_id;
  if (!email || !sessionId) throw new Fail(401, 'signin');
  const [row] = await db(`core_members?email=eq.${q(email)}&select=id,doc`);
  const member = row ? { ...row.doc, id: row.id } : null;
  return { email, sessionId, member };
}

const keysOf = (memberId) => db(`core_passkeys?member_id=eq.${q(memberId)}&select=id,public_key,counter,transports,device,created_at,last_used_at&order=created_at`);
async function isVerified(sessionId, memberId) {
  const rows = await db(`core_verified?session_id=eq.${q(sessionId)}&member_id=eq.${q(memberId)}&expires_at=gt.${q(new Date().toISOString())}&select=session_id`);
  return rows.length > 0;
}
const markVerified = async (sessionId, memberId, info = {}) => {
  await db('core_verified?on_conflict=session_id', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: { session_id: sessionId, member_id: memberId, verified_at: new Date().toISOString(), expires_at: later(SESSION_HOURS) },
  });
  // What device this session is, for «Мої сеанси» — kept at a level no person can read through the API.
  const doc = { id: sessionId, member: memberId, clearance: 99, ua: String(info.ua || '').slice(0, 300), key: info.key || '', at: new Date().toISOString() };
  await db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: [{ kind: 'session', id: sessionId, doc }] }).catch(() => {});
};
const setDoc = (member, patch) => db(`core_members?id=eq.${q(member.id)}`, {
  method: 'PATCH', prefer: 'return=minimal',
  body: { doc: Object.fromEntries(Object.entries({ ...member, ...patch }).filter(([k]) => k !== 'id')) },
});
function audit(actor, text) {
  const id = `a-pk-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  return db('core_docs', { method: 'POST', prefer: 'return=minimal', body: { kind: 'audit', id, doc: { id, at: new Date().toISOString(), actor, type: 'security', text } } }).catch(() => {});
}
async function tooManyFailures(memberId) {
  const since = new Date(Date.now() - 15 * 60e3).toISOString();
  const rows = await db(`core_challenges?member_id=eq.${q(memberId)}&kind=eq.fail&expires_at=gt.${q(since)}&select=id`);
  return rows.length >= 5;
}
const noteFailure = (memberId) => db('core_challenges', { method: 'POST', prefer: 'return=minimal', body: { member_id: memberId, kind: 'fail', expires_at: new Date().toISOString() } });

async function findCode(member, code) {
  const n = normCode(code);
  if (!n) return null;
  const [row] = await db(`core_codes?hash=eq.${sha(n)}&member_id=eq.${q(member.id)}&used_at=is.null&select=hash,kind,expires_at`);
  if (!row || (row.expires_at && Date.parse(row.expires_at) < Date.now())) return null;
  return row;
}

// Make sure the installation has a CUSTOS: the first administrator to reach this function becomes it
// (installations created before CUSTOS existed). Later nobody can take the status over.
async function ensureCustos(member) {
  const [any] = await db(`core_members?doc->>custos=eq.true&select=id`);
  if (any || member.role !== 'admin') return member;
  await setDoc(member, { custos: true });
  await audit(member.id, 'CUSTOS: статус закріплено за першим адміністратором');
  return { ...member, custos: true };
}

/* ---------- operations ---------- */

async function status(ctx) {
  const { member, sessionId } = ctx;
  if (!member) return { member: false };
  if (member.status === 'suspended') return { member: true, suspended: true };
  const me = await ensureCustos(member);
  const keys = await keysOf(me.id);
  const [custos] = await db(`core_members?doc->>custos=eq.true&select=doc`);
  return {
    member: true,
    custos: !!me.custos,
    custosName: custos?.doc?.name || null,
    keys: keys.length,
    verified: await isVerified(sessionId, me.id),
    // CUSTOS's very first key needs no code; afterwards (lost keys) only a recovery code will do.
    enrollFree: !!me.custos && !keys.length && !me.keysEver,
  };
}

async function registerOptions(ctx, body, req) {
  const { member, sessionId } = ctx;
  if (!member || member.status === 'suspended') throw new Fail(403, 'member');
  const me = await ensureCustos(member);
  const keys = await keysOf(me.id);
  let codeHash = null;
  const verified = await isVerified(sessionId, me.id);
  const free = !!me.custos && !keys.length && !me.keysEver;
  if (!verified && !free) {
    if (await tooManyFailures(me.id)) throw new Fail(429, 'locked', 'Забагато спроб. Зачекайте 15 хвилин.');
    const code = await findCode(me, body.code);
    if (!code) { await noteFailure(me.id); throw new Fail(403, 'code', 'Невірний або прострочений код'); }
    codeHash = code.hash;
  }
  const { rpID } = site(req);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME, rpID,
    userName: me.email || ctx.email, userDisplayName: me.name || ctx.email,
    userID: new TextEncoder().encode(me.id),
    attestationType: 'none',
    excludeCredentials: keys.map((k) => ({ id: k.id, transports: k.transports || undefined })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  await db(`core_challenges?member_id=eq.${q(me.id)}&kind=in.(reg,auth)`, { method: 'DELETE' });
  await db('core_challenges', { method: 'POST', prefer: 'return=minimal', body: { member_id: me.id, session_id: sessionId, kind: 'reg', challenge: options.challenge, code_hash: codeHash, expires_at: later(5 / 60) } });
  return { options };
}

async function takeChallenge(member, sessionId, kind) {
  const [ch] = await db(`core_challenges?member_id=eq.${q(member.id)}&session_id=eq.${q(sessionId)}&kind=eq.${kind}&expires_at=gt.${q(new Date().toISOString())}&select=id,challenge,code_hash`);
  if (!ch) throw new Fail(400, 'challenge', 'Час на підтвердження минув. Спробуйте ще раз.');
  await db(`core_challenges?id=eq.${ch.id}`, { method: 'DELETE' }); // one use
  return ch;
}

async function registerVerify(ctx, body, req) {
  const { member, sessionId } = ctx;
  if (!member) throw new Fail(403, 'member');
  const ch = await takeChallenge(member, sessionId, 'reg');
  const { origin, rpID } = site(req);
  let v;
  try {
    v = await verifyRegistrationResponse({ response: body.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
  } catch (e) { throw new Fail(400, 'verify', e.message); }
  if (!v.verified) throw new Fail(400, 'verify');
  const c = v.registrationInfo.credential;
  const device = String(body.device || '').slice(0, 60) || 'Пристрій';
  await db('core_passkeys', { method: 'POST', prefer: 'return=minimal', body: { id: c.id, member_id: member.id, public_key: b64u(c.publicKey), counter: c.counter || 0, transports: c.transports || null, device } });
  if (ch.code_hash) await db(`core_codes?hash=eq.${ch.code_hash}`, { method: 'PATCH', prefer: 'return=minimal', body: { used_at: new Date().toISOString() } });
  const first = !member.keysEver;
  if (first) await setDoc(member, { keysEver: true });
  await markVerified(sessionId, member.id, { ua: req.headers.get('user-agent'), key: device });
  await audit(member.id, `Додано ключ доступу: ${device}`);
  // CUSTOS's first key: recovery codes, shown once — the only way back if every key is lost.
  let recovery = null;
  if (member.custos && first) {
    recovery = Array.from({ length: 8 }, () => newCode(10));
    await db(`core_codes?member_id=eq.${q(member.id)}&kind=eq.recovery`, { method: 'DELETE' });
    await db('core_codes', { method: 'POST', prefer: 'return=minimal', body: recovery.map((r) => ({ hash: sha(normCode(r)), member_id: member.id, kind: 'recovery', created_by: member.id })) });
  }
  return { ok: true, recovery };
}

async function loginOptions(ctx, body, req) {
  const { member, sessionId } = ctx;
  if (!member || member.status === 'suspended') throw new Fail(403, 'member');
  const keys = await keysOf(member.id);
  if (!keys.length) throw new Fail(409, 'nokeys', 'Ключів ще немає');
  const { rpID } = site(req);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials: keys.map((k) => ({ id: k.id, transports: k.transports || undefined })) });
  await db(`core_challenges?member_id=eq.${q(member.id)}&kind=in.(reg,auth)`, { method: 'DELETE' });
  await db('core_challenges', { method: 'POST', prefer: 'return=minimal', body: { member_id: member.id, session_id: sessionId, kind: 'auth', challenge: options.challenge, expires_at: later(5 / 60) } });
  return { options };
}

async function loginVerify(ctx, body, req) {
  const { member, sessionId } = ctx;
  if (!member || member.status === 'suspended') throw new Fail(403, 'member');
  if (await tooManyFailures(member.id)) throw new Fail(429, 'locked', 'Забагато спроб. Зачекайте 15 хвилин.');
  const ch = await takeChallenge(member, sessionId, 'auth');
  const [key] = await db(`core_passkeys?id=eq.${q(body.response?.id || '')}&member_id=eq.${q(member.id)}&select=id,public_key,counter,transports,device`);
  if (!key) { await noteFailure(member.id); throw new Fail(403, 'key', 'Цей ключ не належить вашому обліковому запису'); }
  const { origin, rpID } = site(req);
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response: body.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: key.id, publicKey: unb64u(key.public_key), counter: Number(key.counter) || 0, transports: key.transports || undefined },
    });
  } catch (e) { await noteFailure(member.id); throw new Fail(400, 'verify', e.message); }
  if (!v.verified) { await noteFailure(member.id); throw new Fail(400, 'verify'); }
  await db(`core_passkeys?id=eq.${q(key.id)}`, { method: 'PATCH', prefer: 'return=minimal', body: { counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() } });
  await markVerified(sessionId, member.id, { ua: req.headers.get('user-agent'), key: key.device || '' });
  await audit(member.id, `Вхід підтверджено ключем: ${key.device || 'пристрій'}`);
  return { ok: true };
}

async function requireVerified(ctx) {
  if (!ctx.member || !(await isVerified(ctx.sessionId, ctx.member.id))) throw new Fail(403, 'unverified', 'Спершу підтвердіть вхід ключем');
}

async function listKeys(ctx) {
  await requireVerified(ctx);
  return { keys: (await keysOf(ctx.member.id)).map(({ id, device, created_at, last_used_at }) => ({ id, device, created_at, last_used_at })) };
}

// «Мої сеанси»: every confirmed sign-in of mine that is still valid, and ending them.
async function listSessions(ctx) {
  await requireVerified(ctx);
  const rows = await db(`core_verified?member_id=eq.${q(ctx.member.id)}&expires_at=gt.${q(new Date().toISOString())}&select=session_id,verified_at,expires_at&order=verified_at.desc`);
  const ids = rows.map((r) => r.session_id);
  const info = ids.length ? await db(`core_docs?kind=eq.session&id=in.(${ids.map((i) => `"${i}"`).join(',')})&select=id,doc`) : [];
  const by = new Map(info.map((r) => [r.id, r.doc]));
  return { sessions: rows.map((r) => ({ id: r.session_id, current: r.session_id === ctx.sessionId, verifiedAt: r.verified_at, expiresAt: r.expires_at, ua: by.get(r.session_id)?.ua || '', key: by.get(r.session_id)?.key || '' })) };
}

async function endSessions(ctx, body, req) {
  await requireVerified(ctx);
  const all = body.all === true;
  const target = all ? null : String(body.id || '');
  if (!all && (!target || target === ctx.sessionId)) throw new Fail(400, 'session', 'Поточний сеанс завершується кнопкою «Вийти»');
  // Without the confirmation the database answers nothing to that session (core_me), so it is cut off at once.
  const filter = all ? `session_id=neq.${q(ctx.sessionId)}` : `session_id=eq.${q(target)}`;
  await db(`core_verified?member_id=eq.${q(ctx.member.id)}&${filter}`, { method: 'DELETE' });
  if (all) {
    // Also end the other sign-ins at Supabase Auth, so they need the password again.
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    await fetch(`${SB_URL}/auth/v1/logout?scope=others`, { method: 'POST', headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` } }).catch(() => {});
  }
  await audit(ctx.member.id, all ? 'Завершено всі інші сеанси' : 'Завершено сеанс на іншому пристрої');
  return { ok: true };
}

async function removeKey(ctx, body) {
  await requireVerified(ctx);
  const keys = await keysOf(ctx.member.id);
  if (!keys.some((k) => k.id === body.id)) throw new Fail(404, 'key');
  if (keys.length < 2) throw new Fail(409, 'last', 'Останній ключ видалити не можна: спершу додайте інший пристрій');
  await db(`core_passkeys?id=eq.${q(body.id)}&member_id=eq.${q(ctx.member.id)}`, { method: 'DELETE' });
  await audit(ctx.member.id, 'Видалено ключ доступу');
  return { ok: true };
}

async function issueCode(ctx, body) {
  await requireVerified(ctx);
  if (!ctx.member.custos) throw new Fail(403, 'custos', 'Лише CUSTOS видає коди й скидає ключі');
  const [row] = await db(`core_members?id=eq.${q(body.memberId || '')}&select=id,doc`);
  if (!row) throw new Fail(404, 'member');
  const target = { ...row.doc, id: row.id };
  if (target.id === ctx.member.id) throw new Fail(400, 'self', 'Для себе використовуйте резервні коди');
  if (body.reset) {
    await db(`core_passkeys?member_id=eq.${q(target.id)}`, { method: 'DELETE' });
    await db(`core_verified?member_id=eq.${q(target.id)}`, { method: 'DELETE' }); // ends their confirmed sessions
  }
  await db(`core_codes?member_id=eq.${q(target.id)}&kind=eq.enroll&used_at=is.null`, { method: 'DELETE' });
  const code = newCode(10);
  await db('core_codes', { method: 'POST', prefer: 'return=minimal', body: { hash: sha(normCode(code)), member_id: target.id, kind: 'enroll', created_by: ctx.member.id, expires_at: later(CODE_HOURS) } });
  await audit(ctx.member.id, `CUSTOS ${body.reset ? 'скинув ключі та видав' : 'видав'} код прив’язки: ${target.name || target.email}`);
  return { code, expiresHours: CODE_HOURS };
}

const OPS = {
  status, 'register-options': registerOptions, 'register-verify': registerVerify,
  'login-options': loginOptions, 'login-verify': loginVerify, keys: listKeys, 'remove-key': removeKey, 'issue-code': issueCode, sessions: listSessions, 'end-sessions': endSessions,
};

export async function POST(req) {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (!SB_URL || !SERVICE) return json(503, { error: 'not_configured', message: 'На сервері не задано SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
  try {
    const body = await req.json().catch(() => ({}));
    const op = OPS[body.op];
    if (!op) throw new Fail(400, 'op');
    const ctx = await whoami(req);
    return json(200, await op(ctx, body, req));
  } catch (e) {
    const status = e instanceof Fail ? e.status : 500;
    return json(status, { error: e.code || 'error', message: status === 500 ? 'Помилка сервера' : e.message });
  }
}
