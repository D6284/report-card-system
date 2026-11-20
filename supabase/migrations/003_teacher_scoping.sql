-- 003_teacher_scoping.sql: teachers see only students/assignments for classes they teach.
create or replace function teaches_class(cid uuid, yid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teacher_assignments ta join public.class_subjects cs on cs.id = ta.class_subject_id
    where ta.teacher_id = auth.uid() and cs.class_id = cid and cs.academic_year_id = yid)
$$;

create or replace function can_see_enrollment(eid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.student_enrollments e where e.id = eid and (
    public.is_school_admin(e.school_id) or public.is_class_teacher(e.class_id) or public.teaches_class(e.class_id, e.academic_year_id)))
$$;

drop policy student_enrollments_read on student_enrollments;
create policy student_enrollments_read on student_enrollments for select using (can_see_enrollment(id));

drop policy students_read on students;
create policy students_read on students for select using (
  is_school_admin(school_id) or exists (select 1 from student_enrollments e where e.student_id = students.id and can_see_enrollment(e.id)));

drop policy teacher_assignments_read on teacher_assignments;
create policy teacher_assignments_read on teacher_assignments for select using (is_school_admin(school_id) or teacher_id = auth.uid());
-- Note: class_subjects, classes and subjects stay readable by school members (needed for joins; not personal data).
