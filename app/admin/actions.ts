'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z, type ZodSchema } from 'zod';
import { requireRole, requireSchoolSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase/admin';
import * as S from '@/lib/validations/schemas';
import * as XLSX from 'xlsx';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { TEACHER_SETUP_MESSAGE } from '@/lib/supabase/config';
import { addLocalClass, addLocalStudent, addLocalYear, localClasses, localStudents, localYears, setLocalStudentStatus } from '@/lib/local-preview';

const back = (path: string, error?: string): never => redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
function parse<T>(schema: ZodSchema<T>, fd: FormData, path: string): T {
  const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => v !== ''));
  const r = schema.safeParse(raw);
  return r.success ? r.data : back(path, r.error.issues[0].message);
}

export async function createClass(fd: FormData) {
  const s = await requireRole('school_admin'); const d = parse(S.classSchema, fd, '/admin/classes');
  if (isLocalAuthEnabled()) {
    await addLocalClass(d.name, d.stream ?? '');
    revalidatePath('/admin/classes'); back('/admin/classes');
  }
  const { error } = await (await createClient()).from('classes').insert({ school_id: s.schoolId, name: d.name, stream: d.stream ?? null });
  revalidatePath('/admin/classes'); back('/admin/classes', error?.message);
}
export async function assignClassTeacher(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const d = parse(S.classTeacherSchema, fd, '/admin/classes');
  const { error } = await (await createClient()).from('classes').update({ class_teacher_id: d.teacher_id })
    .eq('id', d.class_id).eq('school_id', s.schoolId);
  revalidatePath('/admin/classes'); back('/admin/classes', error?.message);
}

export async function clearClassTeacher(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const id = String(fd.get('id') ?? '');
  if (!id) back('/admin/classes', 'Missing class');
  const { error } = await (await createClient()).from('classes').update({ class_teacher_id: null }).eq('id', id).eq('school_id', s.schoolId);
  revalidatePath('/admin/classes'); back('/admin/classes', error?.message);
}

export async function deleteClass(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const id = String(fd.get('id') ?? '');
  if (!id) back('/admin/classes', 'Missing class');
  const sb = await createClient();
  const [{ count: enrollments }, { count: allocations }] = await Promise.all([
    sb.from('student_enrollments').select('id', { count: 'exact', head: true }).eq('class_id', id).eq('school_id', s.schoolId),
    sb.from('class_subjects').select('id', { count: 'exact', head: true }).eq('class_id', id).eq('school_id', s.schoolId),
  ]);
  if ((enrollments ?? 0) > 0 || (allocations ?? 0) > 0) back('/admin/classes', 'Remove enrolments and subject assignments before deleting this class');
  const { error } = await sb.from('classes').delete().eq('id', id).eq('school_id', s.schoolId);
  revalidatePath('/admin/classes'); back('/admin/classes', error?.message);
}

export async function createSubject(fd: FormData) {
  const s = await requireRole('school_admin'); const d = parse(S.subjectSchema, fd, '/admin/subjects');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { error } = await sb.from('subjects').insert({ school_id: s.schoolId, name: d.name, code: d.code ?? null });
  revalidatePath('/admin/subjects'); back('/admin/subjects', error?.message);
}
export async function createGroup(fd: FormData) {
  const s = await requireRole('school_admin'); const d = parse(S.nameSchema, fd, '/admin/subjects');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { error } = await sb.from('subject_groups').insert({ school_id: s.schoolId, name: d.name, display_order: d.display_order });
  revalidatePath('/admin/subjects'); back('/admin/subjects', error?.message);
}
export async function deleteSubject(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const id = String(fd.get('id') ?? '');
  if (!id) back('/admin/subjects', 'Missing subject');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { count } = await sb.from('class_subjects').select('id', { count: 'exact', head: true }).eq('subject_id', id).eq('school_id', s.schoolId);
  if ((count ?? 0) > 0) back('/admin/subjects', 'Remove class assignments before deleting this subject');
  const { error } = await sb.from('subjects').delete().eq('id', id).eq('school_id', s.schoolId);
  revalidatePath('/admin/subjects'); back('/admin/subjects', error?.message);
}

