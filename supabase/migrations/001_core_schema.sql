-- 001_core_schema.sql
-- School Report Management System: core schema, RLS, storage, approval workflow.
-- Run in order via `supabase db push`. Marks use NUMERIC, never float.

-- ========== ENUMS ==========
create type app_role as enum ('school_admin', 'teacher');
create type submission_status as enum ('draft','submitted','approved','rejected','reopened'); -- "PENDING" in UI = submitted
create type mark_state as enum ('entered','missing','not_assessed','exempted');
create type decision_type as enum ('passed','failed','conditional','under_review');

-- ========== TENANCY & USERS ==========
create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text, address text, phone text, email text, website text, motto text,
  logo_path text, is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  is_super_admin boolean not null default false,   -- only settable via service role / SQL
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, user_id)
);

create table school_settings (
  school_id uuid primary key references schools(id) on delete cascade,
  default_max_mark numeric(5,2) not null default 20,
  passing_average numeric(5,2) not null default 10,
  ranking_policy text not null default 'competition',
  report_remark_fields jsonb not null default '["class_teacher","principal","conduct","attendance"]',
  report_colors jsonb not null default '{}',
  report_footer text,
  signature_path text, stamp_path text,
  updated_at timestamptz not null default now()
);

-- ========== ACADEMIC CALENDAR ==========
create table academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,                       -- e.g. 2026/2027
  starts_on date, ends_on date,
  is_current boolean not null default false,
  unique (school_id, name)
);
create unique index one_current_year_per_school on academic_years (school_id) where is_current;

create table terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  term_no smallint not null check (term_no between 1 and 3),
  starts_on date, ends_on date, is_open boolean not null default true,
  unique (academic_year_id, term_no)
);

create table sequences (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  seq_no smallint not null check (seq_no between 1 and 6),
  starts_on date, ends_on date, is_open boolean not null default false,
  unique (term_id, seq_no)
);

-- ========== CLASSES, STUDENTS, ENROLMENTS ==========
create table classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null, stream text, level_order smallint,
  class_teacher_id uuid references profiles(id),
  is_active boolean not null default true,
  unique (school_id, name, stream)
);

create table students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  admission_no text not null,
  full_name text not null,
  gender text check (gender in ('M','F')),
  date_of_birth date, place_of_birth text,
  photo_path text,                          -- storage path: {school_id}/{student_id}/photo.ext
  guardian_name text, guardian_phone text, guardian_email text,
  address text, notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, admission_no)
);

-- History-safe: one row per student per year; promotion creates a NEW row.
create table student_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid not null references classes(id),
  academic_year_id uuid not null references academic_years(id),
  status text not null default 'active' check (status in ('active','promoted','transferred','withdrawn')),
  unique (student_id, academic_year_id)
);
create index on student_enrollments (class_id, academic_year_id);

-- ========== SUBJECTS & GROUPS ==========
create table subjects (                     -- reusable catalogue (70+ ok)
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null, code text, is_active boolean not null default true,
  unique (school_id, name)
);

create table subject_groups (               -- Science, Arts/Humanities, Other... admin-defined
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null, display_order smallint not null default 0,
  unique (school_id, name)
);

create table class_subjects (               -- what a class studies in a year
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  subject_id uuid not null references subjects(id),
  group_id uuid references subject_groups(id),
  coefficient numeric(4,2) not null check (coefficient > 0),
  max_mark numeric(5,2) not null default 20 check (max_mark > 0),
  display_order smallint not null default 0,
  unique (class_id, academic_year_id, subject_id)   -- a subject appears once per class/year
);

create table teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_subject_id uuid not null references class_subjects(id) on delete cascade,
  teacher_id uuid not null references profiles(id),
  unique (class_subject_id, teacher_id)
);

-- ========== MARKS WORKFLOW ==========
create table mark_submissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_subject_id uuid not null references class_subjects(id),
  sequence_id uuid not null references sequences(id),
  teacher_id uuid not null references profiles(id),
  status submission_status not null default 'draft',
  rejection_reason text,
  cycle_no int not null default 1,          -- increments on each resubmission/reopen
  submitted_at timestamptz, reviewed_by uuid references profiles(id), reviewed_at timestamptz,
  unique (class_subject_id, sequence_id)
);

create table marks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  submission_id uuid not null references mark_submissions(id) on delete cascade,
  enrollment_id uuid not null references student_enrollments(id),
  state mark_state not null default 'entered',
  value numeric(5,2) check (value >= 0),
  remark text,
  updated_at timestamptz not null default now(),
  unique (submission_id, enrollment_id),
  check ((state = 'entered' and value is not null) or (state <> 'entered' and value is null))
);

create table approval_logs (                -- append-only history of every status change
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  submission_id uuid not null references mark_submissions(id) on delete cascade,
  cycle_no int not null, from_status submission_status, to_status submission_status not null,
  actor_id uuid not null references profiles(id), reason text,
  snapshot jsonb,                           -- marks at that moment, preserves previous values
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null, body text, link text,
  read_at timestamptz, created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid, actor_id uuid, action text not null,
  entity text, entity_id uuid, old_value jsonb, new_value jsonb,
  created_at timestamptz not null default now()
);

