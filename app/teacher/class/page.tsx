import Link from 'next/link';
import { School, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireSchoolSession } from '@/lib/auth/session';
import { saveClassRemarks } from '../actions';
import { Alert, EmptyState, PageHeading, SectionCard } from '../../components/ui';
import { resolveClasses, resolveYears } from '@/lib/local-preview';

export default async function ClassTeacherPage({ searchParams }: {
  searchParams: Promise<{ class_id?: string; term?: string; academic_year_id?: string; saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await requireSchoolSession('teacher');
  const sb = await createClient();
  const termNo = [1, 2, 3].includes(Number(params.term)) ? Number(params.term) : 1;

  const [{ data: classRows }, { data: yearRows }] = await Promise.all([
    sb.from('classes').select('id,name,stream').eq('school_id', session.schoolId).eq('class_teacher_id', session.userId).order('name'),
        sb.from('academic_years').select('id,name,is_current').eq('school_id', session.schoolId).order('is_current', { ascending: false }),
  ]);
  const classes = await resolveClasses(classRows);
  const years = await resolveYears(yearRows);

  const yearId =
 params.academic_year_id || years?.find((y) => y.is_current)?.id || years?.[0]?.id;
  const { data: terms } = yearId
    ? await sb.from('terms').select('id,term_no').eq('school_id', session.schoolId).eq('academic_year_id', yearId).order('term_no')
    : { data: [] };
  const activeClassId = params.class_id && classes?.some((c) => c.id === params.class_id) ? params.class_id : classes?.[0]?.id;
  const activeTermId = terms?.find((t) => t.term_no === termNo)?.id;

  let enrollments: any[] = [];
  let remarks: any[] = [];
  if (activeClassId && yearId) {
    const { data: enr } = await sb.from('student_enrollments')
      .select('id,students(id,full_name,admission_no)')
      .eq('class_id', activeClassId).eq('academic_year_id', yearId).eq('status', 'active');
    enrollments = (enr ?? []).sort((a: any, b: any) => a.students.full_name.localeCompare(b.students.full_name));
    if (activeTermId && enrollments.length) {
      const { data: rem } = await sb.from('term_remarks').select('*')
        .eq('term_id', activeTermId).in('enrollment_id', enrollments.map((e: any) => e.id));
      remarks = rem ?? [];
    }
  }
  const remarkMap = new Map(remarks.map((r) => [r.enrollment_id, r]));
  const queryFor = (term: number, classId = activeClassId) => `/teacher/class?term=${term}${classId ? `&class_id=${classId}` : ''}${yearId ? `&academic_year_id=${yearId}` : ''}`;

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Class master"
        title="Class master dashboard"
        subtitle="Record attendance, conduct, discipline and official term remarks for your assigned class."
        actions={activeClassId ? <span className="badge badge-brand">{classes?.find((c) => c.id === activeClassId)?.name} {classes?.find((c) => c.id === activeClassId)?.stream}</span> : undefined}
      />

      {params.saved && <Alert tone="success">Remarks and discipline records saved.</Alert>}
      {params.error && <Alert tone="error" role="alert">{params.error}</Alert>}

      {!activeClassId ? (
        <EmptyState icon={School} title="No class assigned" description="No class has been assigned to you as class teacher yet." />
      ) : (
        <>
          <form method="get" className="filter-bar">
            <input type="hidden" name="term" value={termNo} />
            <div className="field min-w-[180px] flex-1"><label className="label" htmlFor="class_id">Class</label><select id="class_id" name="class_id" defaultValue={activeClassId} className="select">{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} {c.stream}</option>)}</select></div>
            <div className="field min-w-[180px] flex-1"><label className="label" htmlFor="academic_year_id">Academic year</label><select id="academic_year_id" name="academic_year_id" defaultValue={yearId} className="select">{(years ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
            <button className="btn btn-primary" type="submit">View class</button>
          </form>

          <form action={saveClassRemarks} className="stack">
            <input type="hidden" name="term_id" value={activeTermId ?? ''} />
            <SectionCard title="Student records" subtitle="Attendance, discipline and remarks for the selected term."
              actions={<button disabled={!activeTermId} className="btn btn-primary btn-sm" type="submit"><Save className="h-4 w-4" aria-hidden="true" /> Save remarks</button>}>
              <div className="card-body flex flex-wrap items-center gap-3 border-b border-slate-100 pb-4">
                <span className="section-title">Term</span>
                <div className="toolbar">
                  {[1, 2, 3].map((t) => (
                    <Link key={t} href={queryFor(t)} className={`chip ${t === termNo ? 'chip-active' : 'chip-idle'}`}>Term {t}</Link>
                  ))}
                </div>
                {!activeTermId && <span className="text-xs text-amber-600">No term configured for this year.</span>}
              </div>

              <div className="table-wrap !rounded-none !border-0 !shadow-none">
                <table className="data-table !min-w-[1000px]">
                  <thead><tr>
                    <th>Student</th><th>Admission</th><th className="text-center">Absences</th><th className="text-center">Suspensions</th>
                    <th className="text-center">Punishments</th><th className="text-center">Warnings</th>
                    <th>General remark</th><th>Class teacher remark</th><th>Conduct</th>
                  </tr></thead>
                  <tbody>
                    {enrollments.map((e: any) => {
                      const r: any = remarkMap.get(e.id) ?? {};
                      return (
                        <tr key={e.id}>
                          <td><p className="font-semibold text-slate-800"><input type="hidden" name="enrollment_id" value={e.id} />{e.students.full_name}</p></td>
                          <td className="text-xs text-slate-500">{e.students.admission_no}</td>
                          <td><input name={`abs_${e.id}`} type="number" min="0" defaultValue={r.total_abs ?? 0} className="compact-input w-16" aria-label={`Absences for ${e.students.full_name}`} /></td>
                          <td><input name={`susp_${e.id}`} type="number" min="0" defaultValue={r.suspensions ?? 0} className="compact-input w-16" aria-label={`Suspensions for ${e.students.full_name}`} /></td>
                          <td><input name={`pun_${e.id}`} type="number" min="0" defaultValue={r.punishments ?? 0} className="compact-input w-16" aria-label={`Punishments for ${e.students.full_name}`} /></td>
                          <td><input name={`warn_${e.id}`} type="number" min="0" defaultValue={r.warnings ?? 0} className="compact-input w-16" aria-label={`Warnings for ${e.students.full_name}`} /></td>
                          <td><input name={`rem_${e.id}`} defaultValue={r.remark ?? ''} className="cell-input min-w-[180px]" aria-label={`General remark for ${e.students.full_name}`} /></td>
                          <td><input name={`class_rem_${e.id}`} defaultValue={r.class_teacher_remark ?? ''} className="cell-input min-w-[180px]" aria-label={`Class teacher remark for ${e.students.full_name}`} /></td>
                          <td><input name={`conduct_${e.id}`} defaultValue={r.conduct ?? ''} className="cell-input min-w-[140px]" aria-label={`Conduct for ${e.students.full_name}`} /></td>
                        </tr>
                      );
                    })}
                    {!enrollments.length && <tr><td colSpan={9} className="py-10 text-center text-sm text-slate-500">No active students found for this class and year.</td></tr>}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </form>
        </>
      )}
    </div>
  );
}