export async function assignSubject(fd: FormData) {
  const s = await requireRole('school_admin'); const d = parse(S.classSubjectSchema, fd, '/admin/subjects');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { error } = await sb.from('class_subjects').insert({ school_id: s.schoolId, ...d, group_id: d.group_id ?? null });
  revalidatePath('/admin/subjects'); back('/admin/subjects', error?.message);
}
export async function createStudent(fd: FormData) {
  const s = await requireRole('school_admin');
  const local = isLocalAuthEnabled();
  const d = parse(local ? S.localStudentSchema : S.studentSchema, fd, '/admin/students');
  const { class_id, academic_year_id, ...student } = d;
  if (local) {
    let admissionNo = student.admission_no;
    if (!admissionNo) {
      const prefix = `STU-${new Date().getFullYear()}-`;
      const existing = await localStudents();
      const next = existing.reduce((max, row) => {
        const n = Number(row.admission_no.slice(prefix.length));
        return Number.isFinite(n) && n > max ? n : max;
      }, 0) + 1;
      admissionNo = `${prefix}${String(next).padStart(4, '0')}`;
    }
    if (!(await localClasses()).some((c) => c.id === class_id)) back('/admin/students', 'Invalid class');
    if (!(await localYears()).some((y) => y.id === academic_year_id)) back('/admin/students', 'Invalid academic year');
    await addLocalStudent({ ...student, admission_no: admissionNo!, class_id, academic_year_id });
    revalidatePath('/admin/students'); redirect('/admin/students?saved=Student%20registered');
  }
  const sb = await createClient();
  if (!student.admission_no) {
    const prefix = `STU-${new Date().getFullYear()}-`;
    const { data: existing } = await sb.from('students').select('admission_no').eq('school_id', s.schoolId).like('admission_no', `${prefix}%`);
    const next = (existing ?? []).reduce((max, row) => {
      const n = Number(String(row.admission_no).slice(prefix.length));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1;
    student.admission_no = `${prefix}${String(next).padStart(4, '0')}`;
  }
  const { data: st, error } = await sb.from('students').insert({ school_id: s.schoolId, ...student }).select('id').single();
  if (error) back('/admin/students', error.message);
  const { error: e2 } = await sb.from('student_enrollments').insert({ school_id: s.schoolId, student_id: st!.id, class_id, academic_year_id, status: 'active' });
  if (e2) { await sb.from('students').delete().eq('id', st!.id); back('/admin/students', e2.message); }
  revalidatePath('/admin/students'); back('/admin/students');
}

export async function toggleStudentStatus(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const id = String(fd.get('id') ?? '');
  const active = fd.get('active') === 'true';
  if (!id) back('/admin/students', 'Missing student');
  if (isLocalAuthEnabled()) {
    await setLocalStudentStatus(id, !active);
    revalidatePath('/admin/students'); back('/admin/students');
  }
  const sb = await createClient();
  const { error } = await sb.from('students').update({ is_active: !active }).eq('id', id).eq('school_id', s.schoolId);
  revalidatePath('/admin/students'); back('/admin/students', error?.message);
}

export async function moveStudentEnrollment(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const d = parse(z.object({
    admission_no: z.string().trim().min(1).max(40),
    class_id: z.string().uuid(),
    academic_year_id: z.string().uuid(),
  }), fd, '/admin/students');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const [{ data: student, error: studentError }, { data: classRow, error: classError }, { data: yearRow, error: yearError }] = await Promise.all([
    sb.from('students').select('id').eq('school_id', s.schoolId).eq('admission_no', d.admission_no).maybeSingle(),
    sb.from('classes').select('id').eq('school_id', s.schoolId).eq('id', d.class_id).maybeSingle(),
    sb.from('academic_years').select('id').eq('school_id', s.schoolId).eq('id', d.academic_year_id).maybeSingle(),
  ]);
  const lookupError = studentError ?? classError ?? yearError;
  if (lookupError) back('/admin/students', lookupError.message);
  if (!student || !classRow || !yearRow) return back('/admin/students', 'Select a student, class, and academic year from this school');

  const { data: existing, error: enrollmentLookupError } = await sb.from('student_enrollments')
    .select('id').eq('school_id', s.schoolId).eq('student_id', student.id)
    .eq('academic_year_id', d.academic_year_id).maybeSingle();
  if (enrollmentLookupError) back('/admin/students', enrollmentLookupError.message);

  const result = existing
    ? await sb.from('student_enrollments').update({ class_id: d.class_id, status: 'active' })
      .eq('id', existing.id).eq('school_id', s.schoolId)
    : await sb.from('student_enrollments').insert({
      school_id: s.schoolId,
      student_id: student.id,
      class_id: d.class_id,
      academic_year_id: d.academic_year_id,
      status: 'active',
    });
  revalidatePath('/admin/students');
  revalidatePath('/admin/teachers');
  revalidatePath('/teacher');
  back('/admin/students', result.error?.message);
}

export async function createAcademicYear(fd: FormData) {
  const s = await requireRole('school_admin'); const d = parse(S.yearSchema, fd, '/admin/academic-years');
  if (isLocalAuthEnabled()) {
    await addLocalYear(d.name, d.starts_on, d.ends_on);
    revalidatePath('/admin/academic-years'); back('/admin/academic-years');
  }
  const sb = await createClient();
  const { data: y, error } = await sb.from('academic_years').insert({
    school_id: s.schoolId, name: d.name, starts_on: d.starts_on || null, ends_on: d.ends_on || null,
  }).select('id').single();
  if (error) back('/admin/academic-years', error.message);
  const { error: termsError } = await sb.from('terms').insert([1, 2, 3].map((n) => ({ school_id: s.schoolId, academic_year_id: y!.id, term_no: n })));
  if (termsError) back('/admin/academic-years', termsError.message);
  revalidatePath('/admin/academic-years'); back('/admin/academic-years');
}
export async function setCurrentYear(fd: FormData) {
  const s = await requireRole('school_admin'); const id = String(fd.get('id'));
  const sb = await createClient();
  await sb.from('academic_years').update({ is_current: false }).eq('school_id', s.schoolId);
  await sb.from('academic_years').update({ is_current: true }).eq('id', id);
  revalidatePath('/admin/academic-years');
}
export async function toggleSequence(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { error } = await sb.from('sequences').update({ is_open: fd.get('open') === 'true' })
    .eq('id', String(fd.get('id'))).eq('school_id', s.schoolId);
  revalidatePath('/admin/academic-years'); back('/admin/academic-years', error?.message);
}
export async function saveSequenceAssessment(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const id = String(fd.get('id') ?? '');
  const label = String(fd.get('label') ?? '').trim();
  const weight = Number(fd.get('weight'));
  if (!id || !label || label.length > 40 || !Number.isFinite(weight) || weight <= 0 || weight > 100) {
    back('/admin/academic-years', 'Enter an assessment label (up to 40 characters) and a weight greater than 0 and at most 100.');
  }
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { error } = await sb.from('sequences').update({ label, weight }).eq('id', id).eq('school_id', s.schoolId);
  revalidatePath('/admin/academic-years'); back('/admin/academic-years', error?.message);
}
export async function addAssessmentSequence(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const termId = String(fd.get('term_id') ?? '');
  const label = String(fd.get('label') ?? '').trim();
  const weight = Number(fd.get('weight') ?? 1);
  if (!termId || !label || label.length > 40 || !Number.isFinite(weight) || weight <= 0 || weight > 100) {
    back('/admin/academic-years', 'Enter an assessment label (up to 40 characters) and a weight greater than 0 and at most 100.');
  }
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { data: term, error: termError } = await sb.from('terms').select('id,academic_year_id')
    .eq('id', termId).eq('school_id', s.schoolId).maybeSingle();
  if (termError) back('/admin/academic-years', termError.message);
  if (!term) return back('/admin/academic-years', 'Term not found');
  const { data: yearTerms, error: yearsError } = await sb.from('terms').select('id')
    .eq('academic_year_id', term.academic_year_id).eq('school_id', s.schoolId);
  if (yearsError) back('/admin/academic-years', yearsError.message);
  const { data: sequences, error: sequenceError } = await sb.from('sequences').select('seq_no')
    .eq('school_id', s.schoolId).in('term_id', (yearTerms ?? []).map((row) => row.id));
  if (sequenceError) back('/admin/academic-years', sequenceError.message);
  const seqNo = Math.max(0, ...(sequences ?? []).map((sequence) => sequence.seq_no)) + 1;
  const { error } = await sb.from('sequences').insert({
    school_id: s.schoolId, term_id: termId, seq_no: seqNo, label, weight, is_open: false,
  });
  revalidatePath('/admin/academic-years'); back('/admin/academic-years', error?.message);
}
export async function saveAnnualTermWeight(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const id = String(fd.get('id') ?? '');
  const annual_weight = Number(fd.get('annual_weight'));
  if (!id || !Number.isFinite(annual_weight) || annual_weight <= 0 || annual_weight > 100) {
    back('/admin/academic-years', 'Annual term weight must be greater than 0 and at most 100.');
  }
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { error } = await sb.from('terms').update({ annual_weight }).eq('id', id).eq('school_id', s.schoolId);
  revalidatePath('/admin/academic-years'); back('/admin/academic-years', error?.message);
}
export async function toggleTerm(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const sb = await createClient();
  const { error } = await sb.from('terms').update({ is_open: fd.get('open') === 'true' })
    .eq('id', String(fd.get('id'))).eq('school_id', s.schoolId);
  revalidatePath('/admin/academic-years'); back('/admin/academic-years', error?.message);
}
export async function closeYear(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const id = String(fd.get('id') ?? '');
  if (!id) back('/admin/academic-years', 'Missing academic year');
  const sb = await createClient();
  await sb.from('terms').update({ is_open: false }).eq('academic_year_id', id).eq('school_id', s.schoolId);
  const { error } = await sb.from('academic_years').update({ is_current: false }).eq('id', id).eq('school_id', s.schoolId);
  revalidatePath('/admin/academic-years'); back('/admin/academic-years', error?.message);
}
export async function createTeacher(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  if (!isSupabaseAdminConfigured()) back('/admin/teachers', TEACHER_SETUP_MESSAGE);
  const d = parse(S.teacherSchema.extend({
    school_name: z.string().trim().max(160).optional(),
  }), fd, '/admin/teachers');
  const admin = createAdminClient();

  const { data: school, error: schoolLookupError } = await admin.from('schools').select('id')
    .eq('id', s.schoolId).maybeSingle();
  if (schoolLookupError) back('/admin/teachers', schoolLookupError.message);
  if (!school) {
    if (!d.school_name) back('/admin/teachers', 'Enter the school name to create its workspace');
    const { error: schoolError } = await admin.from('schools').upsert(
      { id: s.schoolId, name: d.school_name },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (schoolError) back('/admin/teachers', schoolError.message);
    const { error: settingsError } = await admin.from('school_settings').upsert(
      { school_id: s.schoolId },
      { onConflict: 'school_id', ignoreDuplicates: true },
    );
    if (settingsError) back('/admin/teachers', settingsError.message);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: d.email.trim().toLowerCase(),
    password: d.password,
    email_confirm: true,
  });
  if (error) back('/admin/teachers', error.message);
  const uid = data.user?.id;
  if (typeof uid !== 'string') return back('/admin/teachers', 'Supabase created no user account');
  const { error: profileError } = await admin.from('profiles').insert({ id: uid, full_name: d.full_name });
  if (profileError) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(uid);
    back('/admin/teachers', cleanupError
      ? `${profileError.message}. Could not remove the incomplete auth user: ${cleanupError.message}`
      : profileError.message);
  }
  const { error: membershipError } = await admin.from('school_memberships')
    .insert({ school_id: s.schoolId, user_id: uid, role: 'teacher' });
  if (membershipError) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(uid);
    back('/admin/teachers', cleanupError
      ? `${membershipError.message}. Could not remove the incomplete auth user: ${cleanupError.message}`
      : membershipError.message);
  }
  revalidatePath('/admin/teachers'); back('/admin/teachers');
}
export async function assignTeacher(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  if (!isSupabaseAdminConfigured()) back('/admin/teachers', TEACHER_SETUP_MESSAGE);
  const d = parse(S.assignSchema, fd, '/admin/teachers');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const [{ data: teacher }, { data: classSubject }] = await Promise.all([
    sb.from('school_memberships').select('user_id').eq('user_id', d.teacher_id).eq('school_id', s.schoolId).eq('role', 'teacher').eq('is_active', true).maybeSingle(),
    sb.from('class_subjects').select('id').eq('id', d.class_subject_id).eq('school_id', s.schoolId).maybeSingle(),
  ]);
  if (!teacher || !classSubject) back('/admin/teachers', 'Select an active teacher and class subject from this school');
  const { error } = await sb.from('teacher_assignments').upsert(
    { school_id: s.schoolId, ...d },
    { onConflict: 'class_subject_id,teacher_id', ignoreDuplicates: true },
  );
  revalidatePath('/admin/teachers');
  revalidatePath('/teacher');
  back('/admin/teachers', error?.message);
}
export async function toggleTeacherStatus(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  if (!isSupabaseAdminConfigured()) back('/admin/teachers', TEACHER_SETUP_MESSAGE);
  const userId = String(fd.get('user_id') ?? '');
  const active = fd.get('active') === 'true';
  if (!userId) back('/admin/teachers', 'Missing teacher');
  const admin = createAdminClient();
  const { error } = await admin.from('school_memberships').update({ is_active: !active })
    .eq('user_id', userId).eq('school_id', s.schoolId).eq('role', 'teacher');
  if (!error) await admin.from('profiles').update({ is_active: !active }).eq('id', userId);
  revalidatePath('/admin/teachers'); back('/admin/teachers', error?.message);
}

