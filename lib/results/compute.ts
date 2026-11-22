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
export type MarkLookup = (enrollmentId: string, classSubjectId: string, termNo: number, seqNo: number) => MarkRec | undefined;

export interface SubjectCell {
  classSubjectId: string;
  assessments: { label: string; value: number | null; weighted: number | null; status: MarkState | 'pending_approval' }[];
  avg: number | null; weighted: number | null;
  position: number | null; status: SubjectResult['status']; reason?: SubjectResult['reason'];
}
export interface GroupCell { groupName: string; total: number | null; ave: number | null; position: number | null }
export interface StudentTerm {
  enrollmentId: string; status: 'complete' | 'incomplete'; average: number | null; totalWeighted: number | null;
  totalCoefficients: number; position: number | null; positionComparableCount: number; incompleteSubjects: string[];
  subjects: SubjectCell[]; groups: Record<string, GroupCell>;
}
export interface TermComputation {
  students: Map<string, StudentTerm>;
  stats: ClassStats;
  comparisonStats: Map<string, ClassStats | null>;
  comparisonBasis: Map<string, string>;
}

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
/** Express a mark on the /20 scale used by averages (no-op for subjects marked out of 20). */
export const normalise = (v: number, max: number) => (max === 20 ? v : round2((v * 20) / max));

function componentBasis(mark: SubjectInput['sequences'][number]): string {
  if (mark.state === 'entered' && mark.value !== null) return mark.approved ? 'approved' : 'pending';
  return mark.state === 'not_assessed' ? 'not_assessed' : mark.state === 'exempted' ? 'exempted' : 'missing';
}

function rankComparable(entries: { studentId: string; average: number | null; basis: string }[], passingAverage: number) {
  const grouped = new Map<string, { studentId: string; average: number }[]>();
  for (const entry of entries) {
    if (entry.average === null) continue;
    const group = grouped.get(entry.basis) ?? [];
    group.push({ studentId: entry.studentId, average: entry.average });
    grouped.set(entry.basis, group);
  }
  const positions = new Map<string, number | null>();
  const counts = new Map<string, number>();
  const stats = new Map<string, ClassStats | null>();
  for (const group of grouped.values()) {
    const ranks = group.length < 2
      ? group.map((entry) => ({ studentId: entry.studentId, position: null }))
      : rankStudents(group);
    const positionByStudent = new Map(ranks.map((rank) => [rank.studentId, rank.position]));
    const groupStats = group.length < 2 ? null : classStatistics(group.map((entry) => entry.average), passingAverage);
    for (const entry of group) {
      positions.set(entry.studentId, positionByStudent.get(entry.studentId) ?? null);
      counts.set(entry.studentId, group.length);
      stats.set(entry.studentId, groupStats);
    }
  }
  return { positions, counts, stats };
}

