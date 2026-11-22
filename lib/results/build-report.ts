import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeTerm, computeAnnual, fmt, ordinal, gradeFor, competenceRemarkForGrade, type SubjectDef, type SubjectCell, type MarkRec, type TermComputation, type AnnualOut } from './compute.ts';
import { buildSummaryRows } from '../report/summary.ts';
import type { ReportCardData, GroupBlock } from '../report/types.ts';
import { automaticDecision } from '../calculations/engine.ts';

async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = []; // Supabase returns max 1000 rows per request: page through.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? [])); if (!data || data.length < 1000) return out;
  }
}

async function toDataUri(sb: SupabaseClient, bucket: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await sb.storage.from(bucket).download(path); // user client: storage RLS keeps this school-scoped
  if (error) throw new Error(`Unable to load report image "${path}": ${error.message}`);
  if (!data) return null;
  const type = path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return `data:${type};base64,${Buffer.from(await data.arrayBuffer()).toString('base64')}`;
}

export interface BuildOptions { schoolId: string; classId: string; yearId: string; termNo: 1 | 2 | 3; enrollmentIds?: string[]; provisional?: boolean; includePendingMarks?: boolean; issueDate?: string }
export interface BuildResult {
  cards: ReportCardData[]; skipped: { enrollmentId: string; name: string; reason: string }[];
  termResults: Map<string, TermComputation['students'] extends Map<any, infer V> ? V : never>;
  annualResults: Map<string, AnnualOut>; classStats: TermComputation['stats']; termId: string;
}

