-- Indexes for common tenant-scoped filters and newest-first lists.
create index if not exists school_memberships_user_active_created_idx
  on school_memberships (user_id, is_active, created_at desc);
create index if not exists school_memberships_school_role_active_idx
  on school_memberships (school_id, role, is_active);
create index if not exists classes_school_teacher_idx
  on classes (school_id, class_teacher_id);
create index if not exists student_enrollments_school_year_class_status_idx
  on student_enrollments (school_id, academic_year_id, class_id, status);
create index if not exists class_subjects_school_year_class_idx
  on class_subjects (school_id, academic_year_id, class_id);
create index if not exists mark_submissions_school_status_submitted_idx
  on mark_submissions (school_id, status, submitted_at desc);
create index if not exists mark_submissions_teacher_submitted_idx
  on mark_submissions (teacher_id, submitted_at desc);
create index if not exists audit_logs_school_created_idx
  on audit_logs (school_id, created_at desc);
create index if not exists student_term_results_school_term_enrollment_idx
  on student_term_results (school_id, term_id, enrollment_id);
