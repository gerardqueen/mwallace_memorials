-- ============================================================
-- M. Wallace Memorials landing pages — jobs, enquiries, photos, staff
-- Self-contained: everything is prefixed mw_ / mw-, and staff access is its own list
-- (mw_admins), so this can live in a shared Supabase project without M. Wallace staff seeing
-- any other site's data (or the other way round). Works the same in a project of its own.
-- Supabase → SQL Editor → New query → paste → Run. Safe to run more than once.
-- ============================================================

-- ---------- Staff ----------
create table if not exists public.mw_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);
create table if not exists public.mw_access_requests (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

create or replace function public.mw_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mw_admins where user_id = auth.uid());
$$;

-- A signed-in user who isn't staff yet asks for access (shows on the Staff tab).
create or replace function public.mw_request_access() returns void
language sql security definer set search_path = public as $$
  insert into public.mw_access_requests (user_id, email)
  select auth.uid(), (select email from auth.users where id = auth.uid())
  where auth.uid() is not null and not public.mw_is_admin()
  on conflict (user_id) do nothing;
$$;

create or replace function public.mw_approve_admin(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.mw_is_admin() then raise exception 'Only admins can approve staff'; end if;
  insert into public.mw_admins (user_id, email)
  select id, email from auth.users where id = target
  on conflict (user_id) do nothing;
  delete from public.mw_access_requests where user_id = target;
end $$;

create or replace function public.mw_remove_admin(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.mw_is_admin() then raise exception 'Only admins can remove staff'; end if;
  if target = auth.uid() then raise exception 'You can''t remove yourself'; end if;
  delete from public.mw_admins where user_id = target;
end $$;

create or replace function public.mw_list_admins() returns table (user_id uuid, email text)
language sql stable security definer set search_path = public as $$
  select a.user_id, coalesce(a.email, u.email) from public.mw_admins a
  left join auth.users u on u.id = a.user_id
  where public.mw_is_admin() order by a.created_at;
$$;

-- ---------- Jobs (a finished job shown on a region page) ----------
create table if not exists public.mw_jobs (
  id            uuid primary key default gen_random_uuid(),
  region        text not null check (region in (
                  'perth','fife','edinburgh','dundee','central','glasgow','lanarkshire','renfrewshire',
                  'ayrshire','dumfries','borders','aberdeen','highlands','argyll','elsewhere')),
  town          text,
  cemetery      text,                                 -- e.g. "Blair Atholl churchyard"
  service       text check (service in ('restoration','inscriptions','lead','gilding','bespoke')),
  stone         text,                                 -- Granite, Marble, Sandstone, Slate, Other
  title         text,                                 -- optional; page uses the service name
  description   text,
  photos        text[] not null default '{}',         -- public URLs, first one is the cover
  review_text   text,                                 -- only with the customer's permission
  reviewer_name text,                                 -- e.g. "Eleanor, Perth"
  rating        smallint check (rating between 1 and 5),
  published     boolean not null default true,
  featured      boolean not null default false,
  job_date      date default current_date,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists mw_jobs_region_idx on public.mw_jobs (region, published, job_date desc);

-- ---------- Enquiries from the landing pages ----------
create table if not exists public.mw_enquiries (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 200),
  email         text not null check (char_length(email) between 3 and 320),
  phone         text check (char_length(phone) <= 40),
  service       text check (char_length(service) <= 40),
  cemetery      text check (char_length(cemetery) <= 300),
  message       text check (char_length(message) <= 4000),
  photos        text[] not null default '{}' check (cardinality(photos) <= 3),  -- storage paths in mw-enquiry-photos
  region        text check (char_length(region) <= 20),
  page          text check (char_length(page) <= 200),
  handled       boolean not null default false,
  notified_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table public.mw_admins          enable row level security;
alter table public.mw_access_requests enable row level security;
alter table public.mw_jobs            enable row level security;
alter table public.mw_enquiries       enable row level security;

drop policy if exists "mw_admins admin read" on public.mw_admins;
create policy "mw_admins admin read" on public.mw_admins for select using (public.mw_is_admin());
drop policy if exists "mw_requests admin manage" on public.mw_access_requests;
create policy "mw_requests admin manage" on public.mw_access_requests
  for all using (public.mw_is_admin()) with check (public.mw_is_admin());

drop policy if exists "mw_jobs public read" on public.mw_jobs;
create policy "mw_jobs public read" on public.mw_jobs for select using (published or public.mw_is_admin());
drop policy if exists "mw_jobs admin write" on public.mw_jobs;
create policy "mw_jobs admin write" on public.mw_jobs
  for all using (public.mw_is_admin()) with check (public.mw_is_admin());

-- Anyone can send an enquiry, but only a new, unhandled one with photos in the enquiry folder;
-- only staff can read them.
drop policy if exists "mw_enquiries public insert" on public.mw_enquiries;
create policy "mw_enquiries public insert" on public.mw_enquiries
  for insert with check (handled = false and notified_at is null
    and coalesce((select bool_and(p like 'enq/%') from unnest(photos) p), true));
drop policy if exists "mw_enquiries admin manage" on public.mw_enquiries;
create policy "mw_enquiries admin manage" on public.mw_enquiries
  for all using (public.mw_is_admin()) with check (public.mw_is_admin());

grant select on public.mw_jobs to anon, authenticated;
grant insert on public.mw_enquiries to anon, authenticated;
grant all on public.mw_jobs, public.mw_enquiries, public.mw_access_requests to authenticated;
grant select on public.mw_admins to authenticated;
grant execute on function public.mw_is_admin(), public.mw_request_access(), public.mw_approve_admin(uuid),
  public.mw_remove_admin(uuid), public.mw_list_admins() to authenticated;

-- ---------- Storage ----------
-- Job photos: public read (they're on the website), staff upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mw-job-photos', 'mw-job-photos', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
-- Enquiry photos: private. The public can upload (into enq/ only, images only, 8 MB max);
-- only staff can view them, through signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mw-enquiry-photos', 'mw-enquiry-photos', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "mw job photos public read" on storage.objects;
create policy "mw job photos public read" on storage.objects
  for select using (bucket_id = 'mw-job-photos');
drop policy if exists "mw job photos admin write" on storage.objects;
create policy "mw job photos admin write" on storage.objects
  for insert with check (bucket_id = 'mw-job-photos' and public.mw_is_admin());
drop policy if exists "mw job photos admin update" on storage.objects;
create policy "mw job photos admin update" on storage.objects
  for update using (bucket_id = 'mw-job-photos' and public.mw_is_admin());
drop policy if exists "mw job photos admin delete" on storage.objects;
create policy "mw job photos admin delete" on storage.objects
  for delete using (bucket_id = 'mw-job-photos' and public.mw_is_admin());

drop policy if exists "mw enquiry photos public upload" on storage.objects;
create policy "mw enquiry photos public upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'mw-enquiry-photos' and name like 'enq/%');
drop policy if exists "mw enquiry photos admin read" on storage.objects;
create policy "mw enquiry photos admin read" on storage.objects
  for select using (bucket_id = 'mw-enquiry-photos' and public.mw_is_admin());
drop policy if exists "mw enquiry photos admin delete" on storage.objects;
create policy "mw enquiry photos admin delete" on storage.objects
  for delete using (bucket_id = 'mw-enquiry-photos' and public.mw_is_admin());

-- ---------- First admin ----------
-- 1. Open /admin.html on the site and create an account (confirm the email).
-- 2. Put that email below, un-comment the line and run it once. After that, approve
--    everyone else from the Staff tab.
-- insert into public.mw_admins (user_id, email) select id, email from auth.users where email = 'mwallacememorials@gmail.com' on conflict do nothing;
