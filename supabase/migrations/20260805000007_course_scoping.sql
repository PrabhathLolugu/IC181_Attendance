-- A "test" course run alongside the real one would otherwise silently blend into
-- the same global attendance percentage / gradebook -- the exact same class of bug
-- just fixed for groups, now at the course level. Scope both by course_name.

alter table public.grade_categories add column if not exists course_name text not null default 'IC181';

drop view if exists public.student_attendance_summary;

create or replace function public.student_attendance_summary(p_course_name text)
returns table (
  student_id uuid,
  roll_number text,
  name text,
  group_label text,
  late_count bigint,
  excused_count bigint,
  manual_count bigint,
  override_count bigint,
  present_count bigint,
  total_sessions bigint,
  attendance_percentage numeric
)
language sql
security invoker
stable
as $$
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
    join public.sessions rsess on rsess.id = r.session_id and rsess.course_name = p_course_name
    where r.student_id = s.id
  ) ar on true
  left join lateral (
    select
      (select count(*) from public.sessions ss
       where ss.status = 'ended' and ss.round_id is null and ss.course_name = p_course_name
         and (
           ss.group_filter is null or ss.group_filter = s.group_label
           or exists (select 1 from public.attendance_records arx where arx.session_id = ss.id and arx.student_id = s.id)
         )
      ) as standalone_total,
      (select count(*) from public.sessions ss
       where ss.status = 'ended' and ss.round_id is null and ss.course_name = p_course_name
         and exists (select 1 from public.attendance_records ar2 where ar2.session_id = ss.id and ar2.student_id = s.id and ar2.status = 'excused')
      ) as standalone_excused,
      (select count(*) from public.sessions ss
       where ss.status = 'ended' and ss.round_id is null and ss.course_name = p_course_name
         and exists (select 1 from public.attendance_records ar2 where ar2.session_id = ss.id and ar2.student_id = s.id and ar2.status != 'excused')
      ) as standalone_present,
      (select count(*) from public.activity_rounds r
       where exists (select 1 from public.sessions rs where rs.round_id = r.id and rs.course_name = p_course_name)
         and not exists (select 1 from public.sessions rs where rs.round_id = r.id and rs.course_name = p_course_name and rs.status <> 'ended')
         and (
           exists (select 1 from public.sessions rs where rs.round_id = r.id and rs.course_name = p_course_name and (rs.group_filter is null or rs.group_filter = s.group_label))
           or exists (
             select 1 from public.sessions rs
             join public.attendance_records arx on arx.session_id = rs.id and arx.student_id = s.id
             where rs.round_id = r.id and rs.course_name = p_course_name
           )
         )
      ) as round_total,
      (select count(*) from public.activity_rounds r
       where exists (select 1 from public.sessions rs where rs.round_id = r.id and rs.course_name = p_course_name)
         and not exists (select 1 from public.sessions rs where rs.round_id = r.id and rs.course_name = p_course_name and rs.status <> 'ended')
         and not exists (
           select 1 from public.sessions rs
           join public.attendance_records ar3 on ar3.session_id = rs.id and ar3.student_id = s.id and ar3.status != 'excused'
           where rs.round_id = r.id and rs.course_name = p_course_name
         )
         and exists (
           select 1 from public.sessions rs
           join public.attendance_records ar4 on ar4.session_id = rs.id and ar4.student_id = s.id and ar4.status = 'excused'
           where rs.round_id = r.id and rs.course_name = p_course_name
         )
      ) as round_excused,
      (select count(*) from public.activity_rounds r
       where exists (
           select 1 from public.sessions rs
           join public.attendance_records ar5 on ar5.session_id = rs.id and ar5.student_id = s.id and ar5.status != 'excused'
           where rs.round_id = r.id and rs.course_name = p_course_name
         )
         and not exists (select 1 from public.sessions rs where rs.round_id = r.id and rs.course_name = p_course_name and rs.status <> 'ended')
      ) as round_present
  ) units on true;
$$;

revoke all on function public.student_attendance_summary(text) from public;
grant execute on function public.student_attendance_summary(text) to authenticated;
