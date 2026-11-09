-- M. Wallace Memorials: two teams (West = Cumbernauld, East = Kinross) instead of 14 areas,
-- plus the new "New bespoke memorials" service. Safe to run more than once.
alter table public.mw_jobs drop constraint if exists mw_jobs_region_check;
update public.mw_jobs set region = case
  when region in ('glasgow','lanarkshire','renfrewshire','ayrshire','dumfries','argyll','central') then 'west'
  when region in ('west','east') then region else 'east' end;
alter table public.mw_jobs add constraint mw_jobs_region_check check (region in ('west','east'));

alter table public.mw_jobs drop constraint if exists mw_jobs_service_check;
alter table public.mw_jobs add constraint mw_jobs_service_check
  check (service in ('memorials','restoration','inscriptions','lead','gilding','bespoke'));
