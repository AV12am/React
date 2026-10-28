// Vercel Function: the platform assistant, on Cloudflare Workers AI (free daily allowance).
//
// POST /api/assistant  Authorization: Bearer <Supabase access token>
//   { messages: [{ role: 'user'|'assistant', content }], context }  → { reply, used, limit }
//
// Only a member with a passkey-confirmed session may ask. The browser sends LUMEN context only
// (src/lib/assistant.js); this function adds nothing from the database. The Cloudflare token stays here.
// A daily per-person limit (ASSISTANT_DAILY, 60 by default) keeps the team inside the free allowance.
//
// Vercel environment: CF_AI_TOKEN (Cloudflare API token with «Workers AI» read/edit),
// CF_ACCOUNT_ID (or R2_ACCOUNT_ID — the same Cloudflare account), optionally CF_AI_MODEL.
import { json, db, caller, env } from './_core.js';

export const config = { maxDuration: 30 };

const ACCOUNT = env.CF_ACCOUNT_ID || env.R2_ACCOUNT_ID || '';
const TOKEN = env.CF_AI_TOKEN || '';
const MODEL = env.CF_AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const DAILY = +env.ASSISTANT_DAILY || 60;

const SCHEMA = {
  type: 'object',
  properties: { reply: { type: 'string' }, actions: { type: 'array', items: { type: 'object' } } },
  required: ['reply'],
};

async function run(messages, structured) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: 800, temperature: 0.2, ...(structured ? { response_format: { type: 'json_schema', json_schema: SCHEMA } } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw Object.assign(new Error(data.errors?.[0]?.message || `Workers AI ${res.status}`), { status: res.status });
  return data.result?.response ?? '';
}

// Today's count for this person (core_docs kind 'ai-usage', not readable from the browser's level).
async function count(memberId) {
  const id = `${memberId}-${new Date().toISOString().slice(0, 10)}`;
  const [row] = await db(`core_docs?kind=eq.ai-usage&id=eq.${encodeURIComponent(id)}&select=doc`).catch(() => []);
  const n = (+row?.doc?.n || 0) + 1;
  await db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { kind: 'ai-usage', id, doc: { id, member: memberId, n, clearance: 99 } } }).catch(() => {});
  return n;
}

export async function POST(req) {
  if (!ACCOUNT || !TOKEN) return json(503, { error: 'not_configured', message: 'Помічника ще не підключено: потрібні CF_AI_TOKEN і CF_ACCOUNT_ID у Vercel' });
  try {
    const m = await caller(req);
    if (!m) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    const body = await req.json().catch(() => ({}));
    const guide = String(body.guide || '').slice(0, 6000);
    const context = String(body.context || '').slice(0, 9000);
    const history = (Array.isArray(body.messages) ? body.messages : []).slice(-12)
      .filter((x) => x && (x.role === 'user' || x.role === 'assistant'))
      .map((x) => ({ role: x.role, content: String(x.content || '').slice(0, 2000) }));
    if (!history.length || history.at(-1).role !== 'user') return json(400, { error: 'empty', message: 'Порожнє питання' });
    const used = await count(m.id);
    if (used > DAILY) return json(429, { error: 'limit', message: `Ліміт на сьогодні вичерпано (${DAILY} запитів). Завтра помічник знову доступний.` });
    const messages = [{ role: 'system', content: `${guide}\n\nКонтекст (лише LUMEN):\n${context}` }, ...history];
    let reply;
    try { reply = await run(messages, true); } catch (e) { if (e.status >= 500) throw e; reply = await run(messages, false); }
    return json(200, { reply, used, limit: DAILY });
  } catch (e) {
    return json(502, { error: 'ai', message: `Помічник не відповів: ${e.message}` });
  }
}
