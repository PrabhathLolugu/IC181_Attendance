-- 1. Sessions: course tag + free-text session type (theory/yoga/extracurricular/custom...)
alter table public.sessions add column if not exists course_name text not null default 'IC181';

do $$
declare con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.sessions'::regclass and contype = 'c' and conname like '%session_type%'
  loop
    execute format('alter table public.sessions drop constraint %I', con.conname);
  end loop;
end $$;

-- 2. Attendance: add an 'excused' outcome (medical concessions etc.) distinct from present/late/manual/override.
do $$
declare con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.attendance_records'::regclass and contype = 'c' and conname like '%status%'
  loop
    execute format('alter table public.attendance_records drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.attendance_records
  add constraint attendance_records_status_check check (status in ('present', 'late', 'manual', 'override', 'excused'));

-- 3. student_attendance_summary: excused sessions no longer count for or against a student.
drop view if exists public.student_attendance_summary;
create view public.student_attendance_summary
with (security_invoker = true) as
select
  s.id as student_id,
  s.roll_number,
  s.name,
  s.section,
  coalesce(ar.present_count, 0) as present_count,
  coalesce(ar.late_count, 0) as late_count,
  coalesce(ar.excused_count, 0) as excused_count,
  coalesce(ar.manual_count, 0) as manual_count,
  coalesce(ar.override_count, 0) as override_count,
  greatest(applicable.total_sessions - coalesce(ar.excused_count, 0), 0) as total_sessions,
  case when greatest(applicable.total_sessions - coalesce(ar.excused_count, 0), 0) = 0 then 0
    else round(100.0 * coalesce(ar.present_count, 0) / greatest(applicable.total_sessions - coalesce(ar.excused_count, 0), 0), 1)
  end as attendance_percentage
from public.students s
left join lateral (
  select
    count(*) filter (where r.status != 'excused') as present_count,
    count(*) filter (where r.status = 'late') as late_count,
    count(*) filter (where r.status = 'excused') as excused_count,
    count(*) filter (where r.method = 'manual') as manual_count,
    count(*) filter (where r.method = 'override_code') as override_count
  from public.attendance_records r
  where r.student_id = s.id
) ar on true
left join lateral (
  select count(*) as total_sessions
  from public.sessions sess
  where sess.status = 'ended'
    and (sess.section_filter is null or sess.section_filter = s.section)
) applicable on true;

-- 4. Grading: categories with weights, per-student entries, and custom grade bands.
create table public.grade_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  weight_percent numeric not null check (weight_percent >= 0 and weight_percent <= 100),
  max_score numeric not null default 100 check (max_score > 0),
  attendance_linked boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.staff(id),
  updated_at timestamptz not null default now()
);

create table public.grade_entries (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.grade_categories(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score numeric not null check (score >= 0),
  notes text,
  updated_by uuid references public.staff(id),
  updated_at timestamptz not null default now(),
  unique (category_id, student_id)
);
create index grade_entries_student_idx on public.grade_entries (student_id);
create index grade_entries_category_idx on public.grade_entries (category_id);

create table public.grade_scale_bands (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  min_percent numeric not null check (min_percent >= 0 and min_percent <= 100),
  max_percent numeric not null check (max_percent >= 0 and max_percent <= 100),
  color text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.grade_categories enable row level security;
alter table public.grade_entries enable row level security;
alter table public.grade_scale_bands enable row level security;

-- Per the course team's request, category/scale setup and score entry are both
-- open to any active staff member (admin or TA), not admin-restricted like
-- staff/student management is.
create policy "grade_categories_staff_all" on public.grade_categories for all to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy "grade_entries_staff_all" on public.grade_entries for all to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy "grade_scale_bands_staff_all" on public.grade_scale_bands for all to authenticated using (public.is_active_staff()) with check (public.is_active_staff());

alter publication supabase_realtime add table public.grade_entries;

update public.course_settings set course_name = 'IC181' where id = true;
