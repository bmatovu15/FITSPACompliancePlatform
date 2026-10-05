-- Digital Lending Apply (gaps DA-12, DA-40): human label per uploaded file
-- ("Certificate of Incorporation", "Signed Form 1", ...), shown in the Documents tab.
-- The app also derives the label from the schema, so rows without it still display well.
alter table public.member_licence_application_files
  add column if not exists label text;
-- RLS unchanged (policy "manage own or anonymous application files").