export async function removeTeacherAssignment(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  if (!isSupabaseAdminConfigured()) back('/admin/teachers', TEACHER_SETUP_MESSAGE);
  const id = String(fd.get('id') ?? '');
  if (!id) back('/admin/teachers', 'Missing assignment');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { error } = await sb.from('teacher_assignments').delete().eq('id', id).eq('school_id', s.schoolId);
  revalidatePath('/admin/teachers'); back('/admin/teachers', error?.message);
}

export async function reviewSubmission(fd: FormData) {
  const session = await requireSchoolSession('school_admin'); const d = parse(S.reviewSchema, fd, '/admin/approvals');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { error } = isLocalAuthEnabled()
    ? await sb.rpc('review_submission_local', {
      p_submission: d.submission_id, p_school: session.schoolId, p_decision: d.decision, p_reason: d.reason ?? null,
    })
    : await sb.rpc('review_submission', { p_submission: d.submission_id, p_decision: d.decision, p_reason: d.reason ?? null });
  revalidatePath('/admin/approvals'); back('/admin/approvals', error?.message);
}
export async function reopenSubmission(fd: FormData) {
  const session = await requireSchoolSession('school_admin');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { error } = isLocalAuthEnabled()
    ? await sb.rpc('reopen_submission_local', {
      p_submission: String(fd.get('submission_id')), p_school: session.schoolId, p_reason: String(fd.get('reason') ?? ''),
    })
    : await sb.rpc('reopen_submission', { p_submission: String(fd.get('submission_id')), p_reason: String(fd.get('reason') ?? '') });
  revalidatePath('/admin/approvals'); back('/admin/approvals', error?.message);
}

