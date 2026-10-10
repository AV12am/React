// Vercel Function: weekly encrypted backup of the database (scripts/lib/backup.mjs).
//
// GET  /api/backup   Authorization: Bearer <CRON_SECRET>  (Vercel Cron, Mondays — see vercel.json)
//   Writes backups/rc-<date>.json.enc to Supabase Storage (bucket SUPABASE_BUCKET or «vault»; no person can
//   read that path through the API) and keeps the last 8.
// POST /api/backup   an administrator: makes a backup now and returns the encrypted file to download.
// Needs BACKUP_KEY (a long passphrase kept outside the platform — without it a copy cannot be read).
// Files themselves stay in Storage; the copy holds the database: people, records, the Vault index, settings.
import { env, json, db, caller, SB_URL, SERVICE } from './_core.js';
import { BACKUP_TABLES, encryptBackup } from '../scripts/lib/backup.mjs';

export const config = { maxDuration: 60 };
const BUCKET = env.SUPABASE_BUCKET || env.VITE_SUPABASE_BUCKET || 'vault';
const KEEP = 8;

const storage = (path, opts = {}) => {
  const headers = { apikey: SERVICE, ...(opts.headers || {}) };
  if (SERVICE.startsWith('eyJ')) headers.Authorization = `Bearer ${SERVICE}`;
  return fetch(`${SB_URL}/storage/v1/${path}`, { ...opts, headers });
};

async function makeBackup(now = new Date()) {
  const tables = {};
  for (const [t, q] of BACKUP_TABLES) tables[t] = await db(`${t}?${q}`).catch((e) => { throw new Error(`${t}: ${e.message}`); });
  const file = encryptBackup({ app: 'reaction-core', at: now.toISOString(), tables }, env.BACKUP_KEY);
  const name = `backups/rc-${now.toISOString().slice(0, 10)}.json.enc`;
  const up = await storage(`object/${BUCKET}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' }, body: file });
  if (!up.ok) throw new Error(`storage ${up.status} ${(await up.text().catch(() => '')).slice(0, 160)}`);
  // Keep the last KEEP copies.
  const list = await storage(`object/list/${BUCKET}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: 'backups/', limit: 100, sortBy: { column: 'name', order: 'desc' } }) });
  const names = list.ok ? (await list.json()).map((o) => o.name).filter((n) => /^rc-.*\.json\.enc$/.test(n)).sort().reverse() : [];
  const old = names.slice(KEEP).map((n) => `backups/${n}`);
  if (old.length) await storage(`object/${BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: old }) }).catch(() => {});
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  await db('core_docs', { method: 'POST', prefer: 'return=minimal', body: { kind: 'audit', id: `a-bk-${now.getTime().toString(36)}`, doc: { id: `a-bk-${now.getTime().toString(36)}`, at: now.toISOString(), actor: null, type: 'system', text: `Резервну копію збережено: ${name} (${(file.length / 1024).toFixed(0)} КБ)`, clearance: 1 } } }).catch(() => {});
  return { name, size: file.length, counts, file, removed: old.length };
}

const notReady = () => (!SB_URL || !SERVICE ? 'Потрібні SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY' : !env.BACKUP_KEY ? 'Резервні копії не налаштовані: додайте BACKUP_KEY (довга фраза, зберігайте її окремо від платформи)' : '');

export async function GET(req) {
  if (!env.CRON_SECRET) return json(503, { error: 'not_configured', message: 'CRON_SECRET не задано' });
  if ((req.headers.get('authorization') || '') !== `Bearer ${env.CRON_SECRET}`) return json(401, { error: 'unauthorized' });
  const why = notReady();
  if (why) return json(503, { error: 'not_configured', message: why });
  try {
    const { file, ...out } = await makeBackup();
    return json(200, out);
  } catch (e) { return json(500, { error: 'error', message: e.message }); }
}

export async function POST(req) {
  const why = notReady();
  if (why) return json(503, { error: 'not_configured', message: why });
  try {
    const me = await caller(req);
    if (!me || me.doc?.role !== 'admin') return json(403, { error: 'admin', message: 'Лише адміністратор' });
    const { file, name } = await makeBackup();
    return new Response(file, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name.split('/').pop()}"`, 'Cache-Control': 'no-store' } });
  } catch (e) { return json(500, { error: 'error', message: e.message }); }
}
