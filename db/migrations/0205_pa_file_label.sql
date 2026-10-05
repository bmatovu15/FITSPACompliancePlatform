-- Payments Apply: human-readable label for an uploaded slot (shown under the file name on the
-- Documents tab, e.g. "Certificate of Incorporation"). Optional: the client falls back to a
-- label derived from the slot key and retries inserts without this column if it is absent.
alter table member_licence_application_files add column if not exists label text;
