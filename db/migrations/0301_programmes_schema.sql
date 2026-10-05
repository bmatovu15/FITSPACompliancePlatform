-- Phase 2: the Comply catalogue becomes data, so a new regulator needs no developer.
-- Additive only: nothing existing is changed or removed. Applicability is declarative:
--   member answers (prog_questions) -> audience label on each obligation -> rule on that label (prog_audiences).
-- Member progress reuses member_comply_workspace (module_key = programme id) and, for Apply,
-- member_licence_applications / _item_state / _files (application_key = prog_programmes.application_key).

create table if not exists public.prog_programmes (
  id              text primary key,
  regulator_id    uuid not null references public.regulators(id) on delete restrict,
  name            text not null,
  blurb           text not null default '',
  application_key text,
  screens         text not null default 'generic' check (screens in ('dedicated','generic')),
  route           text,
  status          text not null default 'draft' check (status in ('draft','published')),
  phases          text[] not null default '{}',
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.prog_questions (
  programme_id text not null references public.prog_programmes(id) on delete cascade,
  key          text not null,
  label        text not null,
  help         text not null default '',
  kind         text not null default 'yesno' check (kind in ('yesno','yesnomaybe','single')),
  options      jsonb not null default '[]'::jsonb,
  sort_order   integer not null default 0,
  primary key (programme_id, key)
);

create table if not exists public.prog_audiences (
  programme_id text not null references public.prog_programmes(id) on delete cascade,
  label        text not null,
  mode         text not null default 'all' check (mode in ('always','all','any','never')),
  conds        jsonb not null default '[]'::jsonb,
  primary key (programme_id, label)
);

create table if not exists public.prog_obligations (
  id           uuid primary key default gen_random_uuid(),
  programme_id text not null references public.prog_programmes(id) on delete cascade,
  ref          text not null,
  title        text not null,
  grp          text not null default '',
  obligation_type text not null default '',
  source       text not null default '',
  guidance     text not null default '',
  evidence     text not null default '',
  applies      text not null default '',
  due_date     date,
  status       text not null default 'active' check (status in ('active','retired')),
  sort_order   integer not null default 0,
  extra        jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  unique (programme_id, ref)
);
create index if not exists prog_obligations_programme_idx on public.prog_obligations (programme_id, status);

create table if not exists public.prog_events (
  programme_id text not null references public.prog_programmes(id) on delete cascade,
  id           text not null,
  title        text not null,
  description  text not null default '',
  obligation_refs text[] not null default '{}',
  needs        jsonb not null default '[]'::jsonb,
  sort_order   integer not null default 0,
  extra        jsonb not null default '{}'::jsonb,
  primary key (programme_id, id)
);

create table if not exists public.prog_controls (
  programme_id text not null references public.prog_programmes(id) on delete cascade,
  id           text not null,
  title        text not null,
  obligation_refs text[] not null default '{}',
  sort_order   integer not null default 0,
  primary key (programme_id, id)
);

-- Regulator-level fields the AI assistant needs (replaces hard-coded lists in code).
alter table public.regulators add column if not exists website  text not null default '';
alter table public.regulators add column if not exists acronyms text not null default '';
alter table public.regulators add column if not exists short_name text not null default '';

-- Row level security: everyone can read a published programme; only staff write.
alter table public.prog_programmes  enable row level security;
alter table public.prog_questions   enable row level security;
alter table public.prog_audiences   enable row level security;
alter table public.prog_obligations enable row level security;
alter table public.prog_events      enable row level security;
alter table public.prog_controls    enable row level security;

create policy "read published programmes" on public.prog_programmes for select using (status = 'published' or public.is_staff());
create policy "staff manage programmes"  on public.prog_programmes for all using (public.is_staff()) with check (public.is_staff());

do $$
declare t text;
begin
  foreach t in array array['prog_questions','prog_audiences','prog_obligations','prog_events','prog_controls'] loop
    execute format($f$create policy "read published %1$s" on public.%1$s for select using (
      public.is_staff() or exists (select 1 from public.prog_programmes p where p.id = %1$s.programme_id and p.status = 'published'))$f$, t);
    execute format($f$create policy "staff manage %1$s" on public.%1$s for all using (public.is_staff()) with check (public.is_staff())$f$, t);
  end loop;
end $$;
