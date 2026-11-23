import { TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSchoolSession } from '@/lib/auth/session';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import AnalyticsCharts from './AnalyticsCharts';
import { PageHeading, SectionCard, StatCard } from '../../components/ui';
import { resolveClasses, resolveYears } from '@/lib/local-preview';
import { buildClassReports } from '@/lib/results/build-report';

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default async function AnalyticsPage({ searchParams }: {
  searchParams: Promise<{ class_id?: string; academic_year_id?: string; term?: string; subject_id?: string }>;
}) {
  const params = await searchParams;
  const session = await requireSchoolSession('school_admin');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();

  const [{ data: classRows }, { data: yearRows }, { data: subjects }, { data: settings }] = await Promise.all([
    sb.from('classes').select('id,name,stream').eq('school_id', session.schoolId).order('name'),
    sb.from('academic_years').select('id,name,is_current').eq('school_id', session.schoolId).order('name', { ascending: false }),
    sb.from('subjects').select('id,name').eq('school_id', session.schoolId).eq('is_active', true).order('name'),
        sb.from('school_settings').select('passing_average').eq('school_id', session.schoolId).maybeSingle(),
  ]);
  const classes = await resolveClasses(classRows);
  const years = await resolveYears(yearRows);

  const classId =
 params.class_id && classes?.some((c) => c.id === params.class_id) ? params.class_id : '';
  const yearId = params.academic_year_id && years?.some((y) => y.id === params.academic_year_id)
    ? params.academic_year_id : years?.find((y) => y.is_current)?.id ?? years?.[0]?.id ?? '';
  const termNo = [1, 2, 3].includes(Number(params.term)) ? Number(params.term) : 3;
  const subjectId = params.subject_id && subjects?.some((s) => s.id === params.subject_id) ? params.subject_id : '';
  const passing = Number(settings?.passing_average ?? 10);

  let termRows: any[] = [];
  let allEnrollments: any[] = [];
  if (yearId) {
    let enrollmentQuery = sb.from('student_enrollments').select('id,student_id,class_id,students!inner(id,full_name)')
      .eq('school_id', session.schoolId).eq('academic_year_id', yearId).eq('status', 'active');
    if (classId) enrollmentQuery = enrollmentQuery.eq('class_id', classId);
    const [termResult, enrollmentResult] = await Promise.all([
      sb.from('terms').select('id,term_no').eq('school_id', session.schoolId)
        .eq('academic_year_id', yearId).eq('term_no', termNo),
      enrollmentQuery,
    ]);
    termRows = termResult.data ?? [];
    allEnrollments = enrollmentResult.data ?? [];
  }

  const termIds = (termRows ?? []).map((t: any) => t.id as string);
  const enrollments = allEnrollments ?? [];
  const enrollmentIds = enrollments.map((e: any) => e.id as string);
  const studentName = new Map(enrollments.map((e: any) => [e.student_id as string, e.students?.full_name as string]));
  const enrollmentStudent = new Map(enrollments.map((e: any) => [e.id as string, e.student_id as string]));

  const loadResults = async (): Promise<any[]> => {
    if (!termIds.length || !enrollmentIds.length) return [];
    const { data } = await sb.from('student_term_results')
      .select('enrollment_id,term_id,average,status,position')
      .eq('school_id', session.schoolId).in('term_id', termIds).in('enrollment_id', enrollmentIds);
    return data ?? [];
  };
  const loadClassSubjects = async (): Promise<any[]> => {
    if (!enrollmentIds.length) return [];
    let query = sb.from('class_subjects').select('id,class_id,academic_year_id,max_mark,subject_id,subjects(name)')
      .eq('school_id', session.schoolId).eq('academic_year_id', yearId);
    if (classId) query = query.eq('class_id', classId);
    if (subjectId) query = query.eq('subject_id', subjectId);
    const { data } = await query;
    return data ?? [];
  };
  const loadSequences = async (): Promise<any[]> => {
    if (!termIds.length) return [];
    const { data } = await sb.from('sequences').select('id,seq_no,label,term_id')
      .eq('school_id', session.schoolId).in('term_id', termIds);
    return data ?? [];
  };

  const [results, classSubjects, sequenceRows] = await Promise.all([
    loadResults(),
    loadClassSubjects(),
    loadSequences(),
  ]);
  let liveResults: { enrollmentId: string; average: number; status: 'complete' | 'incomplete'; position: number | null }[] = [];
  let liveSubjectAverages: { name: string; average: number; count: number }[] = [];
  if (classId && yearId) {
    try {
      const report = await buildClassReports(sb, {
        schoolId: session.schoolId,
        classId,
        yearId,
        termNo: termNo as 1 | 2 | 3,
        provisional: true,
        includePendingMarks: false,
        includeAssets: false,
      });
      liveResults = [...report.termResults.values()]
        .filter((result) => result.average !== null)
        .map((result) => ({
          enrollmentId: result.enrollmentId,
          average: Number(result.average),
          status: result.status,
          position: result.position,
        }));
      const subjectValues = new Map<string, number[]>();
      for (const card of report.cards) {
        for (const group of card.groups) {
          for (const subject of group.subjects) {
            if (subject.term.ave === '' || subject.term.ave === 'INCOMPLETE') continue;
            const value = Number(subject.term.ave);
            if (!Number.isFinite(value)) continue;
            const values = subjectValues.get(subject.name) ?? [];
            values.push(value);
            subjectValues.set(subject.name, values);
          }
        }
      }
      liveSubjectAverages = [...subjectValues.entries()].map(([name, values]) => ({
        name,
        average: round(values.reduce((sum, value) => sum + value, 0) / values.length),
        count: values.length,
      })).sort((a, b) => b.average - a.average);
    } catch {
      liveResults = [];
      liveSubjectAverages = [];
    }
  }
  const complete = liveResults.length
    ? liveResults.map((r) => ({ ...r, term_id: termIds[0] }))
    : results.filter((r) => r.status === 'complete' && r.average !== null).map((r) => ({ ...r, average: Number(r.average) }));
  const averages = complete.map((r) => r.average);
  const passed = averages.filter((a) => a >= passing).length;
  const failed = averages.length - passed;
  const classAverage = averages.length ? round(averages.reduce((a, b) => a + b, 0) / averages.length) : 0;
  const ranked = [...complete].sort((a, b) => b.average - a.average);
  const passPercent = averages.length ? round((passed / averages.length) * 100) : 0;

  const classSubjectIds = classSubjects.map((c: any) => c.id as string);

  const sequenceIds = sequenceRows.map((s: any) => s.id as string);
  const seqNo = new Map(sequenceRows.map((s: any) => [s.id as string, s.seq_no as number]));
  const sequenceLabel = new Map(sequenceRows.map((s: any) => [s.seq_no as number, (s.label as string) || `Sequence ${s.seq_no}`]));

  let marks: any[] = [];
  if (enrollmentIds.length && classSubjectIds.length && sequenceIds.length) {
    const { data } = await sb.from('approved_marks')
      .select('enrollment_id,class_subject_id,sequence_id,value,state')
      .eq('school_id', session.schoolId).in('enrollment_id', enrollmentIds)
      .in('class_subject_id', classSubjectIds).in('sequence_id', sequenceIds);
    marks = data ?? [];
  }

  const subjectValues = new Map<string, Map<string, { sum: number; count: number }>>();
  const seqValues = new Map<number, { sum: number; count: number }>();
  const maxMark = new Map(classSubjects.map((c: any) => [c.id as string, Number(c.max_mark)]));
  for (const mark of marks) {
    if (mark.state !== 'entered' || mark.value === null) continue;
    const max = maxMark.get(mark.class_subject_id) ?? 20;
    const value = max === 20 ? Number(mark.value) : round((Number(mark.value) * 20) / max);
    let enrollmentValues = subjectValues.get(mark.class_subject_id);
    if (!enrollmentValues) {
      enrollmentValues = new Map();
      subjectValues.set(mark.class_subject_id, enrollmentValues);
    }
    const enrollmentValue = enrollmentValues.get(mark.enrollment_id) ?? { sum: 0, count: 0 };
    enrollmentValue.sum += value;
    enrollmentValue.count++;
    enrollmentValues.set(mark.enrollment_id, enrollmentValue);
    const n = seqNo.get(mark.sequence_id);
    if (n) {
      const sequenceValue = seqValues.get(n) ?? { sum: 0, count: 0 };
      sequenceValue.sum += value;
      sequenceValue.count++;
      seqValues.set(n, sequenceValue);
    }
  }

  const subjectData = liveSubjectAverages.length
    ? liveSubjectAverages
    : classSubjects.map((cs: any) => {
      const values = [...(subjectValues.get(cs.id)?.values() ?? [])]
        .map(({ sum, count }) => sum / count);
      return { name: cs.subjects?.name ?? 'Subject', average: values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : 0, count: values.length };
    }).filter((s) => s.count > 0).sort((a, b) => b.average - a.average);

  const termBuckets = new Map<number, { sum: number; count: number }>();
  for (const r of complete) {
    const term = termRows.find((t: any) => t.id === r.term_id)?.term_no as number | undefined;
    if (term) {
      const bucket = termBuckets.get(term) ?? { sum: 0, count: 0 };
      bucket.sum += r.average;
      bucket.count++;
      termBuckets.set(term, bucket);
    }
  }
  const trendData: { label: string; average: number }[] = [];
  [1, 2, 3].forEach((t) => {
    const values = termBuckets.get(t);
    if (values) trendData.push({ label: `Term ${t}`, average: round(values.sum / values.count) });
  });
  [...seqValues.entries()].sort((a, b) => a[0] - b[0]).forEach(([n, values]) => {
    trendData.push({ label: sequenceLabel.get(n) ?? `Sequence ${n}`, average: round(values.sum / values.count) });
  });

  const passFailData = [
    { name: `Passed (≥${passing}/20)`, value: passed, color: '#10b981' },
    { name: 'Failed', value: failed, color: '#ef4444' },
  ];
  const statCards = [
    { label: 'Students analysed', value: String(complete.length), icon: null, tone: 'brand' as const },
    { label: 'Class average', value: classAverage.toFixed(2), icon: TrendingUp, tone: 'info' as const },
    { label: 'Pass rate', value: `${passPercent}%`, icon: null, tone: 'success' as const },
    { label: 'Highest average', value: averages.length ? Math.max(...averages).toFixed(2) : '—', icon: null, tone: 'success' as const },
    { label: 'Lowest average', value: averages.length ? Math.min(...averages).toFixed(2) : '—', icon: null, tone: 'danger' as const },
  ];

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Insights"
        title="Academic analytics & insights"
        subtitle="Live analysis of approved results, filtered by academic year, class, term and subject."
        actions={<span className="badge badge-success">Pass rate: {passPercent}%</span>}
      />

      <form method="get" className="filter-bar">
        <div className="field min-w-[170px] flex-1"><label className="label" htmlFor="class_id">Class</label><select id="class_id" name="class_id" defaultValue={classId} className="select"><option value="">All classes</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} {c.stream}</option>)}</select></div>
        <div className="field min-w-[170px] flex-1"><label className="label" htmlFor="academic_year_id">Academic year</label><select id="academic_year_id" name="academic_year_id" defaultValue={yearId} className="select">{(years ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
        <div className="field min-w-[130px]"><label className="label" htmlFor="term">Term</label><select id="term" name="term" defaultValue={termNo} className="select"><option value="1">First</option><option value="2">Second</option><option value="3">Third</option></select></div>
        <div className="field min-w-[170px] flex-1"><label className="label" htmlFor="subject_id">Subject</label><select id="subject_id" name="subject_id" defaultValue={subjectId} className="select"><option value="">All subjects</option>{(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <button className="btn btn-primary" type="submit">Apply filters</button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {statCards.map((s) => <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon ?? undefined} tone={s.tone} />)}
      </div>

      <AnalyticsCharts subjectData={subjectData} passFailData={passFailData} trendData={trendData} />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Top performing students" subtitle="Highest final averages for this selection.">
          <ul className="divide-y divide-slate-100 px-5">
            {ranked.slice(0, 5).map((r) => (
              <li key={r.enrollment_id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-medium text-slate-700">{studentName.get(enrollmentStudent.get(r.enrollment_id) ?? '') ?? 'Student'}</span>
                <span className="badge badge-success">{r.average.toFixed(2)} / 20</span>
              </li>
            ))}
            {!ranked.length && <li className="py-4 text-sm text-slate-500">No finalized results for this selection.</li>}
          </ul>
        </SectionCard>
        <SectionCard title={`Students needing support (< ${passing}/20)`} subtitle="Prioritise these students for follow-up.">
          <ul className="divide-y divide-slate-100 px-5">
            {[...ranked].reverse().filter((r) => r.average < passing).slice(0, 5).map((r) => (
              <li key={r.enrollment_id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-medium text-slate-700">{studentName.get(enrollmentStudent.get(r.enrollment_id) ?? '') ?? 'Student'}</span>
                <span className="badge badge-danger">{r.average.toFixed(2)} / 20</span>
              </li>
            ))}
            {!averages.some((a) => a < passing) && <li className="py-4 text-sm text-slate-500">No students below the passing average.</li>}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