export async function updateSchoolSettings(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const d = parse(S.schoolSettingsSchema, fd, '/admin/settings');
  const localAuth = isLocalAuthEnabled();
  const sb = localAuth ? createAdminClient() : await createClient();

  const schoolValues = {
    name: d.name,
    location: d.location ?? null,
    address: d.address ?? null,
    phone: d.phone ?? null,
    email: d.email ?? null,
    website: d.website ?? null,
    motto: d.motto ?? null,
  };
  const { error: schoolError } = localAuth
    ? await sb.from('schools').upsert({ id: s.schoolId, ...schoolValues }, { onConflict: 'id' })
    : await sb.from('schools').update(schoolValues).eq('id', s.schoolId);
  if (schoolError) back('/admin/settings', schoolError.message);

  const { error: settingsError } = await sb.from('school_settings').upsert({
    school_id: s.schoolId,
    default_max_mark: d.default_max_mark,
    passing_average: d.passing_average,
    ranking_policy: d.ranking_policy,
    report_footer: d.report_footer ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'school_id' });
  if (settingsError) back('/admin/settings', settingsError.message);

  revalidatePath('/admin/settings');
  back('/admin/settings');
}

export async function setDecision(fd: FormData) {
  await requireSchoolSession('school_admin');
  const d = parse(S.decisionSchema, fd, '/admin/decisions');
  const sb = await createClient();
  const { error } = await sb.rpc('set_manual_decision', {
    p_enrollment: d.enrollment_id,
    p_decision: d.decision,
    p_reason: d.reason ?? null,
  });
  if (!error) revalidatePath('/admin/decisions');
  back('/admin/decisions', error?.message);
}

