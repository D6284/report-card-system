import { Download, Maximize2, Printer } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSchoolSession } from '@/lib/auth/session';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { Alert, PageHeading, SectionCard } from '../../components/ui';
import { resolveClasses, resolveYears, syncLocalTeachingStructure } from '@/lib/local-preview';

export default async function ReportsPage({ searchParams }: {
  searchParams: Promise<{ class_id?: string; academic_year_id?: string; term?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await requireSchoolSession('school_admin');
  const syncError = isLocalAuthEnabled() ? await syncLocalTeachingStructure(session.schoolId) : null;
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();

  const [{ data: classRows }, { data: yearRows }] = await Promise.all([
    sb.from('classes').select('id,name,stream').eq('school_id', session.schoolId).order('name'),
        sb.from('academic_years').select('id,name,is_current').eq('school_id', session.schoolId).order('name', { ascending: false }),
  ]);
  const classes = isLocalAuthEnabled() ? classRows ?? [] : await resolveClasses(classRows);
  const years = isLocalAuthEnabled() ? yearRows ?? [] : await resolveYears(yearRows);
  const yearId = params.academic_year_id && years.some((y) => y.id === params.academic_year_id)
    ? params.academic_year_id : years.find((y) => y.is_current)?.id ?? years[0]?.id ?? '';
  const { data: enrolledClasses } = yearId
    ? await sb.from('student_enrollments').select('class_id').eq('school_id', session.schoolId)
      .eq('academic_year_id', yearId).eq('status', 'active')
    : { data: [] };
  const enrolledClassIds = new Set((enrolledClasses ?? []).map((row) => row.class_id));
  const classId = params.class_id && classes.some((c) => c.id === params.class_id)
    ? params.class_id : classes.find((c) => enrolledClassIds.has(c.id))?.id ?? classes[0]?.id ?? '';
  const defaultTerm = isLocalAuthEnabled() ? 1 : 3;
  const termNo = [1, 2, 3].includes(Number(params.term)) ? Number(params.term) : defaultTerm;
  const previewSrc = `/api/reports/preview?class_id=${encodeURIComponent(classId)}&academic_year_id=${encodeURIComponent(yearId)}&term=${termNo}`;
  const { data: enrollments } = await sb
    .from('student_enrollments')
    .select('id,students(full_name,admission_no)')
    .eq('school_id', session.schoolId)
    .eq('class_id', classId)
    .eq('academic_year_id', yearId)
    .eq('status', 'active')
    .order('id');

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Operations"
        title="Academic report cards"
        subtitle="Approved marks produce official results. Missing or incomplete marks produce clearly labelled provisional cards instead of blocking the download."
        actions={<a href={previewSrc} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><Maximize2 className="h-4 w-4" aria-hidden="true" /> Fullscreen preview</a>}
      />
      {params.error && <Alert tone="error" role="alert">{params.error}</Alert>}
      {syncError && <Alert tone="error" role="alert">Could not prepare report-card data: {syncError}</Alert>}

      <form method="get" className="filter-bar">
        <div className="field min-w-[180px] flex-1"><label className="label" htmlFor="class_id">Class</label><select id="class_id" name="class_id" defaultValue={classId} required className="select">{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} {c.stream}</option>)}</select></div>
        <div className="field min-w-[180px] flex-1"><label className="label" htmlFor="academic_year_id">Academic year</label><select id="academic_year_id" name="academic_year_id" defaultValue={yearId} required className="select">{(years ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>)}</select></div>
        <div className="field min-w-[160px]"><label className="label" htmlFor="term">Term</label><select id="term" name="term" defaultValue={termNo} className="select"><option value="1">First term</option><option value="2">Second term</option><option value="3">Third term + annual</option></select></div>
        <button className="btn btn-primary" type="submit">Preview selection</button>
      </form>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Generate report cards" subtitle="Each student occupies exactly one A4 page.">
          <form method="post" action="/api/reports" target="_blank" className="card-body space-y-4">
            <input type="hidden" name="class_id" value={classId} />
            <input type="hidden" name="academic_year_id" value={yearId} />
            <input type="hidden" name="term" value={termNo} />
            <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm">
              <p className="flex justify-between gap-3"><span className="text-slate-500">Class</span><span className="font-semibold text-slate-800">{classes?.find((c) => c.id === classId)?.name ?? '—'}</span></p>
              <p className="flex justify-between gap-3"><span className="text-slate-500">Year</span><span className="font-semibold text-slate-800">{years?.find((y) => y.id === yearId)?.name ?? '—'}</span></p>
              <p className="flex justify-between gap-3"><span className="text-slate-500">Term</span><span className="font-semibold text-slate-800">{termNo}</span></p>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 text-sm text-slate-700 transition hover:bg-slate-50">
              <input type="checkbox" name="provisional" className="checkbox mt-0.5" />
              <span>Include pending or incomplete marks as provisional (watermarked; not used for official calculations)</span>
            </label>
            <div>
              <p className="label mb-1.5">Individual students</p>
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                {(enrollments ?? []).map((e: any) => (
                  <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50">
                    <input type="checkbox" name="enrollment_id" value={e.id} className="checkbox" />
                    <span className="truncate">{e.students?.full_name ?? 'Student'} · {e.students?.admission_no ?? '—'}</span>
                  </label>
                ))}
                {!enrollments?.length && <p className="p-2 text-xs text-slate-500">No active students enrolled in this class and year.</p>}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">Leave all unchecked to generate every eligible student.</p>
            </div>
            <button disabled={!classId || !yearId || !!syncError} className="btn btn-primary btn-block" type="submit"><Download className="h-4 w-4" aria-hidden="true" /> Generate &amp; download PDF</button>
            {!classes?.length && <Alert tone="warning">Create classes and enroll students before generating reports.</Alert>}
          </form>
        </SectionCard>

        <SectionCard title="A4 preview" subtitle="Live provisional preview. Pending marks are shown for review but do not count as approved results." className="lg:col-span-2">
          <div className="card-body">
            <div className="relative h-[560px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-[700px]">
              <iframe src={previewSrc} title="Report card preview" className="h-full w-full border-0" />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Printer className="h-3.5 w-3.5" aria-hidden="true" /> Use your browser&apos;s print dialog for best results.</p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
