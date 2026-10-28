// The assistant: the model sees LUMEN only; actions are checked against the person's rights;
// the server function keeps the token, counts the daily limit and passes the conversation on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, parseReply, checkAction, findRecords } from '../../src/lib/assistant.js';

const me = { id: 'u1', role: 'analyst', division: 'res', clearance: 2 };
const perms = { divisions: 2 };
const state = {
  records: [
    { id: 'r1', div: 'res', col: 'studies', title: 'Відкрите дослідження ґрунтів', about: 'Опис LUMEN', clearance: 0, entries: [{ title: 'Крок', text: 'Зібрано зразки' }] },
    { id: 'r2', div: 'res', col: 'studies', title: 'Таємне джерело Альфа', about: 'Секретний опис', clearance: 1 },
    { id: 'r3', div: 'res', col: 'studies', title: 'Нічна операція Бета', about: 'NOX опис', clearance: 2 },
  ],
};

test('context: LUMEN only, nothing classified — not even titles', () => {
  const page = buildContext({ state, me, route: { view: 'divisions', sub: 'res', id: 'studies:r1' } });
  assert.match(page, /Відкрите дослідження ґрунтів/);
  assert.match(page, /Зібрано зразки/);
  for (const s of ['Таємне', 'Альфа', 'Секретний', 'Нічна', 'Бета', 'NOX опис']) assert.ok(!page.includes(s), s);
  const closed = buildContext({ state, me, route: { view: 'divisions', sub: 'res', id: 'studies:r3' } });
  assert.match(closed, /вміст тобі недоступний/);
  assert.ok(!closed.includes('Нічна') && !closed.includes('NOX опис'));
});

test('reply parsing', () => {
  assert.deepEqual(parseReply('{"reply":"Так","actions":[{"type":"go","to":"vault"}]}'), { reply: 'Так', actions: [{ type: 'go', to: 'vault' }] });
  assert.deepEqual(parseReply('Ось: {"reply":"ok"} кінець'), { reply: 'ok', actions: [] });
  assert.deepEqual(parseReply('просто текст'), { reply: 'просто текст', actions: [] });
  assert.deepEqual(parseReply({ reply: 'obj', actions: [] }), { reply: 'obj', actions: [] });
});

test('actions are checked against the person', () => {
  const route = { view: 'divisions', sub: 'res', id: 'studies:r1' };
  const opts = { state, me, perms, route, allowed: ['overview', 'divisions', 'vault', 'settings'] };
  assert.deepEqual(checkAction({ type: 'go', to: 'vault' }, opts).route, ['vault', null, null]);
  assert.ok(checkAction({ type: 'go', to: 'access' }, opts).error); // not allowed for this person
  assert.ok(checkAction({ type: 'go', to: 'divisions', division: 'it' }, opts).route[1] === null); // hidden division ignored
  // local lookup reaches classified records the person may see (the model never learns the names)
  assert.equal(findRecords(state, me, 'Альфа')[0].id, 'r2');
  assert.equal(findRecords(state, { ...me, clearance: 0 }, 'Альфа').length, 0);
  const task = checkAction({ type: 'task', title: 'Перевірити', due: '2026-11-01' }, opts);
  assert.equal(task.confirm, true); assert.equal(task.task.target, 'r1'); assert.equal(task.task.due, '2026-11-01');
  const entry = checkAction({ type: 'entry', title: 'Підсумок', text: 'Готово' }, opts);
  assert.equal(entry.kind, 'entry'); assert.equal(entry.confirm, true);
  assert.ok(checkAction({ type: 'entry', text: 'x' }, { ...opts, route: { view: 'vault' } }).error);
  const rec = checkAction({ type: 'record', division: 'res', register: 'studies', title: 'Нове', about: 'Про що' }, opts);
  assert.equal(rec.record.col, 'studies'); assert.equal(rec.record.title, 'Нове'); assert.equal(rec.record.about, 'Про що');
  assert.ok(checkAction({ type: 'record', division: 'ana', register: 'products', title: 'Чуже' }, opts).error); // not a member of Аналітика
  assert.ok(checkAction({ type: 'delete', id: 'r1' }, opts).error);
});

test('server: token stays on the server, daily limit, conversation passed on', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', CF_AI_TOKEN: 'cf-secret', CF_ACCOUNT_ID: 'acc', ASSISTANT_DAILY: '2' });
  let n = 0;
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const ok = (b) => new Response(b == null ? null : JSON.stringify(b), { status: b == null ? 204 : 200 });
    if (u.includes('/auth/v1/user')) return ok({ email: 'me@x.test' });
    if (u.includes('core_members?email=eq')) return ok([{ id: 'u1', email: 'me@x.test', doc: { name: 'Анна', status: 'active', role: 'analyst', clearance: 1 } }]);
    if (u.includes('core_settings')) return ok([{ value: false }]);
    if (u.includes('kind=eq.ai-usage')) return ok(n ? [{ doc: { n } }] : []);
    if (u.includes('core_docs?on_conflict')) { n = JSON.parse(opts.body).doc.n; return ok(null); }
    if (u.startsWith('https://api.cloudflare.com/client/v4/accounts/acc/ai/run/')) {
      sent.push({ auth: opts.headers.Authorization, body: JSON.parse(opts.body) });
      return ok({ success: true, result: { response: { reply: 'Відповідь', actions: [] } } });
    }
    throw new Error(`unexpected ${u}`);
  };
  const token = `x.${Buffer.from(JSON.stringify({ session_id: 's' })).toString('base64url')}.y`;
  try {
    const { POST } = await import('../../api/assistant.js');
    const call = async (body) => { const r = await POST(new Request('https://app.test/api/assistant', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
    const body = { guide: 'G', context: 'C', messages: [{ role: 'user', content: 'Привіт' }] };
    const [s1, r1] = await call(body);
    assert.equal(s1, 200); assert.deepEqual(r1.reply, { reply: 'Відповідь', actions: [] }); assert.equal(r1.used, 1);
    assert.equal(sent[0].auth, 'Bearer cf-secret');
    assert.equal(sent[0].body.messages[0].role, 'system'); assert.match(sent[0].body.messages[0].content, /G[\s\S]*C/);
    assert.equal(sent[0].body.messages.at(-1).content, 'Привіт');
    assert.ok(!JSON.stringify(r1).includes('cf-secret'));
    assert.equal((await call(body))[0], 200);
    assert.equal((await call(body))[0], 429); // over the daily limit
    assert.equal((await call({ messages: [] }))[0], 400);
  } finally { globalThis.fetch = real; }
});
