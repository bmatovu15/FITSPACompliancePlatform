# FITSPA Compliance Platform — Regulatory Body & Annual Obligations Manual

This manual is for FITSPA staff (`is_staff()` accounts) operating the **FITSPA Admin** area
(`/admin`). It covers three recurring jobs:

1. Onboarding a brand-new regulatory body onto the platform.
2. Building a new licence-pathway readiness map (a "wizard → filtered checklist → fees" tool
   like the NPS Licence Pathway or Digital Credit Licence Pathway) from the existing template.
3. Creating, and rolling forward each year, the annual regulatory-obligations calendar for a
   licensed member base (the Compliance Calendar feature).

Everything below can be done from the admin UI plus, where noted, a short SQL migration applied
by whoever holds Supabase project access (the platform's Supabase project is referenced from
`src/lib/supabase/server.ts` / `client.ts`).

---

## 1. Onboarding a new regulatory body

Use this whenever FITSPA needs to bring a new regulator onto the platform — for example, if a
new authority is created, or an existing one (e.g. the Uganda Microfinance Regulatory Authority,
Capital Markets Authority, Insurance Regulatory Authority) needs to be represented for the first
time.

### Step 1 — Add the regulator
Go to **Admin → Regulators** (`/admin/regulators`).
Click **+ Add regulator** and fill in:
- **Name** — the regulator's full name (e.g. "Uganda Microfinance Regulatory Authority").
- **Sector** — a short sector label (e.g. "Microfinance", "Capital Markets").
- **Status** — leave as `Active` unless the regulator is not yet formally recognised.

This creates a row in `public.regulators`, which every other table below references via
`regulator_id`.

### Step 2 — Add its licence types
Go to **Admin → Licences** (`/admin/licences`). Each row is one licence/registration category the
new regulator issues (e.g. "Money Lender's Licence (Form 1)", "NDT MFI Licence (Form 1A)").
Add one row per licence type, selecting the regulator you just created.

### Step 3 — Register real licence numbers as they're confirmed
**Admin → Registry (member IDs)** (`/admin/registrations`) is the source of truth FITSPA
maintains for real licence numbers issued by each regulator. Member signups and licence-number
updates are validated against this table, so add confirmed licence numbers here as the regulator
issues them (or as FITSPA collects them from members).

### Step 4 — Attach fintech verticals, if relevant
If the new regulator serves a fintech vertical not already tracked, add or approve it under
**Admin → Fintech verticals** (`/admin/verticals`). Members can also propose a new vertical at
signup; approve it there to make it available platform-wide.

### Step 5 — Upload its source documents
**Admin → Documents** (`/admin/documents`) is where the regulator's Acts, regulations,
guidelines and forms are uploaded. These are OCR'd and indexed for the AI Assistant
(`/assistant`) to cite — upload the primary legal instruments first (the Act, the main
regulations), then guidelines and forms as they become available.

### Step 6 — Seed its baseline obligations
Once the regulator and its licences exist, add its first obligations under **Admin →
Obligations** (`/admin/obligations`) using **+ Add obligation** (title, legal reference,
description, frequency, penalty, risk level). This is the *simple* obligations feature — good
for a handful of straightforward, always-applicable duties. If the regulator instead needs a
rich, route-dependent annual calendar (deadlines, event triggers, continuous controls — the kind
NPS/BoU has via the Compliance Calendar), see Part 3 below instead of, or in addition to, this
step.

At this point the regulator is fully onboarded: members can be linked to its licences, its
obligations appear on member dashboards, its documents are searchable, and its licence numbers
can be verified against the registry.

---

## 2. Building a new licence-pathway readiness map from the template

A "pathway" tool (like `/nps-pathway` or `/digital-credit-pathway`) is a public, no-login,
self-contained wizard-then-checklist tool: the visitor answers a short set of route questions,
and the tool builds a filtered, phase-by-phase requirements checklist with fees, entirely
client-side (progress is saved to the visitor's own browser via `localStorage`, not the
database — there is no member login involved). Use this pattern when a new regulator's licence
process is complex enough to deserve its own guided tool.

### What you need before starting
A structured breakdown of the licence process as a flat list of requirement rows, each with:
`id, seq, phase, type, requirement, meaning, timing, evidence, level, source, source_link,
condition`, plus one **applicability column per route** the tool should support (e.g. NPS has
`pso`/`psp_other`/`psp_emi`/`instrument`; Digital Credit has `money_lender`/`ndt_mfi`), each
valued `Yes` / `No` / `Conditional` (NPS additionally allows `Information only`). You'll also
need a fee table: `id, sort_order`, whatever category/class/route columns make sense for that
regulator, and the fee amounts.