export async function createGradingRule(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const d = parse(S.gradingRuleSchema, fd, '/admin/settings');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { error } = await sb.from('grading_rules').insert({ school_id: s.schoolId, ...d });
  revalidatePath('/admin/settings');
  back('/admin/settings', error?.message);
}

export async function deleteGradingRule(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const id = String(fd.get('id') ?? '');
  if (!id) back('/admin/settings', 'Missing grading rule');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { error } = await sb.from('grading_rules').delete().eq('id', id).eq('school_id', s.schoolId);
  revalidatePath('/admin/settings');
  back('/admin/settings', error?.message);
}

export async function importStudentsFromExcel(fd: FormData) {
  const s = await requireSchoolSession('school_admin');
  const file = fd.get('file');
  const classId = String(fd.get('class_id') ?? '');
  const academicYearId = String(fd.get('academic_year_id') ?? '');

  if (!(file instanceof File) || file.size === 0) return back('/admin/students/import', 'Please select a valid Excel or CSV file.');

  const rowSchema = z.object({
    full_name: z.string().trim().min(2).max(120),
    admission_no: z.string().trim().min(1).max(40),
    gender: z.enum(['M', 'F']),
    date_of_birth: z.string().trim().date().optional(),
    place_of_birth: z.string().trim().max(80).optional(),
    guardian_name: z.string().trim().max(120).optional(),
    guardian_phone: z.string().trim().max(30).optional(),
  });

  const asDate = (value: unknown): string | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
      const parts = XLSX.SSF.parse_date_code(value);
      return parts ? `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}` : undefined;
    }
    return String(value).trim() || undefined;
  };

  let rows: Record<string, unknown>[] = [];
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  } catch (err: any) {
    return back('/admin/students/import', `Could not read the file: ${err.message}`);
  }
  if (rows.length === 0) back('/admin/students/import', 'The uploaded sheet contains no data rows.');

  const pick = (row: Record<string, unknown>, names: string[]) => {
    for (const n of names) if (row[n] !== undefined && row[n] !== null && String(row[n]).trim()) return row[n];
    return undefined;
  };
  const errors: string[] = [];
  const parsed: z.infer<typeof rowSchema>[] = [];
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const raw = {
      full_name: pick(row, ['Full Name', 'full_name', 'Name']),
      admission_no: pick(row, ['Admission No', 'admission_no', 'Admission']),
      gender: String(pick(row, ['Gender', 'gender']) ?? 'M').trim().toUpperCase().startsWith('F') ? 'F' : 'M',
      date_of_birth: asDate(pick(row, ['Date of Birth', 'date_of_birth', 'DOB'])),
      place_of_birth: pick(row, ['Place of Birth', 'place_of_birth']),
      guardian_name: pick(row, ['Guardian Name', 'guardian_name']),
      guardian_phone: pick(row, ['Guardian Phone', 'guardian_phone']),
    };
    const result = rowSchema.safeParse(raw);
    if (!result.success) {
      errors.push(`Row ${i + 2}: ${result.error.issues[0].message}`);
      return;
    }
    const key = result.data.admission_no.toUpperCase();
    if (seen.has(key)) {
      errors.push(`Row ${i + 2}: duplicate admission number ${result.data.admission_no}`);
      return;
    }
    seen.add(key);
    parsed.push(result.data);
  });
  if (errors.length) back('/admin/students/import', errors.slice(0, 3).join(' | '));

  const sb = await createClient();
  const { data: existing } = await sb.from('students').select('admission_no').eq('school_id', s.schoolId).in('admission_no', parsed.map((r) => r.admission_no));
  const existingSet = new Set((existing ?? []).map((r: any) => String(r.admission_no).toUpperCase()));
  const fresh = parsed.filter((r) => !existingSet.has(r.admission_no.toUpperCase()));

  if (classId || academicYearId) {
    if (!classId || !academicYearId) back('/admin/students/import', 'Select both a class and an academic year, or neither.');
    const [{ data: cls }, { data: year }] = await Promise.all([
      sb.from('classes').select('id').eq('id', classId).eq('school_id', s.schoolId).maybeSingle(),
      sb.from('academic_years').select('id').eq('id', academicYearId).eq('school_id', s.schoolId).maybeSingle(),
    ]);
    if (!cls || !year) back('/admin/students/import', 'The selected class or academic year is invalid.');
  }

  let inserted = 0;
  for (const row of fresh) {
    const { data: student, error } = await sb.from('students').insert({ school_id: s.schoolId, ...row }).select('id').single();
    if (error || !student) {
      errors.push(`${row.admission_no}: ${error?.message ?? 'insert failed'}`);
      continue;
    }
    if (classId && academicYearId) {
      const { error: enrollError } = await sb.from('student_enrollments').insert({
        school_id: s.schoolId, student_id: student.id, class_id: classId, academic_year_id: academicYearId,
      });
      if (enrollError) {
        await sb.from('students').delete().eq('id', student.id);
        errors.push(`${row.admission_no}: ${enrollError.message}`);
        continue;
      }
    }
    inserted++;
  }

  revalidatePath('/admin/students');
  if (errors.length) back('/admin/students/import', `${inserted} imported; errors: ${errors.slice(0, 3).join(' | ')}`);
  redirect(`/admin/students?saved=${encodeURIComponent(`${inserted} student(s) imported; ${parsed.length - fresh.length} duplicate(s) skipped.`)}`);
}
