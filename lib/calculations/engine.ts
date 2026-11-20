/**
 * Academic calculation engine. Pure functions, no UI or database code.
 * All arithmetic uses integers (marks and coefficients in hundredths) so
 * results are exact; averages are rounded half-up to 2 decimals only at the end.
 */

export type MarkState = 'entered' | 'missing' | 'not_assessed' | 'exempted';

/** One sequence mark for one subject. Only approved marks may be passed as approved=true. */
export interface SequenceMark {
  state: MarkState;
  value: number | null;
  approved: boolean;
  weight?: number;
}

export interface SubjectInput {
  subjectId: string;
  coefficient: number;
  maxMark?: number;            // default 20
  sequences: SequenceMark[];   // configured assessment components for the term
}

export type SubjectStatus = 'counted' | 'excluded' | 'incomplete';

export interface SubjectResult {
  subjectId: string;
  status: SubjectStatus;
  reason?: 'missing' | 'pending_approval' | 'exempted' | 'not_assessed';
  average: number | null;       // /20 style, 2 dp
  weighted: number | null;      // average x coefficient, 2 dp
  coefficient: number;
}

export interface TermResult {
  status: 'complete' | 'incomplete';
  subjects: SubjectResult[];
  totalWeighted: number | null;
  totalCoefficients: number;
  average: number | null;
  incompleteSubjects: string[];
}

const toHundredths = (n: number): number => Math.round(n * 100);
const fromHundredths = (n: number): number => n / 100;
/** Round-half-up integer division for non-negative integers. */
const divRound = (num: number, den: number): number => Math.floor((2 * num + den) / (2 * den));

export function validateMark(value: number, max = 20): { ok: true } | { ok: false; error: string } {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, error: 'Mark must be a number' };
  if (value < 0) return { ok: false, error: 'Mark cannot be negative' };
  if (value > max) return { ok: false, error: `Mark cannot exceed ${max}` };
  return { ok: true };
}

/** Weighted subject average for the term; missing/unapproved components are never zero. */
export function subjectTermResult(input: SubjectInput): SubjectResult {
  const { subjectId, coefficient, sequences } = input;
  const base = { subjectId, coefficient, average: null, weighted: null };

  if (sequences.every((s) => s.state === 'exempted'))
    return { ...base, status: 'excluded', reason: 'exempted' };
  if (sequences.every((s) => s.state === 'not_assessed'))
    return { ...base, status: 'excluded', reason: 'not_assessed' };

  for (const s of sequences) {
    if (s.state === 'entered' && s.value !== null && !s.approved)
      return { ...base, status: 'incomplete', reason: 'pending_approval' };
    if (s.state !== 'entered' || s.value === null)
      return { ...base, status: 'incomplete', reason: 'missing' };
  }

  const totalWeightH = sequences.reduce((acc, s) => acc + toHundredths(s.weight ?? 1), 0);
  const weightedMarksH = sequences.reduce((acc, s) => acc + toHundredths(s.value as number) * toHundredths(s.weight ?? 1), 0);
  const avgH = divRound(weightedMarksH, totalWeightH);
  const weightedH = divRound(avgH * toHundredths(coefficient), 100);
  return { ...base, status: 'counted', average: fromHundredths(avgH), weighted: fromHundredths(weightedH) };
}

