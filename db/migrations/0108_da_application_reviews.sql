-- Digital Lending Apply (gap DA-10): every "Request review" is stored as its own row
-- (scopes: 'Final application review', 'Application review', 'Review: <requirement title>').
-- Replaces the single overwritten facts.applicationReview object.
create table if not exists public.member_licence_application_reviews (
  id                 uuid primary key default gen_random_uuid(),
  application_id     uuid not null references public.member_licence_applications(id) on delete cascade,
  scope              text not null,
  review_type        text not null default 'interim' check (review_type in ('interim','final','requirement')),
  external_id        text,
  requested_progress integer,
  status             text not null default 'requested',
  requested_at       timestamptz not null default now()
);
create index if not exists member_licence_application_reviews_app_idx
  on public.member_licence_application_reviews (application_id, requested_at desc);

alter table public.member_licence_application_reviews enable row level security;

-- Same model as member_licence_application_item_state / _files: the visitor can manage rows of
-- anonymous (member_id is null) applications or of their own member application. (See
-- 0199_da_rls_proposal.sql for the tightening that is proposed for ALL of these tables.)
drop policy if exists "manage own or anonymous application reviews" on public.member_licence_application_reviews;
create policy "manage own or anonymous application reviews"
  on public.member_licence_application_reviews for all
  using (application_id in (select a.id from public.member_licence_applications a
                            where a.member_id is null or a.member_id = public.current_member_id()))
  with check (application_id in (select a.id from public.member_licence_applications a
                                 where a.member_id is null or a.member_id = public.current_member_id()));

drop policy if exists "staff manage member_licence_application_reviews" on public.member_licence_application_reviews;
create policy "staff manage member_licence_application_reviews"
  on public.member_licence_application_reviews for all
  using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.member_licence_application_reviews to anon, authenticated;
