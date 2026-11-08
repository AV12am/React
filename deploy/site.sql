-- The public site (reactioncore.uk): SITUATION and CONTEXT for people outside the team, after sign-in with
-- Google, LinkedIn or Apple (Supabase Auth). Run once in Supabase → SQL Editor, after deploy/supabase.sql.
--
-- · site_users  — one row per person who signed in on the site; «pending» until an administrator of the workspace
--                 approves them (Access → «Зовнішні користувачі»); only «approved» people may use SITUATION / CONTEXT.
-- · site_boards — each approved person's own SITUATION dashboards; nobody else reads them.
-- · The workspace stays closed to them: core_me() (every workspace table's check) ignores a session opened with
--   Google / LinkedIn / Apple, even when its e-mail is a team member's.

create table if not exists public.site_users (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  name       text,
  provider   text,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);
create table if not exists public.site_boards (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  doc        jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.site_users  enable row level security;
alter table public.site_boards enable row level security;
revoke all on public.site_users, public.site_boards from anon;

-- Is the caller an approved person of the public site?
create or replace function public.site_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.site_users where id = auth.uid() and status = 'approved')
$$;

do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('site_users', 'site_boards') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
-- A person sees their own row; workspace administrators see everyone (to approve). A person adds only their own
-- row, and only as «pending»; the status is changed by site_decide() below, never by the person.
create policy site_users_read on public.site_users for select to authenticated
  using (id = auth.uid() or public.core_role() = 'admin');
create policy site_users_join on public.site_users for insert to authenticated
  with check (id = auth.uid() and status = 'pending' and decided_at is null and decided_by is null);
-- Dashboards: one's own, and only while approved.
create policy site_boards_own on public.site_boards for all to authenticated
  using (user_id = auth.uid() and public.site_approved())
  with check (user_id = auth.uid() and public.site_approved());

-- An administrator of the workspace approves or blocks a person of the public site.
create or replace function public.site_decide(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.core_role() <> 'admin' then raise exception 'not allowed'; end if;
  if p_status not in ('approved', 'blocked', 'pending') then raise exception 'bad status'; end if;
  update public.site_users set status = p_status, decided_at = now(), decided_by = public.core_me() ->> 'id' where id = p_id;
end $$;
revoke all on function public.site_decide(uuid, text) from anon, public;
grant execute on function public.site_decide(uuid, text) to authenticated;

-- The workspace: a session opened with Google / LinkedIn / Apple (amr «oauth») is never a member.
create or replace function public.core_email() returns text
language sql stable as $$
  select case when coalesce((auth.jwt() -> 'amr') @> '[{"method": "oauth"}]'::jsonb, false) then ''
              else lower(coalesce(auth.jwt() ->> 'email', '')) end
$$;
