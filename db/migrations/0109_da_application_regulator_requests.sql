-- Digital Lending Apply (gap DA-11): post-submission tracking of requests made by MRD-MoFPED
-- ("Add request" in the Post-submission tab). closed_at is reserved for a future
-- "response recorded" control (the design never closes a request).
create table if not exists public.member_licence_application_regulator_requests (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.member_licence_applications(id) on delete cascade,
  title          text not null,
  due_date       date,
  closed_at      timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists member_licence_application_regulator_requests_app_idx
  on public.member_licence_application_regulator_requests (application_id, created_at);

alter table public.member_licence_application_regulator_requests enable row level security;

drop policy if exists "manage own or anonymous regulator requests" on public.member_licence_application_regulator_requests;
create policy "manage own or anonymous regulator requests"
  on public.member_licence_application_regulator_requests for all
  using (application_id in (select a.id from public.member_licence_applications a
                            where a.member_id is null or a.member_id = public.current_member_id()))
  with check (application_id in (select a.id from public.member_licence_applications a
                                 where a.member_id is null or a.member_id = public.current_member_id()));

drop policy if exists "staff manage member_licence_application_regulator_requests" on public.member_licence_application_regulator_requests;
create policy "staff manage member_licence_application_regulator_requests"
  on public.member_licence_application_regulator_requests for all
  using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.member_licence_application_regulator_requests to anon, authenticated;
