import Link from 'next/link';
import { CheckCircle2, Clock3, FileText, RotateCcw } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireSchoolSession } from '@/lib/auth/session';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { buildClassReports } from '@/lib/results/build-report';
import CalculateResultsForm from './CalculateResultsForm';
import { Alert, PageHeading, SectionCard, StatusBadge } from '../../components/ui';
import { resolveClasses, resolveYears } from '@/lib/local-preview';

async function fetchAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error) return [];
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export default async function ResultsManagementPage({ searchParams }: {
  searchParams: Promise<{
    class_id?: string;
    academic_year_id?: string;
    term?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await requireSchoolSession('school_admin');
  const localAuth = isLocalAuthEnabled();
  const sb = localAuth ? createAdminClient() : await createClient();

  const [{ data: classRows }, { data: yearRows }] = await Promise.all([
    sb.from('classes').select('id,name,stream').eq('school_id', session.schoolId).order('name'),
    sb.from('academic_years').select('id,name,is_current').eq('school_id', session.schoolId).order('name', { ascending: false }),
  ]);
  const classes = await resolveClasses(classRows);
  const years = await resolveYears(yearRows);
  const yearId = params.academic_year_id && years.some((year) => year.id === params.academic_year_id)
    ? params.academic_year_id
    : years.find((year) => year.is_current)?.id ?? years[0]?.id ?? '';
  const classId = params.class_id && classes.some((row) => row.id === params.class_id)
    ? params.class_id
    : classes[0]?.id ?? '';
  const termNo = [1, 2, 3].includes(Number(params.term)) ? Number(params.term) : 1;

  let totalStudents = 0;
  let approvedStudents = 0;
  let completeStudents = 0;
  let incompleteStudents = 0;
  let pendingStudents = 0;
  let status = 'Marks Entry in Progress';
  let run: any = null;

  if (classId && yearId) {
    const [{ data: enrollments }, { data: subjects }] = await Promise.all([
      sb.from('student_enrollments').select('id')
        .eq('school_id', session.schoolId).eq('class_id', classId)
        .eq('academic_year_id', yearId).eq('status', 'active'),
      sb.from('class_subjects').select('id')
        .eq('school_id', session.schoolId).eq('class_id', classId)
        .eq('academic_year_id', yearId),
    ]);
    totalStudents = (enrollments ?? []).length;
    const subjectIds = (subjects ?? []).map((row: any) => row.id as string);

    if (subjectIds.length) {
      const submissions = await fetchAll<any>((from, to) =>
        sb.from('mark_submissions')
          .select('id,status,class_subject_id')
          .eq('school_id', session.schoolId)
          .in('class_subject_id', subjectIds)
          .range(from, to));
      const pendingIds = submissions.filter((row) => row.status === 'submitted').map((row) => row.id as string);
      if (pendingIds.length) {
        const pendingMarks = await fetchAll<any>((from, to) =>
          sb.from('marks').select('enrollment_id').in('submission_id', pendingIds).range(from, to));
        pendingStudents = new Set(pendingMarks.map((row) => row.enrollment_id as string)).size;
      }

      try {
        const built = await buildClassReports(sb, {
          schoolId: session.schoolId,
          classId,
          yearId,
          termNo: termNo as 1 | 2 | 3,
          provisional: true,
          includePendingMarks: false,
          includeAssets: false,
        });
        const results = [...built.termResults.values()];
        completeStudents = results.filter((result) => result.status === 'complete').length;
        incompleteStudents = results.filter((result) => result.status === 'incomplete').length;
        approvedStudents = results.filter((result) =>
          result.status === 'complete' || result.average !== null).length;
      } catch {
        approvedStudents = 0;
        completeStudents = 0;
        incompleteStudents = totalStudents;
      }
    }

    const { data: terms } = await sb.from('terms')
      .select('id')
      .eq('school_id', session.schoolId)
      .eq('academic_year_id', yearId)
      .eq('term_no', termNo)
      .limit(1);
    const termId = terms?.[0]?.id;
    if (termId) {
      const { data: runRow } = await sb.from('result_calculation_runs')
        .select('id,status,total_students,complete_students,incomplete_students,pending_submissions,started_at,completed_at,error')
        .eq('school_id', session.schoolId)
        .eq('academic_year_id', yearId)
        .eq('term_id', termId)
        .eq('class_id', classId)
        .maybeSingle();
      run = runRow;
    }

    const startedAt = run?.started_at ? Date.parse(run.started_at) : NaN;
    const staleRun = run?.status === 'calculating'
      && (!Number.isFinite(startedAt) || Date.now() - startedAt > 2 * 60 * 1000);
    if (run?.status === 'recalculation_required') status = 'Recalculation Required';
    else if (staleRun) status = 'Calculation Interrupted';
    else if (run?.status === 'calculating') status = 'Calculating';
    else if (run?.status === 'failed') status = 'Calculation Failed';
    else if (run?.status === 'provisional') status = 'Provisional Results';
    else if (run?.status === 'calculated') status = 'Calculated';
    else if (pendingStudents > 0) status = 'Awaiting Approval';
    else if (completeStudents > 0 && completeStudents === totalStudents) status = 'Approved and Ready for Calculation';
    else if (approvedStudents > 0) status = 'Approved and Ready for Calculation';
  }

  const selectedClass = classes.find((row) => row.id === classId);
  const selectedYear = years.find((row) => row.id === yearId);
  const confirmation = `Are you sure you want to calculate the approved results for this class and term?\n\nClass: ${selectedClass ? `${selectedClass.name}${selectedClass.stream ? ` ${selectedClass.stream}` : ''}` : 'Not selected'}\nAcademic year: ${selectedYear?.name ?? 'Not selected'}\nTerm: ${termNo}\nTotal students: ${totalStudents}\nApproved marks: ${approvedStudents}\nIncomplete marks: ${incompleteStudents}\nPending approval: ${pendingStudents}`;
  const previewUrl = `/api/reports/preview?class_id=${encodeURIComponent(classId)}&academic_year_id=${encodeURIComponent(yearId)}&term=${termNo}`;
  const reportsUrl = `/admin/reports?class_id=${encodeURIComponent(classId)}&academic_year_id=${encodeURIComponent(yearId)}&term=${termNo}`;

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Operations"
        title="Results Management"
        subtitle="Review approval readiness, calculate approved marks in bulk, and open calculated report cards."
        actions={<Link href={reportsUrl} className="btn btn-secondary btn-sm"><FileText className="h-4 w-4" /> Report Cards</Link>}
      />
      {params.success && <Alert tone="success" role="status">{params.success}</Alert>}
      {params.error && <Alert tone="error" role="alert">{params.error}</Alert>}

      <form method="get" className="filter-bar">
        <div className="field min-w-[180px] flex-1">
          <label className="label" htmlFor="class_id">Class</label>
          <select id="class_id" name="class_id" defaultValue={classId} required className="select">
            {classes.map((row) => <option key={row.id} value={row.id}>{row.name}{row.stream ? ` ${row.stream}` : ''}</option>)}
          </select>
        </div>
        <div className="field min-w-[180px] flex-1">
          <label className="label" htmlFor="academic_year_id">Academic year</label>
          <select id="academic_year_id" name="academic_year_id" defaultValue={yearId} required className="select">
            {years.map((row) => <option key={row.id} value={row.id}>{row.name}{row.is_current ? ' (Current)' : ''}</option>)}
          </select>
        </div>
        <div className="field min-w-[160px]">
          <label className="label" htmlFor="term">Term</label>
          <select id="term" name="term" defaultValue={termNo} className="select">
            <option value="1">First term</option>
            <option value="2">Second term</option>
            <option value="3">Third term + annual</option>
          </select>
        </div>
        <button className="btn btn-primary" type="submit">Load Results</button>
      </form>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Calculation status" subtitle={`${selectedClass?.name ?? 'No class'} · ${selectedYear?.name ?? 'No academic year'} · Term ${termNo}`} className="lg:col-span-2">
          <div className="card-body space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              {status === 'Calculated' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                : status === 'Calculating' ? <RotateCcw className="h-5 w-5 animate-spin text-indigo-600" />
                  : <Clock3 className="h-5 w-5 text-amber-600" />}
              <StatusBadge status={status === 'Calculated' ? 'approved' : status === 'Recalculation Required' ? 'reopened' : 'submitted'} />
              <span className="font-semibold text-slate-800">{status}</span>
            </div>
            {run?.error && <Alert tone="error" role="alert">{run.error}</Alert>}
            {status === 'Calculation Interrupted' && <Alert tone="warning" role="status">The previous calculation did not finish. Click Calculate Approved Results to retry.</Alert>}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ['Total students', totalStudents],
                ['Approved marks', approvedStudents],
                ['Incomplete', incompleteStudents],
                ['Pending approval', pendingStudents],
                ['Complete', completeStudents],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Bulk calculation" subtitle="Only approved marks are included.">
          <CalculateResultsForm
            classId={classId}
            yearId={yearId}
            termNo={termNo}
            message={confirmation}
            disabled={!classId || !yearId || totalStudents === 0}
          />
          {run?.status === 'calculated' && (
            <p className="text-xs text-emerald-700">Last calculation completed successfully.</p>
          )}
          {run?.status === 'recalculation_required' && (
            <p className="text-xs text-amber-700">Approved marks changed after the last calculation.</p>
          )}
        </SectionCard>

        {run && (
          <SectionCard title="Calculation results" subtitle={`Term ${termNo} · ${run.status.replaceAll('_', ' ')}`} className="lg:col-span-2">
            <div className="card-body space-y-3">
              {run.error && <Alert tone="error" role="alert">{run.error}</Alert>}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ['Status', run.status.replaceAll('_', ' ')],
                  ['Students processed', run.total_students ?? totalStudents],
                  ['Calculated', run.complete_students ?? completeStudents],
                  ['Incomplete', run.incomplete_students ?? incompleteStudents],
                  ['Pending submissions', run.pending_submissions ?? pendingStudents],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
              {run.started_at && run.completed_at && (
                <p className="text-xs text-slate-500">
                  Started {new Date(run.started_at).toLocaleString()} &middot; Completed {new Date(run.completed_at).toLocaleString()}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/analytics?class_id=${encodeURIComponent(classId)}&academic_year_id=${encodeURIComponent(yearId)}&term=${termNo}`} className="btn btn-secondary btn-sm">View averages and positions</Link>
                {(run.status === 'calculated' || run.status === 'provisional') && (
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">Preview report cards</a>
                )}
              </div>
            </div>
          </SectionCard>
        )}

        </div>

        <SectionCard title="Calculated result actions" subtitle="Open calculated data or generate report cards.">
          <div className="card-body flex flex-wrap gap-3">
            <Link href={`/admin/analytics?class_id=${encodeURIComponent(classId)}&academic_year_id=${encodeURIComponent(yearId)}&term=${termNo}`} className="btn btn-secondary">View Calculated Results</Link>
            <Link href={reportsUrl} className="btn btn-secondary">Generate Report Cards</Link>
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Preview Report Cards</a>
            <form action="/api/reports" method="post" target="_blank" rel="noopener noreferrer" className="inline">
              <input type="hidden" name="class_id" value={classId} />
              <input type="hidden" name="academic_year_id" value={yearId} />
              <input type="hidden" name="term" value={String(termNo)} />
              <button type="submit" disabled={!classId || !yearId} className="btn btn-secondary">Download Report Cards</button>
            </form>
            <Link href="/admin/approvals?status=approved" className="btn btn-secondary">Approved Submissions</Link>
          </div>
        </SectionCard>
    </div>
  );
}
