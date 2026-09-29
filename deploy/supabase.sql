-- Reaction Core · Supabase schema: sign-in, people, shared records and file storage,
-- with the classification enforced by the database itself.
--
-- Run once in the Supabase SQL editor (safe to re-run). Then:
--   1. Authentication → Providers → Email: on; "Allow new users to sign up": OFF.
--   2. Authentication → Users → Add user: e-mail + password for each person.
--   3. Build the app with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Vercel → Settings → Environment Variables).
-- The first person to sign in becomes the administrator; everyone else must be added in «Доступи»
-- with the same e-mail they sign in with.
--
-- What the database guarantees (not just the interface):
--   · nothing is readable without signing in (the anon key alone gets nothing);
--   · a record, file card or file body above a person's clearance is never returned to them;
--   · a NON OCULIS file body is served only to its owner or to people granted a basis for it;
--   · nobody can raise their own role or clearance; leads cannot grant more than they hold.

/* ---------- tables ---------- */

create table if not exists public.core_members (
  id text primary key,               -- the app's user id
  email text unique,                 -- the sign-in e-mail (lower case)
  doc jsonb not null,                -- name, code, role, division, clearance, status, grants, basis…
  updated_at timestamptz not null default now()
);

create table if not exists public.core_docs (
  kind text not null,                -- records · requests · audit
  id text not null,
  doc jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

create table if not exists public.vault_files   (id text primary key, doc jsonb not null, created_at timestamptz default now());
create table if not exists public.vault_folders (id text primary key, doc jsonb not null, created_at timestamptz default now());

insert into storage.buckets (id, name, public, file_size_limit)
values ('vault', 'vault', false, 52428800)
on conflict (id) do nothing;

/* ---------- who is asking ---------- */

create or replace function public.core_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- The caller's member record, or null (not signed in, not a member, or suspended).
create or replace function public.core_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select doc || jsonb_build_object('id', id) from public.core_members
  where email = public.core_email() and coalesce(doc ->> 'status', 'active') <> 'suspended'
  limit 1
$$;

create or replace function public.core_level() returns int
language sql stable as $$ select coalesce((public.core_me() ->> 'clearance')::int, -1) $$;

create or replace function public.core_role() returns text
language sql stable as $$ select coalesce(public.core_me() ->> 'role', '') $$;

create or replace function public.level_of(d jsonb) returns int
language sql immutable as $$ select coalesce((d ->> 'clearance')::int, 0) $$;

-- May the caller read a document of this level?
create or replace function public.core_can(d jsonb) returns boolean
language sql stable as $$ select public.core_me() is not null and public.level_of(d) <= public.core_level() $$;

/* ---------- first administrator ---------- */

-- Whether anyone has been added yet (the directory itself is hidden from non-members).
create or replace function public.core_initialised() returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from public.core_members) $$;

