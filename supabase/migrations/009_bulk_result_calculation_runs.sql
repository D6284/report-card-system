-- Administrator bulk calculation audit and recalculation tracking.

create table if not exists public.result_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  initiated_by uuid references public.profiles(id),
  status text not null default 'calculated'
    check (status in ('calculating','calculated','provisional','recalculation_required','failed')),
  approved_submission_fingerprint text,
  total_students integer not null default 0,
  complete_students integer not null default 0,
  incomplete_students integer not null default 0,
  pending_submissions integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (school_id, academic_year_id, term_id, class_id)
);

create index if not exists result_calculation_runs_lookup_idx
  on public.result_calculation_runs (school_id, academic_year_id, term_id, class_id);

alter table public.result_calculation_runs enable row level security;

create policy result_calculation_runs_admin_read
  on public.result_calculation_runs
  for select
  using (public.is_school_admin(school_id));

-- Mark existing calculations as requiring recalculation after approved marks change.
create or replace function public.invalidate_result_calculation_for_marks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission public.mark_submissions;
  class_subject public.class_subjects;
begin
  if tg_op = 'DELETE' then
    select * into submission
      from public.mark_submissions
      where id = old.submission_id;
  else
    select * into submission
      from public.mark_submissions
      where id = new.submission_id;
  end if;

  if submission.id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select * into class_subject
  from public.class_subjects
  where id = submission.class_subject_id;

  if class_subject.id is not null then
    update public.result_calculation_runs
    set status = 'recalculation_required',
        completed_at = null,
        error = null
    where school_id = submission.school_id
      and class_id = class_subject.class_id
      and academic_year_id = class_subject.academic_year_id
      and status = 'calculated';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_invalidate_result_calculation_marks on public.marks;
create trigger trg_invalidate_result_calculation_marks
  after insert or update or delete on public.marks
  for each row execute function public.invalidate_result_calculation_for_marks();

create or replace function public.invalidate_result_calculation_for_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  class_subject public.class_subjects;
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status in ('reopened', 'rejected', 'draft', 'submitted') then
    select * into class_subject
    from public.class_subjects
    where id = new.class_subject_id;

    if class_subject.id is not null then
      update public.result_calculation_runs
      set status = 'recalculation_required',
          completed_at = null,
          error = null
      where school_id = new.school_id
        and class_id = class_subject.class_id
        and academic_year_id = class_subject.academic_year_id
        and status = 'calculated';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invalidate_result_calculation_submission on public.mark_submissions;
create trigger trg_invalidate_result_calculation_submission
  after update on public.mark_submissions
  for each row execute function public.invalidate_result_calculation_for_submission();
