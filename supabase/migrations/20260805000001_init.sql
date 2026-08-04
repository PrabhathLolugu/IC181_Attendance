-- SmartAttend core schema
-- Replaces the previous prototype schema (open RLS, no real auth, single hardcoded course).

drop table if exists public.gps_overrides cascade;
drop table if exists public.attendance_records cascade;
drop table if exists public.sessions cascade;
drop table if exists public.students cascade;
drop table if exists public.users cascade;

create extension if not exists pgcrypto;

-- ── staff (admins + TAs, one row per auth.users id) ─────────────────────────
create table public.staff (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  role text not null check (role in ('admin','ta')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  created_by uuid references public.staff(id),
  updated_at timestamptz not null default now()
);

-- ── students (permanent enrollment profile, keyed by roll number) ──────────
create table public.students (
  id uuid primary key default gen_random_uuid(),
  roll_number text unique not null,
  name text not null,
  email text,
  phone text,
  department text,
  program text,
  semester text,
  section text,
  batch text,
  photo_url text,
  status text not null default 'active' check (status in ('active','inactive','graduated','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id),
  updated_by uuid references public.staff(id)
);
create index students_roll_number_idx on public.students (roll_number);
create index students_status_idx on public.students (status);

-- ── course_settings (single row, admin-editable) ────────────────────────────
create table public.course_settings (
  id boolean primary key default true check (id),
  course_name text not null default 'My Course',
  gps_radius_meters integer not null default 100,
  late_window_minutes integer not null default 10,
  override_code_ttl_seconds integer not null default 120,
  qr_rotation_seconds integer not null default 25,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff(id)
);
insert into public.course_settings (id) values (true);

-- ── sessions (one per class meeting; multiple can be active in parallel) ────
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null default current_date,
  session_type text not null check (session_type in ('theory','practical')),
  status text not null default 'active' check (status in ('active','ended')),
  started_by uuid not null references public.staff(id),
  anchor_lat double precision not null,
  anchor_lng double precision not null,
  radius_meters integer not null default 100,
  section_filter text,
  rotation_id text not null,
  rotation_expires_at timestamptz not null,
  allow_gps_override boolean not null default true,
  override_code text,
  override_code_expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index sessions_status_idx on public.sessions (status);
create index sessions_date_idx on public.sessions (session_date);

-- ── attendance_records (one row per student per session, enforced atomically) ──
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  roll_number text not null,
  status text not null check (status in ('present','late','manual','override')),
  method text not null check (method in ('gps','override_code','manual','instructor_approved')),
  distance_meters double precision,
  gps_lat double precision,
  gps_lng double precision,
  gps_accuracy double precision,
  marked_at timestamptz not null default now(),
  recorded_by uuid references public.staff(id),
  notes text,
  unique (session_id, student_id)
);
create index attendance_records_student_idx on public.attendance_records (student_id);
create index attendance_records_session_idx on public.attendance_records (session_id);
create index attendance_records_roll_idx on public.attendance_records (roll_number);

-- ── gps_override_requests (approval queue for failed GPS checks) ───────────
create table public.gps_override_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  roll_number text not null,
  distance_meters double precision,
  reason text not null check (reason in ('gps_denied','outside_radius','gps_unavailable')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.staff(id)
);
create unique index gps_override_requests_pending_uniq
  on public.gps_override_requests (session_id, student_id)
  where status = 'pending';

-- ── audit_log (append-only; no update/delete policy exists, anywhere) ──────
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.staff(id),
  actor_label text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- ── reporting helper view ────────────────────────────────────────────────
create view public.student_attendance_summary
with (security_invoker = true) as
select
  s.id as student_id,
  s.roll_number,
  s.name,
  s.section,
  count(ar.id) as present_count,
  count(ar.id) filter (where ar.status = 'late') as late_count,
  count(ar.id) filter (where ar.method = 'manual') as manual_count,
  count(ar.id) filter (where ar.method = 'override_code') as override_count,
  applicable.total_sessions,
  case when applicable.total_sessions = 0 then 0
    else round(100.0 * count(ar.id) / applicable.total_sessions, 1)
  end as attendance_percentage
from public.students s
left join public.attendance_records ar on ar.student_id = s.id
left join lateral (
  select count(*) as total_sessions
  from public.sessions sess
  where sess.status = 'ended'
    and (sess.section_filter is null or sess.section_filter = s.section)
) applicable on true
group by s.id, s.roll_number, s.name, s.section, applicable.total_sessions;

-- ── RLS helpers (security definer to avoid recursive-policy issues) ────────
create or replace function public.is_active_staff()
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (select 1 from public.staff where id = auth.uid() and status = 'active');
$$;

create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (select 1 from public.staff where id = auth.uid() and role = 'admin' and status = 'active');
$$;

-- ── enable RLS everywhere; no policies at all are granted to anon ──────────
alter table public.staff enable row level security;
alter table public.students enable row level security;
alter table public.course_settings enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.gps_override_requests enable row level security;
alter table public.audit_log enable row level security;

create policy "staff_select" on public.staff for select to authenticated using (public.is_active_staff());
create policy "staff_insert_admin" on public.staff for insert to authenticated with check (public.is_admin());
create policy "staff_update_admin" on public.staff for update to authenticated using (public.is_admin());
create policy "staff_delete_admin" on public.staff for delete to authenticated using (public.is_admin());

create policy "students_select" on public.students for select to authenticated using (public.is_active_staff());
create policy "students_insert_admin" on public.students for insert to authenticated with check (public.is_admin());
create policy "students_update_admin" on public.students for update to authenticated using (public.is_admin());
create policy "students_delete_admin" on public.students for delete to authenticated using (public.is_admin());

create policy "settings_select" on public.course_settings for select to authenticated using (public.is_active_staff());
create policy "settings_update_admin" on public.course_settings for update to authenticated using (public.is_admin());

create policy "sessions_select" on public.sessions for select to authenticated using (public.is_active_staff());
create policy "sessions_insert_staff" on public.sessions for insert to authenticated with check (public.is_active_staff());
create policy "sessions_update_staff" on public.sessions for update to authenticated using (public.is_active_staff());
create policy "sessions_delete_admin" on public.sessions for delete to authenticated using (public.is_admin());

create policy "attendance_select" on public.attendance_records for select to authenticated using (public.is_active_staff());
create policy "attendance_insert_staff" on public.attendance_records for insert to authenticated with check (public.is_active_staff());
create policy "attendance_update_staff" on public.attendance_records for update to authenticated using (public.is_active_staff());
create policy "attendance_delete_admin" on public.attendance_records for delete to authenticated using (public.is_admin());

create policy "overrides_select" on public.gps_override_requests for select to authenticated using (public.is_active_staff());
create policy "overrides_insert_staff" on public.gps_override_requests for insert to authenticated with check (public.is_active_staff());
create policy "overrides_update_staff" on public.gps_override_requests for update to authenticated using (public.is_active_staff());

create policy "audit_select" on public.audit_log for select to authenticated using (public.is_active_staff());
create policy "audit_insert_staff" on public.audit_log for insert to authenticated with check (public.is_active_staff());

-- ── realtime ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.attendance_records;
alter publication supabase_realtime add table public.gps_override_requests;
