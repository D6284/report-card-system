/**
 * Pure results computation for one class and one term. No database or UI code.
 * Uses the calculation engine for every average, so rounding rules live in one place.
 */
import {
  studentTermResult, rankStudents, classStatistics, annualAverage, automaticDecision,
  type MarkState, type SubjectInput, type SubjectResult, type ClassStats,
} from '../calculations/engine.ts';

export interface SubjectDef {
  classSubjectId: string; name: string; groupId: string | null; groupName: string; groupOrder: number;
  coefficient: number; maxMark: number; displayOrder: number; teacher: string;
}
export interface MarkRec { state: MarkState; value: number | null; approved: boolean; weight?: number }
export type MarkLookup = (enrollmentId: string, classSubjectId: string, seqNo: number) => MarkRec | undefined;

export interface SubjectCell {
  classSubjectId: string; assessments: { label: string; value: number | null; weighted: number | null }[]; avg: number | null; weighted: number | null;
  position: number | null; status: SubjectResult['status']; reason?: SubjectResult['reason'];
}
export interface GroupCell { groupName: string; total: number | null; ave: number | null; position: number | null }
export interface StudentTerm {
  enrollmentId: string; status: 'complete' | 'incomplete'; average: number | null; totalWeighted: number | null;
  totalCoefficients: number; position: number | null; incompleteSubjects: string[];
  subjects: SubjectCell[]; groups: Record<string, GroupCell>;
}
export interface TermComputation { students: Map<string, StudentTerm>; stats: ClassStats }

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
/** Express a mark on the /20 scale used by averages (no-op for subjects marked out of 20). */
export const normalise = (v: number, max: number) => (max === 20 ? v : round2((v * 20) / max));

