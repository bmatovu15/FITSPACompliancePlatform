-- Digital Lending Apply (gaps DA-02, DA-07): route-screen card content.
-- Additive columns + data for the two digital_lending classes. The existing `label`
-- and `description` are NOT changed (other screens read them); the route screen reads
-- card_title / route_tag / card_blurb and falls back to the same copy bundled in the app.
alter table public.licence_application_wizard_classes
  add column if not exists route_tag   text,
  add column if not exists card_title  text,
  add column if not exists card_blurb  text;

update public.licence_application_wizard_classes
   set route_tag = 'Company',
       card_title = 'Money Lender',
       card_blurb = 'For a company applying for a Money Lender licence.'
 where application_key = 'digital_lending' and class_key = 'ml';

update public.licence_application_wizard_classes
   set route_tag = 'Company or NGO',
       card_title = 'Non-Deposit-Taking Microfinance Institution',
       card_blurb = 'For a company or NGO applying for an NDTMFI licence.'
 where application_key = 'digital_lending' and class_key = 'ndt';
-- (fee_class_label already holds the design badge text: 'Money Lender' / 'NDTMFI'.)
