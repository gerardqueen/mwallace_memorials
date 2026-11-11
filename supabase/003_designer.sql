-- ============================================================
-- M. Wallace Memorials — online memorial designer catalogue (preview feature)
-- Stones and starting designs that staff manage in admin → Designer.
-- The designer has built-in stones and designs too, so it works before anything is added here.
-- Photos go in the existing public mw-job-photos bucket under designer/.
-- Safe to run more than once.
-- ============================================================
create table if not exists public.mw_design_stones (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'granite' check (kind in ('granite','marble')),
  colour     text default '#333333',
  photo_url  text,
  sort       integer not null default 10,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.mw_design_presets (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  brochure_ref text,
  photo_url    text,
  design       jsonb not null,
  sort         integer not null default 10,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.mw_design_stones  enable row level security;
alter table public.mw_design_presets enable row level security;

drop policy if exists "mw_design_stones read" on public.mw_design_stones;
create policy "mw_design_stones read" on public.mw_design_stones for select using (active or public.mw_is_admin());
drop policy if exists "mw_design_stones admin" on public.mw_design_stones;
create policy "mw_design_stones admin" on public.mw_design_stones for all using (public.mw_is_admin()) with check (public.mw_is_admin());
drop policy if exists "mw_design_presets read" on public.mw_design_presets;
create policy "mw_design_presets read" on public.mw_design_presets for select using (active or public.mw_is_admin());
drop policy if exists "mw_design_presets admin" on public.mw_design_presets;
create policy "mw_design_presets admin" on public.mw_design_presets for all using (public.mw_is_admin()) with check (public.mw_is_admin());

grant select on public.mw_design_stones, public.mw_design_presets to anon, authenticated;
grant all on public.mw_design_stones, public.mw_design_presets to authenticated;