export function computeTerm(input: { subjects: SubjectDef[]; enrollmentIds: string[]; seqNos: number[]; assessmentLabels?: Map<number, string>; mark: MarkLookup; passingAverage: number }): TermComputation {
  const { subjects, enrollmentIds, seqNos, assessmentLabels, mark, passingAverage } = input;
  const perStudent = new Map<string, { term: ReturnType<typeof studentTermResult>; inputs: SubjectInput[] }>();

  for (const eid of enrollmentIds) {
    const inputs: SubjectInput[] = subjects.map((s) => ({
      subjectId: s.classSubjectId, coefficient: s.coefficient,
      sequences: seqNos.map((n) => {
        const m = mark(eid, s.classSubjectId, n);
        if (!m) return { state: 'missing' as MarkState, value: null, approved: false };
        return { state: m.state, value: m.value === null ? null : normalise(m.value, s.maxMark), approved: m.approved, weight: m.weight ?? 1 };
      }),
    }));
    perStudent.set(eid, { term: studentTermResult(inputs), inputs });
  }

  // Subject positions: rank students per subject among those with a counted average.
  const subjPos = new Map<string, Map<string, number | null>>();
  subjects.forEach((s, idx) => {
    const ranks = rankStudents(enrollmentIds.map((eid) => ({ studentId: eid, average: perStudent.get(eid)!.term.subjects[idx].average })));
    subjPos.set(s.classSubjectId, new Map(ranks.map((r) => [r.studentId, r.position])));
  });

  // Group totals, averages and positions.
  const groupNames = [...new Set(subjects.map((s) => s.groupName))];
  const groupAve = new Map<string, Map<string, number | null>>();
  const groupTot = new Map<string, Map<string, number | null>>();
  for (const g of groupNames) {
    const idxs = subjects.map((s, i) => (s.groupName === g ? i : -1)).filter((i) => i >= 0);
    const ave = new Map<string, number | null>(); const tot = new Map<string, number | null>();
    for (const eid of enrollmentIds) {
      const res = perStudent.get(eid)!.term.subjects;
      const counted = idxs.filter((i) => res[i].status === 'counted');
      const anyIncomplete = idxs.some((i) => res[i].status === 'incomplete');
      if (anyIncomplete || counted.length === 0) { ave.set(eid, null); tot.set(eid, null); continue; }
      const t = counted.reduce((a, i) => a + (res[i].weighted as number), 0);
      const c = counted.reduce((a, i) => a + subjects[i].coefficient, 0);
      tot.set(eid, round2(t)); ave.set(eid, round2(t / c));
    }
    groupAve.set(g, ave); groupTot.set(g, tot);
  }
  const groupPos = new Map<string, Map<string, number | null>>();
  for (const g of groupNames) {
    const ranks = rankStudents(enrollmentIds.map((eid) => ({ studentId: eid, average: groupAve.get(g)!.get(eid) ?? null })));
    groupPos.set(g, new Map(ranks.map((r) => [r.studentId, r.position])));
  }

  const termRanks = rankStudents(enrollmentIds.map((eid) => ({ studentId: eid, average: perStudent.get(eid)!.term.average })));
  const posOf = new Map(termRanks.map((r) => [r.studentId, r.position]));

  const students = new Map<string, StudentTerm>();
  for (const eid of enrollmentIds) {
    const { term, inputs } = perStudent.get(eid)!;
    students.set(eid, {
      enrollmentId: eid, status: term.status, average: term.average, totalWeighted: term.totalWeighted,
      totalCoefficients: term.totalCoefficients, position: posOf.get(eid) ?? null, incompleteSubjects: term.incompleteSubjects,
      subjects: subjects.map((s, i) => ({
        classSubjectId: s.classSubjectId,
        assessments: inputs[i].sequences.map((assessment, j) => ({
          label: assessmentLabels?.get(seqNos[j]) ?? `Assessment ${j + 1}`,
          value: assessment.value,
          weighted: assessment.value === null ? null : round2(assessment.value * s.coefficient),
        })),
        avg: term.subjects[i].average, weighted: term.subjects[i].weighted, position: subjPos.get(s.classSubjectId)!.get(eid) ?? null,
        status: term.subjects[i].status, reason: term.subjects[i].reason,
      })),
      groups: Object.fromEntries(groupNames.map((g) => [g, { groupName: g, total: groupTot.get(g)!.get(eid) ?? null, ave: groupAve.get(g)!.get(eid) ?? null, position: groupPos.get(g)!.get(eid) ?? null }])),
    });
  }
  const stats = classStatistics(enrollmentIds.map((e) => students.get(e)!.average), passingAverage);
  return { students, stats };
}

export interface AnnualOut { average: number | null; position: number | null; decision: 'passed' | 'failed' | 'under_review' }
/** Annual average and ranking; only students with all three finalized term averages are ranked. */
export function computeAnnual(termAverages: Map<string, [number | null, number | null, number | null]>, passingAverage: number, termWeights: number[] = []): Map<string, AnnualOut> {
  const avgs = new Map([...termAverages].map(([id, t]) => [id, annualAverage(t, 3, termWeights)] as const));
  const ranks = rankStudents([...avgs].map(([studentId, average]) => ({ studentId, average })));
  const pos = new Map(ranks.map((r) => [r.studentId, r.position]));
  return new Map([...avgs].map(([id, a]) => [id, { average: a, position: pos.get(id) ?? null, decision: automaticDecision(a, passingAverage) }]));
}

export const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toFixed(2));
export function ordinal(n: number | null): string {
  if (n === null) return '';
  const v = n % 100; if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}
export function gradeFor(avg: number | null, rules: { min_avg: number; max_avg: number; grade: string }[]): string {
  if (avg === null) return '';
  return rules.find((r) => avg >= r.min_avg && avg <= r.max_avg)?.grade ?? '';
}

export function competenceRemarkForGrade(grade: string): string {
  const letter = grade.trim().toUpperCase().charAt(0);
  if (letter === 'A') return 'Competence fully acquired';
  if (letter === 'B') return 'Competence fairly acquired';
  if (letter === 'C') return 'Competence acquired';
  return grade ? 'Competence not acquired' : '';
}