export function computeTerm(input: {
  subjects: SubjectDef[];
  enrollmentIds: string[];
  termNo: number;
  seqNos: number[];
  assessmentLabels?: Map<number, string>;
  mark: MarkLookup;
  passingAverage: number;
  includePendingMarks?: boolean;
}): TermComputation {
  const { subjects, enrollmentIds, termNo, seqNos, assessmentLabels, mark, passingAverage, includePendingMarks } = input;
  const groupNames = [...new Set(subjects.map((s) => s.groupName))];
  const groupIndexes = new Map(groupNames.map((name) => [
    name,
    subjects.map((subject, index) => subject.groupName === name ? index : -1).filter((index) => index >= 0),
  ]));
  const perStudent = new Map<string, {
    term: ReturnType<typeof studentTermResult>;
    inputs: SubjectInput[];
    basis: string;
    subjectBases: string[];
    groupBases: Map<string, string>;
  }>();

  for (const eid of enrollmentIds) {
    const inputs: SubjectInput[] = subjects.map((s) => ({
      subjectId: s.classSubjectId, coefficient: s.coefficient,
      sequences: seqNos.map((n) => {
        const m = mark(eid, s.classSubjectId, termNo, n);
        if (!m) return { state: 'missing' as MarkState, value: null, approved: false };
        return { state: m.state, value: m.value === null ? null : normalise(m.value, s.maxMark), approved: m.approved, weight: m.weight ?? 1 };
      }),
    }));
    const subjectBases = inputs.map((subject) => JSON.stringify(subject.sequences.map(componentBasis)));
    const groupBases = new Map(groupNames.map((name) => [
      name,
      JSON.stringify((groupIndexes.get(name) ?? []).map((index) => [subjects[index].classSubjectId, subjectBases[index]])),
    ]));
    perStudent.set(eid, {
      term: studentTermResult(inputs, { includePendingMarks }),
      inputs,
      basis: JSON.stringify(inputs.map((subject, index) => [subject.subjectId, subjectBases[index]])),
      subjectBases,
      groupBases,
    });
  }

  // Students are ranked only against records with the same available subject components.
  const subjPos = new Map<string, Map<string, number | null>>();
  subjects.forEach((s, idx) => {
    const ranked = rankComparable(enrollmentIds.map((eid) => ({
      studentId: eid,
      average: perStudent.get(eid)!.term.subjects[idx].average,
      basis: perStudent.get(eid)!.subjectBases[idx],
    })), passingAverage);
    subjPos.set(s.classSubjectId, ranked.positions);
  });

  // Group totals, averages and positions.
  const groupAve = new Map<string, Map<string, number | null>>();
  const groupTot = new Map<string, Map<string, number | null>>();
  for (const g of groupNames) {
    const idxs = groupIndexes.get(g) ?? [];
    const ave = new Map<string, number | null>(); const tot = new Map<string, number | null>();
    for (const eid of enrollmentIds) {
      const res = perStudent.get(eid)!.term.subjects;
      const available = idxs.filter((i) => res[i].average !== null);
      if (available.length === 0) { ave.set(eid, null); tot.set(eid, null); continue; }
      const t = available.reduce((a, i) => a + (res[i].weighted as number), 0);
      const c = available.reduce((a, i) => a + subjects[i].coefficient, 0);
      tot.set(eid, round2(t)); ave.set(eid, round2(t / c));
    }
    groupAve.set(g, ave); groupTot.set(g, tot);
  }
  const groupPos = new Map<string, Map<string, number | null>>();
  for (const g of groupNames) {
    const ranked = rankComparable(enrollmentIds.map((eid) => ({
      studentId: eid,
      average: groupAve.get(g)!.get(eid) ?? null,
      basis: perStudent.get(eid)!.groupBases.get(g) ?? '',
    })), passingAverage);
    groupPos.set(g, ranked.positions);
  }

  const termRanks = rankComparable(enrollmentIds.map((eid) => ({
    studentId: eid,
    average: perStudent.get(eid)!.term.average,
    basis: perStudent.get(eid)!.basis,
  })), passingAverage);

  const students = new Map<string, StudentTerm>();
  for (const eid of enrollmentIds) {
    const { term, inputs } = perStudent.get(eid)!;
    students.set(eid, {
      enrollmentId: eid, status: term.status, average: term.average, totalWeighted: term.totalWeighted,
      totalCoefficients: term.totalCoefficients,
      position: termRanks.positions.get(eid) ?? null,
      positionComparableCount: termRanks.counts.get(eid) ?? 0,
      incompleteSubjects: term.incompleteSubjects,
      subjects: subjects.map((s, i) => ({
        classSubjectId: s.classSubjectId,
        assessments: inputs[i].sequences.map((assessment, j) => ({
          label: assessmentLabels?.get(seqNos[j]) ?? `Assessment ${j + 1}`,
          value: assessment.value,
          weighted: assessment.value === null ? null : round2(assessment.value * s.coefficient),
          status: assessment.state === 'entered' && assessment.value !== null && !assessment.approved
            ? 'pending_approval'
            : assessment.state === 'entered' && assessment.value === null ? 'missing' : assessment.state,
        })),
        avg: term.subjects[i].average, weighted: term.subjects[i].weighted, position: subjPos.get(s.classSubjectId)!.get(eid) ?? null,
        status: term.subjects[i].status, reason: term.subjects[i].reason,
      })),
      groups: Object.fromEntries(groupNames.map((g) => [g, { groupName: g, total: groupTot.get(g)!.get(eid) ?? null, ave: groupAve.get(g)!.get(eid) ?? null, position: groupPos.get(g)!.get(eid) ?? null }])),
    });
  }
  const stats = classStatistics(enrollmentIds.map((e) => {
    const result = students.get(e)!;
    return result.status === 'complete' ? result.average : null;
  }), passingAverage);
  return {
    students,
    stats,
    comparisonStats: termRanks.stats,
    comparisonBasis: new Map([...perStudent].map(([id, result]) => [id, result.basis])),
  };
}

export interface AnnualOut {
  average: number | null;
  position: number | null;
  positionComparableCount: number;
  decision: 'passed' | 'failed' | 'under_review';
}
/** Annual ranks require all three finalized term averages and matching comparison bases. */
export function computeAnnual(
  termAverages: Map<string, [number | null, number | null, number | null]>,
  passingAverage: number,
  termWeights: number[] = [],
  comparisonBases?: Map<string, [string, string, string]>,
): Map<string, AnnualOut> {
  const avgs = new Map([...termAverages].map(([id, t]) => [id, annualAverage(t, 3, termWeights)] as const));
  const ranks = rankComparable([...avgs].map(([studentId, average]) => ({
    studentId,
    average,
    basis: JSON.stringify(comparisonBases?.get(studentId) ?? []),
  })), passingAverage);
  return new Map([...avgs].map(([id, average]) => [id, {
    average,
    position: ranks.positions.get(id) ?? null,
    positionComparableCount: ranks.counts.get(id) ?? 0,
    decision: automaticDecision(average, passingAverage),
  }]));
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
