-- Rename the previously-underused, student-self-reported "section" concept into a
-- staff-assigned "group" concept (e.g. A-H for rotating activities like Yoga).
-- Safe to rename outright: the students/sessions tables are currently empty.
alter table public.students rename column section to group_label;
alter table public.sessions rename column section_filter to group_filter;

-- Activity rounds: a set of sessions (typically one per group, e.g. Yoga groups B/D/F...)
-- that together form ONE attendance opportunity. A student satisfies the round by
-- attending ANY ONE member session, even a different group's, as long as it's before
-- every session in the round has ended. This is what lets a student who misses their
-- own group's day still get full credit by catching a different group's day later.
create table public.activity_rounds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.staff(id)
);

alter table public.sessions add column round_id uuid references public.activity_rounds(id) on delete set null;
create index sessions_round_idx on public.sessions (round_id);

alter table public.activity_rounds enable row level security;
create policy "activity_rounds_staff_all" on public.activity_rounds for all to authenticated using (public.is_active_staff()) with check (public.is_active_staff());

-- Rebuild the summary view: standalone (non-round) sessions count individually as
-- before; sessions that belong to a round collapse into ONE unit per CLOSED round
-- (every member session ended), present if the student has any non-excused record
-- among that round's sessions, applicable only if at least one member session's
-- group_filter matches the student (or is open to everyone).
drop view if exists public.student_attendance_summary;
create view public.student_attendance_summary
with (security_invoker = true) as
select
  s.id as student_id,
  s.roll_number,
  s.name,
  s.group_label,
  coalesce(ar.late_count, 0) as late_count,
  coalesce(ar.excused_count, 0) as excused_count,
  coalesce(ar.manual_count, 0) as manual_count,
  coalesce(ar.override_count, 0) as override_count,
  coalesce(units.standalone_present, 0) + coalesce(units.round_present, 0) as present_count,
  greatest(
    coalesce(units.standalone_total, 0) - coalesce(units.standalone_excused, 0)
    + coalesce(units.round_total, 0) - coalesce(units.round_excused, 0),
    0
  ) as total_sessions,
  case when greatest(
      coalesce(units.standalone_total, 0) - coalesce(units.standalone_excused, 0)
      + coalesce(units.round_total, 0) - coalesce(units.round_excused, 0),
      0
    ) = 0 then 0
    else round(
      100.0 * (coalesce(units.standalone_present, 0) + coalesce(units.round_present, 0))
      / greatest(
          coalesce(units.standalone_total, 0) - coalesce(units.standalone_excused, 0)
          + coalesce(units.round_total, 0) - coalesce(units.round_excused, 0),
          0
        ), 1)
  end as attendance_percentage
from public.students s
left join lateral (
  select
    count(*) filter (where r.status = 'late') as late_count,
    count(*) filter (where r.status = 'excused') as excused_count,
    count(*) filter (where r.method = 'manual') as manual_count,
    count(*) filter (where r.method = 'override_code') as override_count
  from public.attendance_records r
  where r.student_id = s.id
) ar on true
left join lateral (
  select
    -- standalone (non-round) sessions applicable to this student
    (select count(*) from public.sessions ss
     where ss.status = 'ended' and ss.round_id is null
       and (ss.group_filter is null or ss.group_filter = s.group_label)
    ) as standalone_total,
    (select count(*) from public.sessions ss
     where ss.status = 'ended' and ss.round_id is null
       and (ss.group_filter is null or ss.group_filter = s.group_label)
       and exists (select 1 from public.attendance_records ar2 where ar2.session_id = ss.id and ar2.student_id = s.id and ar2.status = 'excused')
    ) as standalone_excused,
    (select count(*) from public.sessions ss
     where ss.status = 'ended' and ss.round_id is null
       and (ss.group_filter is null or ss.group_filter = s.group_label)
       and exists (select 1 from public.attendance_records ar2 where ar2.session_id = ss.id and ar2.student_id = s.id and ar2.status != 'excused')
    ) as standalone_present,
    -- rounds applicable to this student (at least one member session matches their group), closed (all member sessions ended)
    (select count(*) from public.activity_rounds r
     where exists (select 1 from public.sessions rs where rs.round_id = r.id)
       and not exists (select 1 from public.sessions rs where rs.round_id = r.id and rs.status <> 'ended')
       and exists (select 1 from public.sessions rs where rs.round_id = r.id and (rs.group_filter is null or rs.group_filter = s.group_label))
    ) as round_total,
    (select count(*) from public.activity_rounds r
     where exists (select 1 from public.sessions rs where rs.round_id = r.id)
       and not exists (select 1 from public.sessions rs where rs.round_id = r.id and rs.status <> 'ended')
       and exists (select 1 from public.sessions rs where rs.round_id = r.id and (rs.group_filter is null or rs.group_filter = s.group_label))
       and not exists (
         select 1 from public.sessions rs
         join public.attendance_records ar3 on ar3.session_id = rs.id and ar3.student_id = s.id and ar3.status != 'excused'
         where rs.round_id = r.id
       )
       and exists (
         select 1 from public.sessions rs
         join public.attendance_records ar4 on ar4.session_id = rs.id and ar4.student_id = s.id and ar4.status = 'excused'
         where rs.round_id = r.id
       )
    ) as round_excused,
    (select count(*) from public.activity_rounds r
     where exists (select 1 from public.sessions rs where rs.round_id = r.id)
       and not exists (select 1 from public.sessions rs where rs.round_id = r.id and rs.status <> 'ended')
       and exists (select 1 from public.sessions rs where rs.round_id = r.id and (rs.group_filter is null or rs.group_filter = s.group_label))
       and exists (
         select 1 from public.sessions rs
         join public.attendance_records ar5 on ar5.session_id = rs.id and ar5.student_id = s.id and ar5.status != 'excused'
         where rs.round_id = r.id
       )
    ) as round_present
) units on true;
