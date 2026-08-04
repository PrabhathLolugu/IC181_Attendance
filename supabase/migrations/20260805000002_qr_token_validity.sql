-- Decouple the QR display's refresh cadence from how long a scanned token stays
-- redeemable. Previously a single setting drove both, so a token minted right
-- before a rotation gave a student almost no time to complete enrollment.
alter table public.course_settings
  add column qr_token_validity_seconds integer not null default 600;

alter table public.course_settings
  alter column qr_rotation_seconds set default 300;

update public.course_settings
  set qr_rotation_seconds = 300,
      qr_token_validity_seconds = 600
  where id = true;
