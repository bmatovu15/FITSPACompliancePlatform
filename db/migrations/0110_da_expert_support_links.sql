-- Digital Lending Apply (gap DA-09): link an expert question / review request to the
-- application and requirement it is about, so staff can tell which one it concerns.
-- /api/expert-support stores these when present (and still works if this is not applied).
alter table public.expert_support_requests
  add column if not exists application_id uuid references public.member_licence_applications(id) on delete set null,
  add column if not exists external_id text;
-- RLS unchanged (public insert, staff manage, member reads own).
