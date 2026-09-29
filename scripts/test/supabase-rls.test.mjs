// Runs deploy/supabase.sql in PGlite (Postgres in WebAssembly) with stand-ins for Supabase's auth and
// storage schemas, then checks the row-level security as different signed-in people.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const failures = [];
const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, storage, auth to authenticated, anon;
  grant execute on all functions in schema auth to authenticated, anon;
`);
const SQL = fs.readFileSync(new URL('../../deploy/supabase.sql', import.meta.url), 'utf8');
await db.exec(SQL);
await db.exec(SQL); // re-runnable
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, anon; grant select, insert, delete on storage.objects to authenticated;`);

const as = async (email, fn) => {
  await db.exec(`reset role; select set_config('test.jwt', '${email ? JSON.stringify({ email }) : ''}', false); set role ${email ? 'authenticated' : 'anon'};`);
  try { return await fn(); } finally { await db.exec('reset role'); }
};
const tryq = async (s, p) => { try { const r = await q(s, p); return { ok: true, rows: r.rows, n: r.affectedRows }; } catch (e) { return { ok: false, err: e.message.split('\n')[0] }; } };
const ok = (name, cond, extra = '') => { if (!cond) failures.push(`${name}${extra ? ' — ' + extra : ''}`); };

// 1. first sign-in claims admin
let r = await as('boss@x.ua', () => tryq(`select public.core_claim_first_admin('u01', '{"name":"Бос","code":"V-001"}'::jsonb) as d`));
ok('first person becomes admin', r.ok && r.rows[0].d.role === 'admin' && r.rows[0].d.clearance === 2);
r = await as('mallory@x.ua', () => tryq(`select public.core_claim_first_admin('u99', '{}'::jsonb)`));
ok('second claim refused', !r.ok, r.err);

// 2. admin adds people
r = await as('boss@x.ua', () => tryq(`insert into core_members (id, email, doc) values
  ('u02','Lead@X.ua','{"name":"Лід","role":"lead","clearance":1,"status":"active","division":"int"}'),
  ('u03','ann@x.ua','{"name":"Аналітик","role":"analyst","clearance":1,"status":"invited","division":"int"}'),
  ('u04','low@x.ua','{"name":"Новачок","role":"analyst","clearance":0,"status":"active","division":"it"}')`));
ok('admin adds members', r.ok, r.err);
r = await as('lead@x.ua', () => tryq(`select count(*)::int n from core_members`));
ok('e-mail stored lower-case, lead reads directory', r.ok && r.rows[0].n === 4);

// 3. anon and strangers get nothing
r = await as(null, () => tryq(`select count(*)::int n from core_members`));
ok('anon cannot read people', !r.ok || r.rows[0].n === 0, r.err || `rows ${r.rows?.[0].n}`);
r = await as('stranger@x.ua', () => tryq(`select count(*)::int n from core_members`));
ok('signed-in non-member reads nothing', r.ok && r.rows[0].n === 0);

// 4. self-escalation blocked, allowed self edits pass
r = await as('ann@x.ua', () => tryq(`update core_members set doc = jsonb_set(doc, '{clearance}', '2') where id='u03'`));
ok('analyst cannot raise own clearance', !r.ok, r.err);
r = await as('ann@x.ua', () => tryq(`update core_members set doc = doc || '{"name":"Анна","status":"active"}' where id='u03'`));
ok('analyst edits own name and activates invitation', r.ok && r.n === 1, r.err);
r = await as('ann@x.ua', () => tryq(`update core_members set doc = doc || '{"name":"X"}' where id='u04'`));
ok('analyst cannot edit someone else', !r.ok || r.n === 0, r.err);
r = await as('lead@x.ua', () => tryq(`update core_members set doc = jsonb_set(doc, '{clearance}', '2') where id='u04'`));
ok('lead cannot grant above own clearance', !r.ok, r.err);
r = await as('lead@x.ua', () => tryq(`update core_members set doc = jsonb_set(doc, '{clearance}', '1') where id='u04'`));
ok('lead grants up to own clearance', r.ok && r.n === 1, r.err);
r = await as('lead@x.ua', () => tryq(`update core_members set doc = jsonb_set(doc, '{role}', '"admin"') where id='u04'`));
ok('lead cannot appoint admin', !r.ok, r.err);