### Step 1 — Create the two Supabase tables
Model them on `public.nps_requirements` / `public.nps_fee_tiers` (or
`public.digital_credit_requirements` / `public.digital_credit_fees` for the simpler two-route
shape). A Supabase project maintainer runs a migration like:

```sql
create table public.<name>_requirements (
  id text primary key, seq integer not null, phase text not null, type text not null,
  requirement text not null, meaning text not null,
  <route_column_1> text not null check (<route_column_1> in ('Yes','No','Conditional')),
  <route_column_2> text not null check (<route_column_2> in ('Yes','No','Conditional')),
  -- one check-constrained column per route
  timing text, evidence text, level text, source text, source_link text, condition text
);
alter table public.<name>_requirements enable row level security;
create policy "public read <name>_requirements" on public.<name>_requirements for select using (true);
create policy "staff manage <name>_requirements" on public.<name>_requirements for all using (is_staff()) with check (is_staff());

create table public.<name>_fees ( id uuid primary key default gen_random_uuid(), sort_order integer not null, /* fee columns */ );
alter table public.<name>_fees enable row level security;
create policy "public read <name>_fees" on public.<name>_fees for select using (true);
create policy "staff manage <name>_fees" on public.<name>_fees for all using (is_staff()) with check (is_staff());
```

Seed both tables (bulk `insert` statements) from the source requirements breakdown.

### Step 2 — Add the TypeScript types
In `src/lib/types.ts`, add `<Name>Item` and `<Name>Fee` types mirroring the new columns (copy
the `NpsRequirement`/`NpsFeeTier` or `DigitalCreditRequirement`/`DigitalCreditFee` types as a
starting point).

### Step 3 — Copy the NPS pathway as a template
Duplicate these three files into a new route folder `src/app/<slug>-pathway/`:
- `nps-pathway/page.tsx` → fetch from your two new tables instead of `nps_requirements`/
  `nps_fee_tiers`, and pass `isLoggedIn` (from `supabase.auth.getUser()`) through so the landing
  screen can show the "Already licensed? Go to your Compliance Calendar" banner for members.
- `nps-pathway/nps-pathway-client.tsx` → rename the type imports, adjust `routeColumnsForState()`
  / `itemApplicability()` to read your new route columns instead of `pso`/`psp_other`/etc., adjust
  the wizard's route options and any sub-question `<select>`s, and adjust the Fees tab to your
  fee table's shape (either a tiered/highlighted table like NPS, or a flat per-route/per-event
  list like Digital Credit — pick whichever matches your source data).
- `nps-pathway/nps-pathway.module.css` → copy as-is (the ink/slate/brass/rule/paper design
  tokens and class names are shared across every pathway tool; only the masthead `seal` text and
  brand copy change, which live in the client component, not the CSS).

Change the `localStorage` key (e.g. `dc_pathway_state_v1` → pick a new unique key) so different
pathway tools don't clobber each other's saved progress in a visitor's browser.

### Step 4 — Wire it into navigation
- Add a `<Link>` to the new route in `src/app/layout.tsx`'s top nav.
- Add a feature card for it on the homepage (`src/app/page.tsx`).
- If members should also get an ongoing, logged-in annual-obligations experience for this
  regulator (not just the one-time readiness map), see Part 3 — the pathway tool and the
  Compliance Calendar are separate, complementary features.

### Step 5 — Build an admin management screen
Duplicate `src/app/admin/nps-pathway/` (`page.tsx` + `nps-pathway-admin-client.tsx`) into
`src/app/admin/<slug>-pathway/`, pointing at your new tables, and add a nav link for it in
`src/app/admin/layout.tsx`. This gives FITSPA staff an editable table + "add row" form for both
the requirements list and the fee table, so the pathway's content can be corrected or extended
without another code deployment.

---

## 3. Creating — and rolling forward each year — the annual regulatory obligations calendar

The **Compliance Calendar** (`/dashboard/compliance-calendar` for members, `/admin/compliance-calendar`
for staff) is the richer, logged-in annual-obligations system: a member sets a one-time profile
(what kind of licensee they are), and the tool shows them exactly which recurring filings,
event-triggered duties, and continuous controls apply to them for the year, with a workflow
status they update as they progress each item.

