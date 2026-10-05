-- Payments Apply: columns for the Beacon design's v7 content layer and applicability model.
-- Purely additive (all nullable / defaulted) and idempotent. The digital_lending and insurance
-- application_keys sharing this table are unaffected (their clients ignore the new columns).
begin;

alter table licence_application_templates
  add column if not exists card_title       text,                          -- short card / drawer title (design GUIDE.title)
  add column if not exists card_note        text,                          -- one-line card note (design CARD_NOTES)
  add column if not exists short_cta        text,                          -- card button label (design PRODUCT.cta)
  add column if not exists guidance_long    text,                          -- rewritten guidance (design GUIDE.guidance)
  add column if not exists deliverable      text,                          -- "What you need to provide" (design GUIDE.deliverable)
  add column if not exists sources          jsonb not null default '[]'::jsonb,   -- [{text,url}]
  add column if not exists official_form    jsonb,                         -- {label,url}
  add column if not exists product_type     text,                          -- design editor type (entity, company_docs, upload, ...)
  add column if not exists product_config   jsonb not null default '{}'::jsonb,   -- {slots:[[key,label]],accept,form,person_filter}
  add column if not exists workspace_hidden boolean not null default false, -- embedded / system / event items the workspace hides
  add column if not exists applies_to       jsonb;                         -- see 0204; NULL = legacy route_key / applicability.fact_key

comment on column licence_application_templates.applies_to is
  '{"routes_any":[pso|psp|instrument],"emi":true,"facts":{"<fact>":bool},"min_capital_gt":0,"application_fee_gt":0}; {} = always; NULL = fall back to route_key + applicability.fact_key';

commit;