-- ========== RLS HELPERS ==========
create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_super_admin and is_active from public.profiles where id = auth.uid()), false)
$$;

create or replace function is_school_member(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists (
    select 1 from public.school_memberships m join public.profiles p on p.id = m.user_id
    where m.user_id = auth.uid() and m.school_id = sid and m.is_active and p.is_active)
$$;

create or replace function is_school_admin(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists (
    select 1 from public.school_memberships m join public.profiles p on p.id = m.user_id
    where m.user_id = auth.uid() and m.school_id = sid and m.role = 'school_admin' and m.is_active and p.is_active)
$$;

create or replace function is_assigned_teacher(cs_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teacher_assignments where class_subject_id = cs_id and teacher_id = auth.uid())
$$;

-- ========== RLS ==========
do $$
declare t text;
begin
  foreach t in array array['schools','profiles','school_memberships','school_settings','academic_years','terms',
    'sequences','classes','students','student_enrollments','subjects','subject_groups','class_subjects',
    'teacher_assignments','mark_submissions','marks','approval_logs','notifications','audit_logs']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- Tenant-scoped read for members; write for school admins (tables with school_id).
do $$
declare t text;
begin
  foreach t in array array['school_settings','academic_years','terms','sequences','classes','students',
    'student_enrollments','subjects','subject_groups','class_subjects','teacher_assignments']
  loop
    execute format('create policy %I on %I for select using (is_school_member(school_id))', t||'_read', t);
    execute format('create policy %I on %I for all using (is_school_admin(school_id)) with check (is_school_admin(school_id))', t||'_admin_write', t);
  end loop;
end $$;

create policy schools_read on schools for select using (is_school_member(id));
create policy schools_admin_update on schools for update using (is_school_admin(id)) with check (is_school_admin(id));
create policy schools_super_all on schools for all using (is_super_admin()) with check (is_super_admin());

create policy profiles_self_read on profiles for select using (id = auth.uid() or is_super_admin()
  or exists (select 1 from school_memberships a join school_memberships b on a.school_id = b.school_id
             where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid() and not is_super_admin);
-- NOTE: privilege columns are protected by the trigger below.

create policy memberships_read on school_memberships for select using (user_id = auth.uid() or is_school_admin(school_id));
create policy memberships_admin_write on school_memberships for all using (is_school_admin(school_id)) with check (is_school_admin(school_id));

-- Teachers: only own submissions for assigned class-subjects. They can never set approved/rejected.
create policy subs_read on mark_submissions for select
  using (is_school_admin(school_id) or (teacher_id = auth.uid() and is_assigned_teacher(class_subject_id)));
create policy subs_teacher_insert on mark_submissions for insert
  with check (teacher_id = auth.uid() and is_assigned_teacher(class_subject_id) and status = 'draft');
create policy subs_teacher_update on mark_submissions for update
  using (teacher_id = auth.uid() and status in ('draft','rejected','reopened'))
  with check (teacher_id = auth.uid() and status in ('draft','rejected','reopened'));
-- Approval/rejection/submission happen ONLY through the security-definer functions below.

create policy marks_read on marks for select using (
  is_school_admin(school_id) or exists (select 1 from mark_submissions s
    where s.id = submission_id and s.teacher_id = auth.uid() and is_assigned_teacher(s.class_subject_id)));
create policy marks_teacher_write on marks for all
  using (exists (select 1 from mark_submissions s where s.id = submission_id and s.teacher_id = auth.uid()
         and s.status in ('draft','rejected','reopened') and is_assigned_teacher(s.class_subject_id)))
  with check (exists (select 1 from mark_submissions s where s.id = submission_id and s.teacher_id = auth.uid()
         and s.status in ('draft','rejected','reopened') and is_assigned_teacher(s.class_subject_id)));

create policy approval_logs_read on approval_logs for select using (is_school_admin(school_id));
create policy notif_own on notifications for select using (user_id = auth.uid());
create policy notif_mark_read on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy audit_read on audit_logs for select using (school_id is not null and is_school_admin(school_id));
-- No INSERT/UPDATE/DELETE policies on audit_logs or approval_logs: written only by definer functions/triggers.

-- Block privilege escalation on profiles.
create or replace function protect_profile_privileges() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_super_admin()
     and (new.is_super_admin is distinct from old.is_super_admin or new.is_active is distinct from old.is_active) then
    raise exception 'not allowed to change privileged profile fields';
  end if;
  return new;
end $$;
create trigger trg_protect_profile before update on profiles for each row execute function protect_profile_privileges();

-- Enforce mark ceiling from class_subjects.max_mark.
create or replace function enforce_mark_range() returns trigger
language plpgsql set search_path = '' as $$
declare mx numeric;
begin
  if new.state = 'entered' then
    select cs.max_mark into mx from public.mark_submissions s
      join public.class_subjects cs on cs.id = s.class_subject_id where s.id = new.submission_id;
    if new.value > mx then raise exception 'mark % exceeds maximum %', new.value, mx; end if;
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger trg_mark_range before insert or update on marks for each row execute function enforce_mark_range();

-- ========== WORKFLOW FUNCTIONS (server-trusted) ==========
create or replace function submit_marks(p_submission uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.mark_submissions;
begin
  select * into s from public.mark_submissions where id = p_submission for update;
  if s.teacher_id <> auth.uid() or not public.is_assigned_teacher(s.class_subject_id) then
    raise exception 'access denied'; end if;
  if s.status not in ('draft','rejected','reopened') then raise exception 'cannot submit from status %', s.status; end if;
  update public.mark_submissions set status = 'submitted', submitted_at = now(),
    cycle_no = case when s.status = 'draft' then s.cycle_no else s.cycle_no + 1 end, rejection_reason = null
    where id = p_submission;
  insert into public.approval_logs (school_id, submission_id, cycle_no, from_status, to_status, actor_id, snapshot)
    select s.school_id, s.id, s.cycle_no, s.status, 'submitted', auth.uid(),
      (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.marks m where m.submission_id = s.id);
  insert into public.notifications (school_id, user_id, title, link)
    select s.school_id, m.user_id, 'Marks submitted for review', '/admin/approvals/' || s.id
    from public.school_memberships m where m.school_id = s.school_id and m.role = 'school_admin' and m.is_active;
end $$;

create or replace function review_submission(p_submission uuid, p_decision submission_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.mark_submissions;
begin
  select * into s from public.mark_submissions where id = p_submission for update;
  if not public.is_school_admin(s.school_id) then raise exception 'access denied'; end if;
  if s.teacher_id = auth.uid() then raise exception 'cannot review your own submission'; end if;
  if s.status <> 'submitted' then raise exception 'submission is not pending'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'invalid decision'; end if;
  if p_decision = 'rejected' and coalesce(trim(p_reason),'') = '' then raise exception 'rejection reason required'; end if;
  update public.mark_submissions set status = p_decision, rejection_reason = p_reason,
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_submission;
  insert into public.approval_logs (school_id, submission_id, cycle_no, from_status, to_status, actor_id, reason, snapshot)
    select s.school_id, s.id, s.cycle_no, 'submitted', p_decision, auth.uid(), p_reason,
      (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.marks m where m.submission_id = s.id);
  insert into public.notifications (school_id, user_id, title, body, link)
    values (s.school_id, s.teacher_id, 'Marks ' || p_decision::text, p_reason, '/teacher/submissions/' || s.id);
end $$;

create or replace function reopen_submission(p_submission uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.mark_submissions;
begin
  select * into s from public.mark_submissions where id = p_submission for update;
  if not public.is_school_admin(s.school_id) then raise exception 'access denied'; end if;
  if s.status <> 'approved' then raise exception 'only approved submissions can be reopened'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'reason required'; end if;
  update public.mark_submissions set status = 'reopened', rejection_reason = p_reason where id = p_submission;
  insert into public.approval_logs (school_id, submission_id, cycle_no, from_status, to_status, actor_id, reason, snapshot)
    select s.school_id, s.id, s.cycle_no, 'approved', 'reopened', auth.uid(), p_reason,
      (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.marks m where m.submission_id = s.id);
  insert into public.notifications (school_id, user_id, title, body, link)
    values (s.school_id, s.teacher_id, 'Submission reopened for correction', p_reason, '/teacher/submissions/' || s.id);
end $$;

revoke all on function submit_marks(uuid), review_submission(uuid, submission_status, text), reopen_submission(uuid, text) from public, anon;
grant execute on function submit_marks(uuid), review_submission(uuid, submission_status, text), reopen_submission(uuid, text) to authenticated;

-- Official calculations read ONLY this view (approved marks).
create view approved_marks with (security_invoker = true) as
  select m.*, s.class_subject_id, s.sequence_id
  from marks m join mark_submissions s on s.id = m.submission_id
  where s.status = 'approved';

-- ========== STORAGE: private bucket, school-scoped paths ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 2097152, array['image/jpeg','image/png','image/webp']),
       ('school-assets',  'school-assets',  false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Path convention: {school_id}/... ; first folder = school_id.
create policy "photos read own school" on storage.objects for select
  using (bucket_id in ('student-photos','school-assets') and is_school_member(((storage.foldername(name))[1])::uuid));
create policy "photos admin write" on storage.objects for insert
  with check (bucket_id in ('student-photos','school-assets') and is_school_admin(((storage.foldername(name))[1])::uuid));
create policy "photos admin update" on storage.objects for update
  using (bucket_id in ('student-photos','school-assets') and is_school_admin(((storage.foldername(name))[1])::uuid));
create policy "photos admin delete" on storage.objects for delete
  using (bucket_id in ('student-photos','school-assets') and is_school_admin(((storage.foldername(name))[1])::uuid));

-- Next migration (002): student_term_results, student_annual_results, grading_rules,
-- report_templates, report_cards, school_assets, assessments, remarks tables + their RLS.
