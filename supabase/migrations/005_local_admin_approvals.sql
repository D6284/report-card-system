-- Local admin sessions are authorized by the application cookie rather than
-- a Supabase JWT, so their review actions must be initiated by trusted server code.
alter table public.approval_logs alter column actor_id drop not null;

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
begin
  if auth.role() <> 'service_role' then raise exception 'access denied'; end if;
  select * into s from public.mark_submissions where id = p_submission for update;
  if s.id is null or s.school_id <> p_school then raise exception 'submission not found'; end if;
  if s.status <> 'submitted' then raise exception 'submission is not pending'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'invalid decision'; end if;
  if p_decision = 'rejected' and coalesce(trim(p_reason),'') = '' then raise exception 'rejection reason required'; end if;

  update public.mark_submissions set status = p_decision, rejection_reason = p_reason,
    reviewed_by = null, reviewed_at = now() where id = p_submission;
  insert into public.approval_logs (school_id, submission_id, cycle_no, from_status, to_status, actor_id, reason, snapshot)
    select s.school_id, s.id, s.cycle_no, 'submitted', p_decision, null, p_reason,
      (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.marks m where m.submission_id = s.id);
  insert into public.notifications (school_id, user_id, title, body, link)
    values (s.school_id, s.teacher_id, 'Marks ' || p_decision::text, p_reason, '/teacher/submissions/' || s.id);
end;
$$;

create or replace function public.reopen_submission_local(
  p_submission uuid,
  p_school uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare s public.mark_submissions;
begin
  if auth.role() <> 'service_role' then raise exception 'access denied'; end if;
  select * into s from public.mark_submissions where id = p_submission for update;
  if s.id is null or s.school_id <> p_school then raise exception 'submission not found'; end if;
  if s.status <> 'approved' then raise exception 'only approved submissions can be reopened'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'reason required'; end if;

  update public.mark_submissions set status = 'reopened', rejection_reason = p_reason where id = p_submission;
  insert into public.approval_logs (school_id, submission_id, cycle_no, from_status, to_status, actor_id, reason, snapshot)
    select s.school_id, s.id, s.cycle_no, 'approved', 'reopened', null, p_reason,
      (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.marks m where m.submission_id = s.id);
  insert into public.notifications (school_id, user_id, title, body, link)
    values (s.school_id, s.teacher_id, 'Submission reopened for correction', p_reason, '/teacher/submissions/' || s.id);
end;
$$;

revoke all on function public.review_submission_local(uuid, uuid, public.submission_status, text),
  public.reopen_submission_local(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.review_submission_local(uuid, uuid, public.submission_status, text),
  public.reopen_submission_local(uuid, uuid, text) to service_role;
