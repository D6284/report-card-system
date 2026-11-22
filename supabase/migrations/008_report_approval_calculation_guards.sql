-- Prevent approval of submissions that cannot produce valid subject results.

create or replace function public.review_submission(p_submission uuid, p_decision submission_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.mark_submissions;
invalid_count integer;
begin
  select * into s from public.mark_submissions where id = p_submission for update;
  if not public.is_school_admin(s.school_id) then raise exception 'access denied'; end if;
  if s.teacher_id = auth.uid() then raise exception 'cannot review your own submission'; end if;
  if s.status <> 'submitted' then raise exception 'submission is not pending'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'invalid decision'; end if;
  if p_decision = 'rejected' and coalesce(trim(p_reason),'') = '' then raise exception 'rejection reason required'; end if;

  if p_decision = 'approved' then
    select count(*) into invalid_count
    from public.marks m
    join public.class_subjects c on c.id = s.class_subject_id
    where m.submission_id = s.id
      and (
        m.state <> 'entered'
        or m.value is null
        or m.value < 0
        or m.value > c.max_mark
      );
    if invalid_count > 0 then
      raise exception 'cannot approve: % mark(s) are missing or outside the subject maximum', invalid_count;
    end if;
  end if;

  update public.mark_submissions set status = p_decision, rejection_reason = p_reason,
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_submission;
  insert into public.approval_logs (school_id, submission_id, cycle_no, from_status, to_status, actor_id, reason, snapshot)
    select s.school_id, s.id, s.cycle_no, 'submitted', p_decision, auth.uid(), p_reason,
      (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.marks m where m.submission_id = s.id);
  insert into public.notifications (school_id, user_id, title, body, link)
    values (s.school_id, s.teacher_id, 'Marks ' || p_decision::text, p_reason, '/teacher/submissions/' || s.id);
end $$;

create or replace function public.review_submission_local(
  p_submission uuid,
  p_school uuid,
  p_decision public.submission_status,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare s public.mark_submissions;
invalid_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'access denied'; end if;
  select * into s from public.mark_submissions where id = p_submission for update;
  if s.id is null or s.school_id <> p_school then raise exception 'submission not found'; end if;
  if s.status <> 'submitted' then raise exception 'submission is not pending'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'invalid decision'; end if;
  if p_decision = 'rejected' and coalesce(trim(p_reason),'') = '' then raise exception 'rejection reason required'; end if;

  if p_decision = 'approved' then
    select count(*) into invalid_count
    from public.marks m
    join public.class_subjects c on c.id = s.class_subject_id
    where m.submission_id = s.id
      and (
        m.state <> 'entered'
        or m.value is null
        or m.value < 0
        or m.value > c.max_mark
      );
    if invalid_count > 0 then
      raise exception 'cannot approve: % mark(s) are missing or outside the subject maximum', invalid_count;
    end if;
  end if;

  update public.mark_submissions set status = p_decision, rejection_reason = p_reason,
    reviewed_by = null, reviewed_at = now() where id = p_submission;
  insert into public.approval_logs (school_id, submission_id, cycle_no, from_status, to_status, actor_id, reason, snapshot)
    select s.school_id, s.id, s.cycle_no, 'submitted', p_decision, null, p_reason,
      (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.marks m where m.submission_id = s.id);
  insert into public.notifications (school_id, user_id, title, body, link)
    values (s.school_id, s.teacher_id, 'Marks ' || p_decision::text, p_reason, '/teacher/submissions/' || s.id);
end;
$$;
