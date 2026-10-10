// Web Push to members' phones and browsers. Subscriptions live in core_docs (kind «push», one per member)
// at a level no person can read, so only the server sees them. Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// and VAPID_SUBJECT (mailto:…) — generate once with `npx web-push generate-vapid-keys`.
import webpush from 'web-push';
import { env, db } from './_core.js';

export const PUSH_LEVEL = 99; // above every clearance: unreadable through row-level security
export const pushReady = () => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
let configured = false;
const setup = () => {
  if (configured) return;
  webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:admin@example.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  configured = true;
};

export async function subsOf(memberId) {
  const [row] = await db(`core_docs?kind=eq.push&id=eq.${encodeURIComponent(memberId)}&select=doc`);
  return row?.doc?.subs || [];
}
export async function saveSubs(memberId, subs) {
  await db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: [{ kind: 'push', id: memberId, doc: { id: memberId, clearance: PUSH_LEVEL, subs } }] });
}

/** Sends one notification to each device of these members; forgets devices that are gone. Returns how many got it. */
export async function sendPush(memberIds, { title, body = '', url = '/', tag } = {}) {
  if (!pushReady() || !memberIds?.length) return 0;
  setup();
  const ids = [...new Set(memberIds)].slice(0, 50);
  const rows = await db(`core_docs?kind=eq.push&id=in.(${ids.map((i) => `"${i}"`).join(',')})&select=id,doc`);
  const payload = JSON.stringify({ title: String(title).slice(0, 120), body: String(body).slice(0, 300), url, tag });
  let sent = 0;
  for (const row of rows) {
    const subs = row.doc?.subs || [];
    const keep = [];
    for (const s of subs) {
      try { await webpush.sendNotification(s, payload, { TTL: 3600 }); sent++; keep.push(s); } catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) keep.push(s); }
    }
    if (keep.length !== subs.length) await saveSubs(row.id, keep).catch(() => {});
  }
  return sent;
}