It is built on the merged `public.obligations` catalog plus five reference tables:
`compliance_calendar_tasks` (dated/periodic filings), `compliance_events` (things a member logs
when they happen, e.g. incidents), `compliance_controls` (ongoing control objectives to attest
against), `compliance_workflow_states` (the status pipeline), `compliance_reminder_rules`, and
`compliance_holidays`. Every row in the first three carries an `applies_to` value — `ALL`, `PSO`,
`PSP`, `EMI`, `AGENTS`, `STORED CARDS`, `PARTICIPANT`, or `SFI` — that the app matches against
each member's profile to decide what to show them. Everything is scoped by a `catalog_key`
column, so multiple regulators' annual calendars can coexist in the same tables without
colliding.

### Setting up a brand-new annual calendar for a regulator

1. **Pick a `catalog_key`** — a short, unique slug for this regulator's calendar (the existing
   one is `payments_compliance_assistant` for BoU/NPS). Use this exact string in every insert
   below.
2. **Seed the obligations catalog.** In `public.obligations`, insert one row per obligation with
   `catalog_key` set to your new key, a unique `external_id` per row (e.g. `"GEN-01"`), and the
   9 `applies_*` booleans set according to which member types the obligation binds. (`regulator_id`
   should point at the regulator from Part 1.) This table already has a partial unique index on
   `(catalog_key, external_id)`, so re-running the same insert as an
   `on conflict (catalog_key, external_id) where catalog_key is not null do update set ...` is
   always safe — this is exactly how you'll refresh the catalog next year (see below).
3. **Seed the calendar tasks, events, and controls** the same way, into
   `compliance_calendar_tasks` / `compliance_events` / `compliance_controls`, each row's
   `catalog_key` matching, `obligation_external_id` pointing back to the obligation it belongs
   to, and `applies_to` set to one of the 8 values above.
4. **Add the manual UI path.** No new code is needed — `/admin/compliance-calendar` and
   `/dashboard/compliance-calendar` already read `compliance_calendar_tasks` /
   `compliance_events` / `compliance_controls` / `obligations` generically. Staff can also add
   rows directly through the admin screen's "+ Add" forms instead of writing SQL, once the
   catalog exists.
5. If the new regulator's calendar needs a member-profile question the existing 9-field wizard
   doesn't ask (the platform's wizard currently covers `primary_category`, `pso_class`,
   `pso_band`, `emi`, `emi_band`, `cards`, `agent`, `sfi`, `participant`), that's a code change:
   extend `public.member_compliance_profile` with the new column and add the question to the
   wizard in `src/app/dashboard/compliance-calendar/compliance-calendar-client.tsx`, plus a new
   `applies_to` value understood by the applicability switch in that same file.

### Rolling the calendar forward each year

Most of the catalog (the obligations themselves, the continuous controls, the event triggers)
doesn't change year to year — only the **dated calendar tasks** (`compliance_calendar_tasks`) do,
since their `period`, `period_end`, `legal_due`, and `internal_target` columns are tied to a
specific year. Each year:

1. Go to **Admin → Compliance Calendar → Calendar tasks** and use **+ Add** to create next year's
   dated tasks — or, for a bulk refresh, have a Supabase maintainer run an `insert` that copies
   the current year's rows with new `id`s, new dates, and an incremented `catalog_year`,
   `on conflict` safe the same way the obligations catalog is.
2. Update **Admin → Compliance Calendar → Holidays** with next year's declared public holidays
   (`holiday_date`, `name`, `type`) — the Compliance Calendar uses this list when explaining
   deadline shifts to members.
3. Review **Admin → Compliance Calendar → Workflow states** and **Reminder rules** — these rarely
   change, but confirm they still match the regulator's current process before the new year's
   tasks go live.
4. Spot-check the obligations catalog (`/admin/obligations`, filtered to the relevant regulator)
   and the continuous controls / event triggers for any legal changes since last year — update
   in place rather than duplicating, since these are not year-scoped.
5. Communicate the refresh to members — once next year's `compliance_calendar_tasks` rows exist,
   they appear automatically in every applicable member's `/dashboard/compliance-calendar`
   Calendar tab; no other action is needed for members to see them.

Because every insert in this system is idempotent on `(catalog_key, external_id)` for the
obligations table (and can be made so for the others by giving each row a stable, year-suffixed
`id`, e.g. `"CAL-2027-014"`), rolling the calendar forward is safe to re-run if something needs
correcting after publishing.