export async function buildClassReports(sb: SupabaseClient, o: BuildOptions): Promise<BuildResult> {
  const [{ data: school }, { data: settings }, { data: year }, { data: cls }] = await Promise.all([
    sb.from('schools').select('name,location,motto,logo_path').eq('id', o.schoolId).single(),
    sb.from('school_settings').select('passing_average,signature_path,stamp_path').eq('school_id', o.schoolId).maybeSingle(),
    sb.from('academic_years').select('name').eq('id', o.yearId).single(),
    sb.from('classes').select('name,stream,class_teacher_id').eq('id', o.classId).single()]);
  if (!school || !year || !cls) throw new Error('School, year or class not found');
  const passing = Number(settings?.passing_average ?? 10);

  const { data: tpl } = await sb.from('report_templates').select('config').eq('school_id', o.schoolId).eq('is_default', true).maybeSingle();
  const cfg: any = tpl?.config ?? {};
  const { data: master } = cls.class_teacher_id ? await sb.from('profiles').select('full_name').eq('id', cls.class_teacher_id).single() : { data: null };

  const { data: terms, error: termsError } = await sb.from('terms')
    .select('id,term_no,annual_weight,sequences(id,seq_no,label,weight)')
    .eq('academic_year_id', o.yearId);
  if (termsError) throw new Error(`Unable to load assessment configuration. Apply the latest database migration if needed: ${termsError.message}`);
  const termId = (terms ?? []).find((t: any) => t.term_no === o.termNo)?.id as string;
  if (!termId) throw new Error(`Term ${o.termNo} is not configured for this academic year.`);
  const sequenceById = new Map<string, { termNo: number; seqNo: number; weight: number }>();
  (terms ?? []).forEach((t: any) => (t.sequences ?? []).forEach((q: any) => {
    sequenceById.set(q.id, { termNo: t.term_no, seqNo: q.seq_no, weight: Number(q.weight ?? 1) });
  }));

  const { data: cs } = await sb.from('class_subjects').select('id,coefficient,max_mark,display_order,subjects(name),subject_groups(id,name,display_order),teacher_assignments(profiles:teacher_id(full_name))').eq('class_id', o.classId).eq('academic_year_id', o.yearId);
  const subjects: SubjectDef[] = (cs ?? []).map((r: any) => ({
    classSubjectId: r.id, name: r.subjects.name, groupId: r.subject_groups?.id ?? null, groupName: r.subject_groups?.name ?? 'Others',
    groupOrder: r.subject_groups?.display_order ?? 999, coefficient: Number(r.coefficient), maxMark: Number(r.max_mark), displayOrder: r.display_order,
    teacher: r.teacher_assignments?.[0]?.profiles?.full_name ?? '' }))
    .sort((a, b) => a.groupOrder - b.groupOrder || a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));

  const { data: enr } = await sb.from('student_enrollments').select('id,students(id,full_name,admission_no,gender,date_of_birth,place_of_birth,photo_path,guardian_phone)').eq('class_id', o.classId).eq('academic_year_id', o.yearId).eq('status', 'active');
  const enrolled = (enr ?? []).map((e: any) => ({ id: e.id as string, s: e.students })).sort((a, b) => a.s.full_name.localeCompare(b.s.full_name));
  const allIds = enrolled.map((e) => e.id);

  // Marks of this class in this year, with the status of their submission. Only 'approved' counts as approved.
  const subs = await fetchAll<any>((f, t) => sb.from('mark_submissions').select('id,status,class_subject_id,sequence_id').in('class_subject_id', subjects.map((s) => s.classSubjectId)).range(f, t));
  const subMap = new Map(subs.map((s: any) => [s.id, s]));
  const rows = subs.length ? await fetchAll<any>((f, t) => sb.from('marks').select('enrollment_id,state,value,submission_id').in('submission_id', subs.map((s: any) => s.id)).range(f, t)) : [];
  const lookupMap = new Map<string, MarkRec>();
  const pendingEnrollmentIds = new Map<number, Set<string>>();
  for (const m of rows) {
    const s: any = subMap.get(m.submission_id);
    const sequence = sequenceById.get(s.sequence_id);
    if (!sequence || s.status === 'draft') continue;
    const approved = s.status === 'approved' || (o.includePendingMarks === true && s.status === 'submitted');
    if (o.includePendingMarks && s.status === 'submitted') {
      const pending = pendingEnrollmentIds.get(sequence.termNo) ?? new Set<string>();
      pending.add(m.enrollment_id);
      pendingEnrollmentIds.set(sequence.termNo, pending);
    }
    lookupMap.set(`${m.enrollment_id}|${s.class_subject_id}|${sequence.termNo}|${sequence.seqNo}`, {
      state: m.state,
      value: m.value === null ? null : Number(m.value),
      approved,
      weight: sequence.weight,
    });
  }
  const mark = (e: string, c: string, termNo: number, seqNo: number) =>
    lookupMap.get(`${e}|${c}|${termNo}|${seqNo}`);

  const terms3: TermComputation[] = [];
  const seqNosByTerm = new Map<number, number[]>();
  const labelsByTerm = new Map<number, Map<number, string>>();
  (terms ?? []).forEach((t: any) => {
    const ordered = [...(t.sequences ?? [])].sort((a: any, b: any) => a.seq_no - b.seq_no);
    seqNosByTerm.set(t.term_no, ordered.map((q: any) => q.seq_no));
    labelsByTerm.set(t.term_no, new Map(ordered.map((q: any) => [q.seq_no, q.label || `Sequence ${q.seq_no}`])));
  });
  if ((seqNosByTerm.get(o.termNo) ?? []).length === 0) {
    throw new Error(`No assessment components are configured for term ${o.termNo}. Add the assessments your school uses in Academic years.`);
  }
  if (o.termNo === 3 && [1, 2, 3].some((termNo) => !(seqNosByTerm.get(termNo)?.length))) {
    throw new Error('Annual results require at least one configured assessment component in each of the three terms.');
  }
  for (let t = 1; t <= o.termNo; t++) {
    terms3.push(computeTerm({
      subjects, enrollmentIds: allIds, termNo: t, seqNos: seqNosByTerm.get(t) ?? [],
      assessmentLabels: labelsByTerm.get(t), mark, passingAverage: passing,
      includePendingMarks: o.includePendingMarks,
    }));
  }
  const cur = terms3[o.termNo - 1];

  let annual: ReturnType<typeof computeAnnual> | null = null;
  const annualWeights = [1, 2, 3].map((termNo) => Number((terms ?? []).find((t: any) => t.term_no === termNo)?.annual_weight ?? 1));
  if (o.termNo === 3) {
    const annualAverages = new Map(allIds.map((id) => [id, [0, 1, 2].map((i) => {
      const result = terms3[i].students.get(id)!;
      return result.status === 'complete' ? result.average : null;
    }) as [number | null, number | null, number | null]]));
    const annualBases = new Map(allIds.map((id) => [id, [0, 1, 2].map((i) =>
      terms3[i].comparisonBasis.get(id) ?? '',
    ) as [string, string, string]]));
    annual = computeAnnual(annualAverages, passing, annualWeights, annualBases);
  }

  const { data: ann } = await sb.from('student_annual_results').select('enrollment_id,manual_decision').in('enrollment_id', allIds);
  const manual = new Map((ann ?? []).map((a: any) => [a.enrollment_id, a.manual_decision as ReportCardData['decision']]));
  const { data: rem } = await sb.from('term_remarks').select('enrollment_id,total_abs,suspensions,punishments,warnings,remark,class_teacher_remark,principal_remark,conduct').eq('term_id', termId).in('enrollment_id', allIds);
  const remMap = new Map((rem ?? []).map((r: any) => [r.enrollment_id, r]));
  const { data: grades } = await sb.from('grading_rules').select('min_avg,max_avg,grade').eq('school_id', o.schoolId);
  const gradeRules = (grades ?? []).map((g: any) => ({ min_avg: Number(g.min_avg), max_avg: Number(g.max_avg), grade: g.grade }))
    .sort((a, b) => a.min_avg - b.min_avg);
  const gradingScale = gradeRules.length
    ? gradeRules.map((rule) => `${rule.grade} ${fmt(rule.min_avg)}-${fmt(rule.max_avg)}`).join(' | ')
    : 'Not configured';

  const [logo, signature, stamp] = await Promise.all([toDataUri(sb, 'school-assets', school.logo_path), toDataUri(sb, 'school-assets', settings?.signature_path), toDataUri(sb, 'school-assets', settings?.stamp_path)]);

  const wanted = o.enrollmentIds ? enrolled.filter((e) => o.enrollmentIds!.includes(e.id)) : enrolled;
  const skipped: BuildResult['skipped'] = []; const eligible: typeof wanted = [];
  for (const e of wanted) {
    const termsComplete = terms3.every((computation) => computation.students.get(e.id)!.status === 'complete');
    const annualOk = o.termNo !== 3 || annual!.get(e.id)!.average !== null;
    if (termsComplete && annualOk) eligible.push(e);
    else if (o.provisional) eligible.push(e);
    else skipped.push({ enrollmentId: e.id, name: e.s.full_name, reason: !termsComplete ? 'Incomplete or unapproved marks in the selected or earlier term(s)' : 'Earlier term results not finalized' });
  }

  const ordTerm = ['1st', '2nd', '3rd'];
  const currentSeqNos = seqNosByTerm.get(o.termNo) ?? [];
  const seqLabels = currentSeqNos.map((n) => labelsByTerm.get(o.termNo)?.get(n) ?? `Sequence ${n}`);
  const termFigure = (index: number, enrollmentId: string) => {
    const computation = terms3[index];
    const result = computation.students.get(enrollmentId)!;
    const stats = computation.comparisonStats.get(enrollmentId);
    const comparableOnly = result.status === 'incomplete' || result.positionComparableCount < enrolled.length;
    const position = result.position === null
      ? result.status === 'incomplete' ? 'Provisional - insufficient comparable data' : 'Insufficient comparable data'
      : result.status === 'incomplete'
        ? `${ordinal(result.position)} (provisional; ${result.positionComparableCount} comparable)`
        : result.positionComparableCount < enrolled.length
          ? `${ordinal(result.position)} (${result.positionComparableCount} comparable)`
          : ordinal(result.position);
    return {
      ave: fmt(result.average), position, totalWeighted: fmt(result.totalWeighted),
      totalCoefficients: fmt(result.totalCoefficients), classAve: fmt(stats?.classAverage),
      best: fmt(stats?.highest), worst: fmt(stats?.lowest),
      students: stats ? String(stats.totalStudents) : '',
      studentsLabel: comparableOnly ? 'Comparable students:' : 'Students:',
      classAveLabel: comparableOnly ? 'Comparable class average:' : 'Class average:',
      bestLabel: comparableOnly ? 'Comparable best average:' : 'Best average:',
      worstLabel: comparableOnly ? 'Comparable lowest average:' : 'Lowest average:',
      passedLabel: comparableOnly ? 'Comparable pass count:' : 'Meeting pass threshold:',
      passed: stats ? String(stats.passed) : '',
    };
  };
  const out: ReportCardData[] = [];
  const groupOrder = [...new Set(subjects.map((s) => s.groupName))];

  for (const e of eligible) {
    const classRoll = enrolled.findIndex((x) => x.id === e.id) + 1;
    const r = cur.students.get(e.id)!;
    const groups: GroupBlock[] = groupOrder.map((g) => {
      const list = subjects.filter((s) => s.groupName === g);
      return { name: /result/i.test(g) ? g : `${g} Results`, groupTotal: fmt(r.groups[g].total), groupAve: fmt(r.groups[g].ave), groupPos: ordinal(r.groups[g].position),
        subjects: list.map((s) => { const c = r.subjects.find((x) => x.classSubjectId === s.classSubjectId)!;
          const grade = gradeFor(c.avg, gradeRules);
          const assessmentValue = (assessment: SubjectCell['assessments'][number]) => {
            if (assessment.status === 'pending_approval') return 'PENDING';
            if (assessment.status === 'missing') return 'MISSING';
            if (assessment.status === 'not_assessed') return 'N/A';
            if (assessment.status === 'exempted') return 'EXEMPT';
            return fmt(assessment.value);
          };
          return { name: s.name, coef: String(s.coefficient), assessments: c.assessments.map((assessment) => ({
              label: assessment.label, ave: assessmentValue(assessment), total: fmt(assessment.weighted),
            })),
            term: { ave: c.avg === null ? 'INCOMPLETE' : fmt(c.avg), total: fmt(c.weighted), pos: c.position === null ? '-' : String(c.position) },
            grade: grade || '-', competenceRemark: competenceRemarkForGrade(grade), teacher: s.teacher }; }) };
    }).filter((g) => g.subjects.length > 0);
    const an = annual?.get(e.id);
    const annualEligibleCount = annual
      ? [...annual.values()].filter((result) => result.average !== null).length
      : 0;
    const annualPosition = an?.position === null || an?.position === undefined
      ? an?.average === null ? 'Insufficient comparable data' : '-'
      : an.positionComparableCount < annualEligibleCount
        ? `${ordinal(an.position)} (${an.positionComparableCount} comparable)`
        : ordinal(an.position);
    const termsComplete = terms3.every((computation) => computation.students.get(e.id)!.status === 'complete');
    const decisionAuto = o.termNo === 3
      ? an!.decision
      : termsComplete ? automaticDecision(r.average, passing) : 'under_review';
    const rm: any = remMap.get(e.id) ?? {};
    out.push({
      school: { name: school.name, leftLines: cfg.headerLeft ?? ['REPUBLIC OF CAMEROON', '---', 'Peace \u2013 Work \u2013 Fatherland', '---', 'MINISTRY OF SECONDARY EDUCATION'],
        rightLines: cfg.headerRight ?? ['REPUBLIQUE DU CAMEROUN', '---', 'Paix \u2013 Travail \u2013 Patrie', '---', 'MINISTRY OF SECONDARY EDUCATION'], motto: school.motto ? `Motto : ${school.motto}` : undefined, logoSrc: logo },
      title: `${ordTerm[o.termNo - 1].toUpperCase()} TERM REPORT CARD`, academicYear: year.name, seqLabels, termLabel: `${ordTerm[o.termNo - 1]} Term`,
        student: { id: e.s.id, fullName: e.s.full_name, className: `${cls.name}${cls.stream ? ' ' + cls.stream : ''}`, rollNo: String(classRoll), repeater: '', dob: e.s.date_of_birth ?? '', pob: e.s.place_of_birth ?? '',
        gender: e.s.gender ?? '', admissionNo: e.s.admission_no, classMaster: master?.full_name ?? '', tel: e.s.guardian_phone ?? '', photoSrc: null },
      groups,
      summaryRows: buildSummaryRows({
        term: o.termNo,
        terms: [0, 1, 2].map((i) => (i < o.termNo ? termFigure(i, e.id) : null)) as any,
      annualAve: an?.average === null || an?.average === undefined ? 'INCOMPLETE' : fmt(an.average),
      annualPos: annualPosition, passingAverage: `${fmt(passing)} / 20`, gradingScale,
      }),
      discipline: { abs: rm.total_abs?.toString() ?? '', suspensions: rm.suspensions?.toString() ?? '', punishments: rm.punishments?.toString() ?? '', warning: rm.warnings?.toString() ?? '', remark: rm.class_teacher_remark || rm.remark || rm.conduct || '', principalRemark: rm.principal_remark || '' },
      decision: manual.get(e.id) ?? (decisionAuto as ReportCardData['decision']), stampSpace: cfg.stampSpace ?? 'blank', signatureSrc: signature, stampSrc: stamp,
      provisional: !termsComplete
        || Array.from(pendingEnrollmentIds.entries()).some(([termNo, ids]) => termNo <= o.termNo && ids.has(e.id))
        || (o.termNo === 3 && an!.average === null),
    });
  }
  // Photos: each student's own photo, fetched by that student's stored path (batches of 10).
  for (let i = 0; i < out.length; i += 10) await Promise.all(out.slice(i, i + 10).map(async (card) => {
    const src = eligible.find((x) => x.s.id === card.student.id)!; card.student.photoSrc = await toDataUri(sb, 'student-photos', src.s.photo_path); }));
  return { cards: out, skipped, termResults: cur.students as any, annualResults: annual ?? new Map(), classStats: cur.stats, termId };
}
