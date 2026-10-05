-- Digital Lending Apply (gap DA-11): "Record submission" -- the applicant files with
-- MRD-MoFPED outside the tool and records the date / reference here.
-- Submission evidence is stored in member_licence_application_files with
-- external_id '_submission', slot 'evidence'. status 'submitted' + submitted_at are
-- still set when the submission is recorded.
alter table public.member_licence_applications
  add column if not exists submission_date date,
  add column if not exists submission_reference text;
-- RLS unchanged.
