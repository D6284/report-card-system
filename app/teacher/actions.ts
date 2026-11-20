'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSchoolSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { validateMark } from '@/lib/calculations/engine';
import { marksSchema } from '@/lib/validations/schemas';

export type SaveResult = { ok: true; status: string; saved: number } | { ok: false; error: string };

export async function saveMarks(input: unknown, submit: boolean): Promise<SaveResult> {
  const s = await requireSchoolSession('teacher');
  const parsed = marksSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { class_subject_id, sequence_id, entries } = parsed.data;
  const sb = await createClient();

  const { data: cs } = await sb.from('class_subjects').select('id,class_id,academic_year_id,max_mark').eq('id', class_subject_id).eq('school_id', s.schoolId).single();
  const { data: assigned } = await sb.from('teacher_assignments').select('id').eq('class_subject_id', class_subject_id).eq('teacher_id', s.userId).maybeSingle();
  if (!cs || !assigned) return { ok: false, error: 'You are not assigned to this class and subject.' };

  const { data: seq } = await sb.from('sequences').select('is_open').eq('id', sequence_id).eq('school_id', s.schoolId).single();
  if (!seq?.is_open) return { ok: false, error: 'This sequence is closed.' };

  for (const entry of entries) {
    if (entry.state !== 'entered') continue;
    if (entry.value === null) return { ok: false, error: 'A mark is required when state is "entered".' };
    const result = validateMark(entry.value, Number(cs.max_mark));
    if (!result.ok) return { ok: false, error: result.error };
  }

  const ids = entries.map((e) => e.enrollment_id);
  const { data: enrollments } = await sb.from('student_enrollments').select('id').in('id', ids)
    .eq('class_id', cs.class_id).eq('academic_year_id', cs.academic_year_id).eq('school_id', s.schoolId);
  if ((enrollments?.length ?? 0) !== ids.length) return { ok: false, error: 'Some students do not belong to this class.' };

  let { data: submission } = await sb.from('mark_submissions').select('id,status')
    .eq('class_subject_id', class_subject_id).eq('sequence_id', sequence_id).maybeSingle();
  if (!submission) {
    const { data: created, error } = await sb.from('mark_submissions')
      .insert({ school_id: s.schoolId, class_subject_id, sequence_id, teacher_id: s.userId })
      .select('id,status').single();
    if (error) return { ok: false, error: error.message };
    submission = created;
  }
  if (!['draft', 'rejected', 'reopened'].includes(submission!.status)) {
    return { ok: false, error: `Marks are ${submission!.status} and locked for editing.` };
  }

  const rows = entries.map((e) => ({
    school_id: s.schoolId,
    submission_id: submission!.id,
    enrollment_id: e.enrollment_id,
    state: e.state,
    value: e.state === 'entered' ? e.value : null,
    remark: e.remark ?? null,
  }));
  const { error: upsertError } = await sb.from('marks').upsert(rows, { onConflict: 'submission_id,enrollment_id' });
  if (upsertError) return { ok: false, error: upsertError.message };

  if (!submit) return { ok: true, status: submission!.status, saved: rows.length };

  const { count: total } = await sb.from('student_enrollments').select('id', { count: 'exact', head: true })
    .eq('class_id', cs.class_id).eq('academic_year_id', cs.academic_year_id).eq('status', 'active');
  const missing = entries.filter((e) => e.state === 'missing').length;
  if (missing > 0 || (total ?? 0) > entries.length) {
    return { ok: false, error: `Cannot submit: ${missing} mark(s) missing. Enter marks, or set the student to Not assessed / Exempted.` };
  }
  const { error: submitError } = await sb.rpc('submit_marks', { p_submission: submission!.id });
  if (submitError) return { ok: false, error: submitError.message };
  return { ok: true, status: 'submitted', saved: rows.length };
}

const classRemarkSchema = z.object({
  term_id: z.string().uuid(),
  enrollment_id: z.array(z.string().uuid()).min(1),
  numbers: z.record(z.string(), z.coerce.number().int().min(0).max(10000)),
  texts: z.record(z.string(), z.string().trim().max(1000)),
});

export async function saveClassRemarks(fd: FormData) {
  const s = await requireSchoolSession('teacher', 'school_admin');
  const enrollmentIds = fd.getAll('enrollment_id').map(String);
  const numbers: Record<string, number> = {};
  const texts: Record<string, string> = {};
  enrollmentIds.forEach((id) => {
    ['abs', 'susp', 'pun', 'warn'].forEach((key) => {
      numbers[`${key}_${id}`] = Number(fd.get(`${key}_${id}`) ?? 0);
    });
    ['rem', 'class_rem', 'principal_rem', 'conduct'].forEach((key) => {
      texts[`${key}_${id}`] = String(fd.get(`${key}_${id}`) ?? '').trim();
    });
  });
  const parsed = classRemarkSchema.safeParse({ term_id: fd.get('term_id'), enrollment_id: enrollmentIds, numbers, texts });
  if (!parsed.success) redirect(`/teacher/class?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const d = parsed.data;

  const sb = await createClient();
  const { data: term } = await sb.from('terms').select('id').eq('id', d.term_id).eq('school_id', s.schoolId).maybeSingle();
  if (!term) redirect('/teacher/class?error=Invalid%20term');

  const allowedIds = new Set<string>();
  if (s.role === 'teacher') {
    const { data: allowedClasses } = await sb.from('classes').select('id')
      .eq('school_id', s.schoolId).eq('class_teacher_id', s.userId);
    (allowedClasses ?? []).forEach((c: any) => allowedIds.add(c.id as string));
    if (allowedIds.size === 0) redirect('/teacher/class?error=You%20are%20not%20a%20class%20teacher');
  }

  const { data: enrollments } = await sb.from('student_enrollments').select('id,class_id').in('id', d.enrollment_id).eq('school_id', s.schoolId);
  if ((enrollments?.length ?? 0) !== d.enrollment_id.length ||
      (s.role === 'teacher' && (enrollments ?? []).some((e: any) => !allowedIds.has(e.class_id)))) {
    redirect('/teacher/class?error=Some%20students%20are%20not%20in%20your%20class');
  }

  const rows = d.enrollment_id.map((eid) => ({
    school_id: s.schoolId,
    enrollment_id: eid,
    term_id: d.term_id,
    total_abs: d.numbers[`abs_${eid}`] ?? 0,
    suspensions: d.numbers[`susp_${eid}`] ?? 0,
    punishments: d.numbers[`pun_${eid}`] ?? 0,
    warnings: d.numbers[`warn_${eid}`] ?? 0,
    remark: d.texts[`rem_${eid}`] ?? '',
    class_teacher_remark: d.texts[`class_rem_${eid}`] ?? '',
    principal_remark: d.texts[`principal_rem_${eid}`] ?? '',
    conduct: d.texts[`conduct_${eid}`] ?? '',
  }));
  const { error } = await sb.from('term_remarks').upsert(rows, { onConflict: 'enrollment_id,term_id' });
  if (error) redirect(`/teacher/class?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/teacher/class');
  redirect('/teacher/class?saved=1');
}