/** Weighted term average = SUM(avg x coeff) / SUM(coeff). Excluded subjects do not count. */
export function studentTermResult(subjects: SubjectInput[]): TermResult {
  const results = subjects.map(subjectTermResult);
  const incompleteSubjects = results.filter((r) => r.status === 'incomplete').map((r) => r.subjectId);
  const counted = subjects.filter((_, i) => results[i].status === 'counted');

  const totalCoefH = counted.reduce((a, s) => a + toHundredths(s.coefficient), 0);
  const totalCoefficients = fromHundredths(totalCoefH);

  if (incompleteSubjects.length > 0 || counted.length === 0 || totalCoefH === 0) {
    return { status: 'incomplete', subjects: results, totalWeighted: null, totalCoefficients, average: null, incompleteSubjects };
  }

  // The subject assessment weights determine each subject average; coefficients
  // then determine the student's overall weighted average.
  let num = 0;
  let totalWeightedH = 0;
  counted.forEach((s) => {
    const seqWeightH = s.sequences.reduce((a, q) => a + toHundredths(q.weight ?? 1), 0);
    const marksH = s.sequences.reduce((a, q) => a + toHundredths(q.value as number) * toHundredths(q.weight ?? 1), 0);
    const subjectAverageH = divRound(marksH, seqWeightH);
    const subjectWeightedH = divRound(subjectAverageH * toHundredths(s.coefficient), 100);
    num += subjectAverageH * toHundredths(s.coefficient);
    totalWeightedH += subjectWeightedH;
  });
  const avgH = divRound(num, totalCoefH);
  return {
    status: 'complete', subjects: results,
    totalWeighted: fromHundredths(totalWeightedH), totalCoefficients,
    average: fromHundredths(avgH), incompleteSubjects,
  };
}

/** Annual average: only when every required term average is finalized. */
export function annualAverage(termAverages: (number | null)[], requiredTerms = 3, termWeights: number[] = []): number | null {
  if (termAverages.length < requiredTerms || termAverages.slice(0, requiredTerms).some((t) => t === null)) return null;
  const weights = Array.from({ length: requiredTerms }, (_, i) => toHundredths(termWeights[i] ?? 1));
  const totalWeightH = weights.reduce((sum, weight) => sum + weight, 0);
  const weightedTermsH = termAverages.slice(0, requiredTerms)
    .reduce<number>((sum, value, i) => sum + toHundredths(value as number) * weights[i], 0);
  return fromHundredths(divRound(weightedTermsH, totalWeightH));
}

export interface RankInput { studentId: string; average: number | null }
export interface RankOutput { studentId: string; position: number | null; eligible: boolean }

/** Competition ranking (1,1,3,4). Students without a complete average are not ranked. */
export function rankStudents(entries: RankInput[]): RankOutput[] {
  const eligible = entries
    .filter((e) => e.average !== null)
    .map((e) => ({ id: e.studentId, h: toHundredths(e.average as number) }))
    .sort((a, b) => b.h - a.h);
  const pos = new Map<string, number>();
  eligible.forEach((e, i) => pos.set(e.id, i > 0 && eligible[i - 1].h === e.h ? (pos.get(eligible[i - 1].id) as number) : i + 1));
  return entries.map((e) => ({ studentId: e.studentId, position: pos.get(e.studentId) ?? null, eligible: pos.has(e.studentId) }));
}

export interface ClassStats {
  eligibleCount: number; totalStudents: number; excludedCount: number;
  classAverage: number | null; highest: number | null; lowest: number | null;
  passed: number; failed: number; passPercent: number | null; failPercent: number | null;
}

/** Class statistics from eligible (complete, approved) student averages only. */
export function classStatistics(averages: (number | null)[], passingAverage = 10): ClassStats {
  const hs = averages.filter((a): a is number => a !== null).map(toHundredths);
  const total = averages.length;
  if (hs.length === 0)
    return { eligibleCount: 0, totalStudents: total, excludedCount: total, classAverage: null, highest: null, lowest: null, passed: 0, failed: 0, passPercent: null, failPercent: null };
  const passMark = toHundredths(passingAverage);
  const passed = hs.filter((h) => h >= passMark).length;
  const failed = hs.length - passed;
  return {
    eligibleCount: hs.length, totalStudents: total, excludedCount: total - hs.length,
    classAverage: fromHundredths(divRound(hs.reduce((a, b) => a + b, 0), hs.length)),
    highest: fromHundredths(Math.max(...hs)), lowest: fromHundredths(Math.min(...hs)),
    passed, failed,
    passPercent: fromHundredths(divRound(passed * 10000, hs.length)),
    failPercent: fromHundredths(divRound(failed * 10000, hs.length)),
  };
}

/** Automatic decision stored separately from any manual override. */
export function automaticDecision(average: number | null, passingAverage = 10): 'passed' | 'failed' | 'under_review' {
  if (average === null) return 'under_review';
  return toHundredths(average) >= toHundredths(passingAverage) ? 'passed' : 'failed';
}
