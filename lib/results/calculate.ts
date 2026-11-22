import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildClassReports } from './build-report.ts';

export interface BulkCalculationOptions {
  schoolId: string;
  classId: string;
  yearId: string;
  termNo: 1 | 2 | 3;
  initiatedBy: string | null;
  force?: boolean;
}

export interface BulkCalculationResult {
  runId: string;
  status: 'calculated' | 'provisional';
  totalStudents: number;
  completeStudents: number;
  incompleteStudents: number;
  pendingSubmissions: number;
  cards: number;
}

async function fetchAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function calculateApprovedResults(
  sb: SupabaseClient,
  options: BulkCalculationOptions,
): Promise<BulkCalculationResult> {
  const { schoolId, classId, yearId, termNo, initiatedBy } = options;

  const [{ data: term }, { data: classRow }, { data: yearRow }] = await Promise.all([
    sb.from('terms').select('id').eq('school_id', schoolId).eq('academic_year_id', yearId).eq('term_no', termNo).maybeSingle(),
    sb.from('classes').select('id').eq('school_id', schoolId).eq('id', classId).maybeSingle(),
    sb.from('academic_years').select('id').eq('school_id', schoolId).eq('id', yearId).maybeSingle(),
  ]);
  if (!term || !classRow || !yearRow) throw new Error('Invalid class, academic year or term selection.');

  const [{ data: subjects }, { data: enrollments }] = await Promise.all([
    sb.from('class_subjects').select('id').eq('school_id', schoolId).eq('class_id', classId).eq('academic_year_id', yearId),
    sb.from('student_enrollments').select('id').eq('school_id', schoolId).eq('class_id', classId).eq('academic_year_id', yearId).eq('status', 'active'),
    sb.from('mark_submissions').select('id,status').eq('school_id', schoolId).eq('status', 'submitted'),
  ]);

  const subjectIds = (subjects ?? []).map((row: any) => row.id as string);
  const enrollmentIds = new Set((enrollments ?? []).map((row: any) => row.id as string));
  let pendingSubmissions = 0;
  if (subjectIds.length) {
    const submissionRows = await fetchAll<any>((from, to) =>
      sb.from('mark_submissions')
        .select('id,status,class_subject_id')
        .eq('school_id', schoolId)
        .eq('status', 'submitted')
        .in('class_subject_id', subjectIds)
        .range(from, to));
    const pendingSubmissionIds = submissionRows.map((row) => row.id as string);
    pendingSubmissions = pendingSubmissionIds.length;
    if (pendingSubmissionIds.length) {
      const pendingMarks = await fetchAll<any>((from, to) =>
        sb.from('marks')
          .select('enrollment_id')
          .in('submission_id', pendingSubmissionIds)
          .range(from, to));
      pendingSubmissions = new Set(pendingMarks.map((row) => row.enrollment_id as string).filter((id) => enrollmentIds.has(id))).size;
    }
  }

  let existingRun: any = null;
  try {
    const { data: runRows } = await sb.from('result_calculation_runs')
      .select('approved_submission_fingerprint,status')
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .eq('term_id', term.id)
      .eq('class_id', classId)
      .limit(1);
    existingRun = runRows?.[0] ?? null;
  } catch {
    existingRun = null;
  }

  const approvedSubs = subjectIds.length
    ? await fetchAll<any>((from, to) =>
      sb.from('mark_submissions')
        .select('id,status,class_subject_id,sequence_id,submitted_at,reviewed_at,cycle_no')
        .eq('school_id', schoolId)
        .eq('status', 'approved')
        .in('class_subject_id', subjectIds)
        .range(from, to))
    : [];
  const approvedSubmissionIds = approvedSubs.map((row) => row.id as string);
  const approvedMarks = approvedSubmissionIds.length
    ? await fetchAll<any>((from, to) =>
      sb.from('marks')
        .select('submission_id,enrollment_id,state,value,remark,updated_at')
        .in('submission_id', approvedSubmissionIds)
        .range(from, to))
    : [];
  const fingerprintSource = JSON.stringify({
    submissions: approvedSubs.sort((a, b) => String(a.id).localeCompare(String(b.id))),
    marks: approvedMarks.sort((a, b) =>
      `${a.submission_id}|${a.enrollment_id}`.localeCompare(`${b.submission_id}|${b.enrollment_id}`)),
  });
  const fingerprint = createHash('sha256').update(fingerprintSource).digest('hex');

  if (existingRun?.status === 'calculating') {
    throw new Error('A calculation is currently in progress for this class and term. Please wait.');
  }

  let startingRunId: string | null = null;
  try {
    const { data: startingRun } = await sb.from('result_calculation_runs')
      .upsert({
        school_id: schoolId,
        academic_year_id: yearId,
        term_id: term.id,
        class_id: classId,
        initiated_by: initiatedBy,
        status: 'calculating',
        approved_submission_fingerprint: fingerprint,
        total_students: enrollmentIds.size,
        complete_students: 0,
        incomplete_students: 0,
        pending_submissions: pendingSubmissions,
        error: null,
        started_at: new Date().toISOString(),
        completed_at: null,
      }, { onConflict: 'school_id,academic_year_id,term_id,class_id' })
      .select('id')
      .maybeSingle();
    startingRunId = startingRun?.id ?? null;
  } catch {
    startingRunId = null;
  }

  const activeRunId = startingRunId ?? `run-${classId}-${term.id}-${Date.now()}`;

  try {
    const built = await buildClassReports(sb, {
      schoolId,
      classId,
      yearId,
      termNo,
      provisional: true,
      includePendingMarks: false,
    });

    const termRows = [...built.termResults.values()].map((result) => ({
      school_id: schoolId,
      enrollment_id: result.enrollmentId,
      term_id: built.termId,
      status: result.status,
      total_weighted: result.totalWeighted,
      total_coefficients: result.totalCoefficients,
      average: result.average,
      position: result.position,
      eligible_count: built.classStats.eligibleCount,
      incomplete_subjects: result.incompleteSubjects,
    }));
    if (termRows.length) {
      const { error } = await sb.from('student_term_results')
        .upsert(termRows, { onConflict: 'enrollment_id,term_id' });
      if (error) throw new Error(error.message);
    }

    if (termNo === 3) {
      const annualRows = [...built.annualResults.entries()]
        .filter(([, result]) => result.average !== null)
        .map(([enrollmentId, result]) => ({
          school_id: schoolId,
          enrollment_id: enrollmentId,
          annual_average: result.average,
          annual_position: result.position,
          auto_decision: result.decision,
        }));
      if (annualRows.length) {
        const { error } = await sb.from('student_annual_results')
          .upsert(annualRows, { onConflict: 'enrollment_id' });
        if (error) throw new Error(error.message);
      }
    }

    const completeStudents = [...built.termResults.values()].filter((result) => result.status === 'complete').length;
    const incompleteStudents = [...built.termResults.values()].filter((result) => result.status === 'incomplete').length;
    const status = incompleteStudents > 0 ? 'provisional' : 'calculated';

    if (startingRunId) {
      try {
        await sb.from('result_calculation_runs')
          .update({
            status,
            total_students: enrollmentIds.size,
            complete_students: completeStudents,
            incomplete_students: incompleteStudents,
            pending_submissions: pendingSubmissions,
            approved_submission_fingerprint: fingerprint,
            completed_at: new Date().toISOString(),
            error: null,
          })
          .eq('id', startingRunId);
      } catch {
        // Table might not exist or update failed
      }
    }

    // Persist calculation audit log
    try {
      await sb.from('audit_logs').insert({
        school_id: schoolId,
        actor_id: initiatedBy || null,
        action: 'CALCULATE_APPROVED_RESULTS',
        entity: 'student_term_results',
        entity_id: classId,
        new_value: {
          academic_year_id: yearId,
          term_id: built.termId,
          term_no: termNo,
          class_id: classId,
          total_students: enrollmentIds.size,
          complete_students: completeStudents,
          incomplete_students: incompleteStudents,
          pending_submissions: pendingSubmissions,
          status,
          calculated_at: new Date().toISOString(),
        },
      });
    } catch {
      // Audit log best-effort
    }

    return {
      runId: activeRunId,
      status,
      totalStudents: enrollmentIds.size,
      completeStudents,
      incompleteStudents,
      pendingSubmissions,
      cards: built.cards.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to calculate approved results.';
    if (startingRunId) {
      try {
        await sb.from('result_calculation_runs')
          .update({ status: 'failed', error: message, completed_at: new Date().toISOString() })
          .eq('id', startingRunId);
      } catch {
        // Ignore table absence
      }
    }
    throw error;
  }
}