-- The first person to sign in claims the administrator seat; afterwards this always fails.
create or replace function public.core_claim_first_admin(p_id text, p_doc jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.core_email() = '' then raise exception 'not signed in'; end if;
  lock table public.core_members in exclusive mode;
  if exists (select 1 from public.core_members) then raise exception 'already initialised'; end if;
  perform set_config('core.bootstrap', 'on', true);
  insert into public.core_members (id, email, doc)
  values (p_id, public.core_email(), p_doc || jsonb_build_object('email', public.core_email(), 'role', 'admin', 'clearance', 2, 'status', 'active'));
  return (select doc from public.core_members where id = p_id);
end $$;

/* ---------- people: who may change what ---------- */

create or replace function public.core_members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me jsonb := public.core_me();
  role text := coalesce(me ->> 'role', '');
  lvl int := coalesce((me ->> 'clearance')::int, -1);
  keys text[] := array['role', 'clearance', 'status', 'division', 'grants', 'basis'];
  k text;
begin
  if current_setting('core.bootstrap', true) = 'on' then return new; end if;
  new.email := lower(new.email);
  new.updated_at := now();
  if role = 'admin' then return new; end if;

  if tg_op = 'INSERT' then
    if role <> 'lead' then raise exception 'only an administrator or a lead may add people'; end if;
    if new.doc ->> 'role' = 'admin' then raise exception 'only an administrator may add an administrator'; end if;
    if public.level_of(new.doc) > lvl then raise exception 'cannot grant a clearance above your own'; end if;
    return new;
  end if;

  -- UPDATE
  if new.email is distinct from old.email or new.id <> old.id then raise exception 'e-mail and id are fixed'; end if;
  if role = 'lead' then
    if new.doc ->> 'role' = 'admin' and old.doc ->> 'role' <> 'admin' then raise exception 'only an administrator may appoint an administrator'; end if;
    if old.doc ->> 'role' = 'admin' then raise exception 'a lead cannot change an administrator'; end if;
    if public.level_of(new.doc) > lvl then raise exception 'cannot grant a clearance above your own'; end if;
    return new;
  end if;
  -- Everyone else: only their own card, and none of the fields that give access.
  if old.id <> me ->> 'id' then raise exception 'you can change only your own profile'; end if;
  foreach k in array keys loop
    if k = 'status' and old.doc ->> 'status' = 'invited' and new.doc ->> 'status' = 'active' then continue; end if;
    if (new.doc -> k) is distinct from (old.doc -> k) then raise exception 'field % is managed by an administrator', k; end if;
  end loop;
  return new;
end $$;

drop trigger if exists core_members_guard on public.core_members;
create trigger core_members_guard before insert or update on public.core_members
  for each row execute function public.core_members_guard();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists core_docs_touch on public.core_docs;
create trigger core_docs_touch before insert or update on public.core_docs
  for each row execute function public.touch_updated_at();

/* ---------- row-level security ---------- */

alter table public.core_members  enable row level security;
alter table public.core_docs     enable row level security;
alter table public.vault_files   enable row level security;
alter table public.vault_folders enable row level security;

-- Start from nothing: drop policies from earlier versions of this file (they allowed anon).
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('core_members', 'core_docs', 'vault_files', 'vault_folders') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('vault read', 'vault write', 'vault delete') loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
revoke all on public.core_members, public.core_docs, public.vault_files, public.vault_folders from anon;

-- People: every member sees the directory; changes go through the guard above.
create policy members_read   on public.core_members for select to authenticated using (public.core_me() is not null);
create policy members_add    on public.core_members for insert to authenticated with check (public.core_role() in ('admin', 'lead'));
create policy members_change on public.core_members for update to authenticated using (public.core_me() is not null) with check (public.core_me() is not null);
create policy members_remove on public.core_members for delete to authenticated using (public.core_role() = 'admin');

-- Shared records, requests and the audit log: by clearance. The audit log is append-only.
create policy docs_read   on public.core_docs for select to authenticated using (public.core_can(doc));
create policy docs_add    on public.core_docs for insert to authenticated with check (public.core_can(doc));
create policy docs_change on public.core_docs for update to authenticated using (kind <> 'audit' and public.core_can(doc)) with check (public.core_can(doc));
create policy docs_remove on public.core_docs for delete to authenticated using (kind <> 'audit' and public.core_can(doc));

-- Vault index: a file card is visible up to the reader's clearance.
create policy files_read   on public.vault_files for select to authenticated using (public.core_can(doc));
create policy files_add    on public.vault_files for insert to authenticated with check (public.core_can(doc));
create policy files_change on public.vault_files for update to authenticated using (public.core_can(doc)) with check (public.core_can(doc));
create policy files_remove on public.vault_files for delete to authenticated using (public.core_can(doc));
create policy folders_read on public.vault_folders for select to authenticated using (public.core_me() is not null);
create policy folders_add  on public.vault_folders for insert to authenticated with check (public.core_can(doc));

-- File bodies: readable only through a visible file card; NON OCULIS also needs a basis.
create or replace function public.core_can_object(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vault_files f
    where f.doc ->> 'ref' = p_name
      and public.core_can(f.doc)
      and (coalesce((f.doc ->> 'sealed')::boolean, false) = false
           or f.doc ->> 'owner' = public.core_me() ->> 'id'
           or coalesce(public.core_me() -> 'basis', '[]'::jsonb) ? f.id)
  )
$$;

drop policy if exists vault_objects_read on storage.objects;
drop policy if exists vault_objects_add on storage.objects;
drop policy if exists vault_objects_remove on storage.objects;
create policy vault_objects_read   on storage.objects for select to authenticated using (bucket_id = 'vault' and public.core_can_object(name));
create policy vault_objects_add    on storage.objects for insert to authenticated with check (bucket_id = 'vault' and public.core_me() is not null);
create policy vault_objects_remove on storage.objects for delete to authenticated using (bucket_id = 'vault' and public.core_can_object(name));
