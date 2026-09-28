-- Reaction Core · central file storage on Supabase (free tier or self-hosted).
-- Run once in the Supabase SQL editor, then build the app with
--   VITE_SUPABASE_URL=https://<project>.supabase.co  VITE_SUPABASE_ANON_KEY=<anon key>  npm run build
--
-- The app's own sign-in is still a front-end prototype, so these policies let the anon key
-- read and write the vault. Keep the app and the Supabase instance behind your VPN or the
-- nginx auth from deploy/nginx.conf until real SSO is wired in; then switch the policies to
-- `authenticated` and check clearance on the server.

-- Bucket for file bodies (private: served only with the key).
insert into storage.buckets (id, name, public, file_size_limit)
values ('vault', 'vault', false, 52428800)
on conflict (id) do nothing;

create policy "vault read"   on storage.objects for select to anon using (bucket_id = 'vault');
create policy "vault write"  on storage.objects for insert to anon with check (bucket_id = 'vault');
create policy "vault delete" on storage.objects for delete to anon using (bucket_id = 'vault');

-- Shared index: one row per file / folder, the app's metadata as JSON.
create table if not exists public.vault_files   (id text primary key, doc jsonb not null, created_at timestamptz default now());
create table if not exists public.vault_folders (id text primary key, doc jsonb not null, created_at timestamptz default now());

alter table public.vault_files   enable row level security;
alter table public.vault_folders enable row level security;

create policy "files rw"   on public.vault_files   for all to anon using (true) with check (true);
create policy "folders rw" on public.vault_folders for all to anon using (true) with check (true);
