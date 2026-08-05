-- Bug: a session/round targeted at a specific group was being excluded from a
-- student's percentage entirely if their own group didn't match -- even when
-- that student actually attended it (explicitly intended to be allowed: any
-- student can scan any session's QR regardless of group). Actual attendance
-- must always count. Applicability is now: group matches (or session is
-- general) OR the student has any attendance record for it at all.
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
    -- standalone (non-round) sessions applicable to this student: matches their
    -- group (or is general), OR they actually have a record for it regardless.
    (select count(*) from public.sessions ss
     where ss.status = 'ended' and ss.round_id is null
       and (
         ss.group_filter is null or ss.group_filter = s.group_label
         or exists (select 1 from public.attendance_records arx where arx.session_id = ss.id and arx.student_id = s.id)
       )
    ) as standalone_total,
    (select count(*) from public.sessions ss
     where ss.status = 'ended' and ss.round_id is null
       and exists (select 1 from public.attendance_records ar2 where ar2.session_id = ss.id and ar2.student_id = s.id and ar2.status = 'excused')
    ) as standalone_excused,
    (select count(*) from public.sessions ss
     where ss.status = 'ended' and ss.round_id is null
       and exists (select 1 from public.attendance_records ar2 where ar2.session_id = ss.id and ar2.student_id = s.id and ar2.status != 'excused')
    ) as standalone_present,
    -- rounds applicable to this student: a member session matches their group,
    -- OR they have a record for any member session regardless of its group.
    (select count(*) from public.activity_rounds r
     where exists (select 1 from public.sessions rs where rs.round_id = r.id)
       and not exists (select 1 from public.sessions rs where rs.round_id = r.id and rs.status <> 'ended')
       and (
         exists (select 1 from public.sessions rs where rs.round_id = r.id and (rs.group_filter is null or rs.group_filter = s.group_label))
         or exists (
           select 1 from public.sessions rs
           join public.attendance_records arx on arx.session_id = rs.id and arx.student_id = s.id
           where rs.round_id = r.id
         )
       )
    ) as round_total,
    (select count(*) from public.activity_rounds r
     where exists (select 1 from public.sessions rs where rs.round_id = r.id)
       and not exists (select 1 from public.sessions rs where rs.round_id = r.id and rs.status <> 'ended')
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
     where exists (
         select 1 from public.sessions rs
         join public.attendance_records ar5 on ar5.session_id = rs.id and ar5.student_id = s.id and ar5.status != 'excused'
         where rs.round_id = r.id
       )
       and not exists (select 1 from public.sessions rs where rs.round_id = r.id and rs.status <> 'ended')
    ) as round_present
) units on true;
