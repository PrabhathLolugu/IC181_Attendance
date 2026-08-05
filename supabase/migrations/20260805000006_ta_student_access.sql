-- Per explicit instruction: TAs should have full access to student records
-- (add/edit/remove/restore), not just admins. Previously only admins could.
drop policy if exists "students_insert_admin" on public.students;
drop policy if exists "students_update_admin" on public.students;
drop policy if exists "students_delete_admin" on public.students;

create policy "students_insert_staff" on public.students for insert to authenticated with check (public.is_active_staff());
create policy "students_update_staff" on public.students for update to authenticated using (public.is_active_staff());
create policy "students_delete_staff" on public.students for delete to authenticated using (public.is_active_staff());
