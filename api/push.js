// Vercel Function: push notifications (api/_push.js).
//
// GET  /api/push                          → { publicKey } (or 503 when not set up)
// POST /api/push { subscribe: sub }       → stores this device for the signed-in member
// POST /api/push { unsubscribe: endpoint }
// POST /api/push { to: [memberIds], title, body, url }  → notifies colleagues (a mention, a new task, a request)
import { env, json, db, caller, SB_URL, SERVICE } from './_core.js';
import { pushReady, sendPush, subsOf, saveSubs } from './_push.js';

export function GET() {
  return pushReady() ? json(200, { publicKey: env.VAPID_PUBLIC_KEY }) : json(503, { error: 'not_configured', message: 'Push не налаштовано: додайте VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY і VAPID_SUBJECT у Vercel' });
}

const validSub = (s) => s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.keys?.p256dh && s.keys?.auth;

export async function POST(req) {
  if (!SB_URL || !SERVICE || !pushReady()) return json(503, { error: 'not_configured', message: 'Push не налаштовано на сервері' });
  try {
    const me = await caller(req);
    if (!me) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    const body = await req.json().catch(() => ({}));
    if (body.subscribe) {
      if (!validSub(body.subscribe)) return json(400, { error: 'bad', message: 'Неправильна підписка' });
      const subs = (await subsOf(me.id)).filter((s) => s.endpoint !== body.subscribe.endpoint);
      await saveSubs(me.id, [...subs, { endpoint: body.subscribe.endpoint, keys: body.subscribe.keys, at: new Date().toISOString() }].slice(-6));
      return json(200, { ok: true });
    }
    if (body.unsubscribe) {
      await saveSubs(me.id, (await subsOf(me.id)).filter((s) => s.endpoint !== body.unsubscribe));
      return json(200, { ok: true });
    }
    // Only to existing, active members; the text is the sender's and capped.
    const to = (Array.isArray(body.to) ? body.to : []).map(String).filter((id) => id !== me.id).slice(0, 20);
    if (!to.length) return json(200, { sent: 0 });
    const members = await db(`core_members?id=in.(${to.map((i) => `"${encodeURIComponent(i)}"`).join(',')})&select=id,doc`);
    const ok = members.filter((m) => m.doc?.status !== 'suspended').map((m) => m.id);
    const url = typeof body.url === 'string' && body.url.startsWith('#/') ? `/${body.url}` : '/';
    const sent = await sendPush(ok, { title: body.title || `Повідомлення від ${me.doc?.name || 'колеги'}`, body: body.body || '', url });
    return json(200, { sent });
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