await as('boss@x.ua', () => tryq(`update core_members set doc = jsonb_set(doc, '{clearance}', '0') where id='u04'`));
// 5. records by clearance
await as('boss@x.ua', () => tryq(`insert into core_docs (kind, id, doc) values
  ('records','w1','{"title":"LUMEN","clearance":0}'), ('records','w2','{"title":"UMBRA","clearance":1}'), ('records','w3','{"title":"NOX","clearance":2}')`));
r = await as('low@x.ua', () => tryq(`select string_agg(id, ',' order by id) s from core_docs where kind='records'`));
ok('LUMEN reader sees only LUMEN', r.rows[0].s === 'w1', r.rows[0].s);
r = await as('ann@x.ua', () => tryq(`select string_agg(id, ',' order by id) s from core_docs where kind='records'`));
ok('UMBRA reader sees LUMEN+UMBRA', r.rows[0].s === 'w1,w2', r.rows[0].s);
r = await as('ann@x.ua', () => tryq(`insert into core_docs (kind,id,doc) values ('records','w4','{"clearance":2}')`));
ok('cannot write above own clearance', !r.ok, r.err);
r = await as('ann@x.ua', () => tryq(`update core_docs set doc='{"clearance":0}' where id='w3'`));
ok('cannot touch NOX record (downgrade trick)', !r.ok || r.n === 0, r.err || `rows ${r.n}`);
await as('ann@x.ua', () => tryq(`insert into core_docs (kind,id,doc) values ('audit','a1','{"text":"x"}')`));
r = await as('ann@x.ua', () => tryq(`delete from core_docs where kind='audit'`));
ok('audit is append-only', !r.ok || r.n === 0);

// 6. files and sealed bodies
await as('boss@x.ua', () => tryq(`insert into vault_files (id, doc) values
  ('x1','{"ref":"x1/a.pdf","clearance":1,"owner":"u01"}'), ('x2','{"ref":"x2/b.pdf","clearance":0,"sealed":true,"owner":"u01"}')`));
await as('boss@x.ua', () => tryq(`insert into storage.objects values ('vault','x1/a.pdf'), ('vault','x2/b.pdf')`));
r = await as('low@x.ua', () => tryq(`select string_agg(name, ',') s from storage.objects`));
ok('LUMEN reader: no UMBRA body, no sealed body', r.rows[0].s === null, r.rows[0].s);
r = await as('low@x.ua', () => tryq(`select count(*)::int n from vault_files`));
ok('LUMEN reader sees the sealed card (LUMEN) but not the UMBRA one', r.rows[0].n === 1);
await as('boss@x.ua', () => tryq(`update core_members set doc = jsonb_set(doc, '{basis}', '["x2"]') where id='u04'`));
r = await as('low@x.ua', () => tryq(`select string_agg(name, ',') s from storage.objects`));
ok('with a basis the sealed body opens', r.rows[0].s === 'x2/b.pdf', r.rows[0].s);
r = await as('stranger@x.ua', () => tryq(`insert into storage.objects values ('vault','evil.bin')`));
ok('non-member cannot upload', !r.ok, r.err);

// 7. suspended member loses everything
await as('boss@x.ua', () => tryq(`update core_members set doc = jsonb_set(doc, '{status}', '"suspended"') where id='u03'`));
r = await as('ann@x.ua', () => tryq(`select count(*)::int n from core_docs`));
ok('suspended member reads nothing', r.rows[0].n === 0);

test('Supabase schema enforces sign-in, clearance and roles', () => {
  assert.deepEqual(failures, []);
});
