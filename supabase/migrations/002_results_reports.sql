-- 002_results_reports.sql: results, grading, remarks, report history, assets, audit triggers.
-- Depends on 001_core_schema.sql.

create or replace function is_class_teacher(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classes where id = cid and class_teacher_id = auth.uid())
$$;

create table grading_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  min_avg numeric(5,2) not null, max_avg numeric(5,2) not null,
  grade text not null, remark text, display_order smallint not null default 0,
  check (max_avg >= min_avg)
);

create table report_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null, is_default boolean not null default false,
  config jsonb not null default '{}',      -- header lines, labels (1st Test/Seq), remark fields, stamp mode
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table school_assets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  kind text not null check (kind in ('logo','signature','stamp','other')),
  storage_path text not null, label text,
  created_at timestamptz not null default now()
);

-- Per-term discipline and remarks, entered by class teacher / admin.
create table term_remarks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  enrollment_id uuid not null references student_enrollments(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  class_teacher_remark text, principal_remark text, conduct text,
  total_abs int, suspensions int, punishments int, warnings int, remark text,
  unique (enrollment_id, term_id)
);

-- Computed official results. Written only by server code using approved marks.
create table student_term_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  enrollment_id uuid not null references student_enrollments(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  status text not null check (status in ('complete','incomplete')),
  total_weighted numeric(9,2), total_coefficients numeric(6,2),
  average numeric(5,2), position int, eligible_count int,
  incomplete_subjects uuid[] not null default '{}',
  computed_at timestamptz not null default now(),
  unique (enrollment_id, term_id)
);

create table student_annual_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  enrollment_id uuid not null references student_enrollments(id) on delete cascade,
  annual_average numeric(5,2), annual_position int,
  auto_decision decision_type not null default 'under_review',   -- calculated, never overwritten by admin
  manual_decision decision_type, manual_reason text, manual_by uuid references profiles(id), manual_at timestamptz,
  computed_at timestamptz not null default now(),
  unique (enrollment_id)
);

create table report_cards (                 -- generation history
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  enrollment_id uuid references student_enrollments(id) on delete set null,
  class_id uuid references classes(id) on delete set null,
  term_id uuid not null references terms(id),
  generated_by uuid not null references profiles(id),
  is_provisional boolean not null default false,
  page_count int not null check (page_count >= 1),
  storage_path text, created_at timestamptz not null default now()
);

-- ===== RLS =====
do $$
declare t text;
begin
  foreach t in array array['grading_rules','report_templates','school_assets','term_remarks',
                           'student_term_results','student_annual_results','report_cards']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- Config tables: members read, admins write.
do $$
declare t text;
begin
  foreach t in array array['grading_rules','report_templates','school_assets']
  loop
    execute format('create policy %I on %I for select using (is_school_member(school_id))', t||'_read', t);
    execute format('create policy %I on %I for all using (is_school_admin(school_id)) with check (is_school_admin(school_id))', t||'_admin', t);
  end loop;
end $$;

-- Results: admins read; class teachers read their class. No write policies (server/service role only).
create policy term_results_read on student_term_results for select using (
  is_school_admin(school_id) or exists (select 1 from student_enrollments e where e.id = enrollment_id and is_class_teacher(e.class_id)));
create policy annual_results_read on student_annual_results for select using (
  is_school_admin(school_id) or exists (select 1 from student_enrollments e where e.id = enrollment_id and is_class_teacher(e.class_id)));
-- Manual decision override goes through this function, which keeps auto_decision untouched.
create or replace function set_manual_decision(p_enrollment uuid, p_decision decision_type, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select school_id into sid from public.student_enrollments where id = p_enrollment;
  if not public.is_school_admin(sid) then raise exception 'access denied'; end if;
  update public.student_annual_results set manual_decision = p_decision, manual_reason = p_reason,
    manual_by = auth.uid(), manual_at = now() where enrollment_id = p_enrollment;
end $$;
revoke all on function set_manual_decision(uuid, decision_type, text) from public, anon;
grant execute on function set_manual_decision(uuid, decision_type, text) to authenticated;

create policy remarks_read on term_remarks for select using (
  is_school_admin(school_id) or exists (select 1 from student_enrollments e where e.id = enrollment_id and is_class_teacher(e.class_id)));
create policy remarks_write on term_remarks for all
  using (is_school_admin(school_id) or exists (select 1 from student_enrollments e where e.id = enrollment_id and is_class_teacher(e.class_id)))
  with check (is_school_admin(school_id) or exists (select 1 from student_enrollments e where e.id = enrollment_id and is_class_teacher(e.class_id)));

create policy report_cards_read on report_cards for select using (is_school_admin(school_id));
create policy report_cards_insert on report_cards for insert with check (is_school_admin(school_id) and generated_by = auth.uid());

-- ===== AUDIT: generic row trigger + immutability =====
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid; rid uuid;
begin
  sid := coalesce((to_jsonb(new)->>'school_id')::uuid, (to_jsonb(old)->>'school_id')::uuid);
  rid := coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid);
  insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, old_value, new_value)
  values (sid, auth.uid(), tg_op, tg_table_name, rid,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['students','student_enrollments','classes','subjects','class_subjects','teacher_assignments',
                           'school_settings','grading_rules','report_templates','report_cards','student_annual_results','school_memberships']
  loop execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_row()', 'aud_'||t, t); end loop;
end $$;

create or replace function block_log_changes() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name; end $$;
create trigger audit_immutable before update or delete on audit_logs for each row execute function block_log_changes();
create trigger approvals_immutable before update or delete on approval_logs for each row execute function block_log_changes();
-- approval_logs has on delete cascade from mark_submissions; deleting submissions is not permitted for normal users (no policy).
