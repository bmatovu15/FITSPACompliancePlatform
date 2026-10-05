-- Digital Lending Apply (gap DA-39): data-driven requirement drawers.
-- Additive + idempotent. Existing rows get '{}' => the app falls back to its bundled schema.
alter table public.licence_application_templates
  add column if not exists form_schema jsonb not null default '{}'::jsonb;

comment on column public.licence_application_templates.form_schema is
  'Drawer form + readiness rules for the Apply workspace: {blocks:[...], save_label?, caption?}. See src/app/apply/digital-lending/dl-schemas.ts.';
-- RLS on licence_application_templates is unchanged (public read, staff manage).
