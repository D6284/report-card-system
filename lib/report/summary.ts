import type { SummaryCell } from './types.ts';

export interface TermFigures {
  ave: string;
  position: string;
  totalWeighted: string;
  totalCoefficients: string;
  classAve: string;
  best: string;
  worst: string;
  students: string;
  studentsLabel?: string;
  classAveLabel?: string;
  bestLabel?: string;
  worstLabel?: string;
  passedLabel?: string;
  passed: string;
}

export interface SummaryInput {
  term: 1 | 2 | 3;
  terms: [TermFigures | null, TermFigures | null, TermFigures | null];
  annualAve: string;
  annualPos: string;
  passingAverage?: string;
  gradingScale?: string;
}

/** Compact term-specific academic summary; future terms are never rendered. */
export function buildSummaryRows(i: SummaryInput): SummaryCell[][] {
  const termLabels = ['1st Term', '2nd Term', '3rd Term'];
  const figures = i.terms.slice(0, i.term).map((t, n) => ({ label: termLabels[n], value: t }));
  const cell = (label: string, value: string, span = 3): SummaryCell => ({ label, value, span });
  const current = i.terms[i.term - 1];
  if (!current) return [];
  const gradingRow: SummaryCell[][] = i.gradingScale ? [[cell('Grading scale:', i.gradingScale, 12)]] : [];

  if (i.term === 1) {
    return [
      [cell('Term average:', current.ave), cell('Weighted total:', current.totalWeighted), cell('Total coefficients:', current.totalCoefficients), cell('Class position:', current.position, 2)],
      [cell(current.classAveLabel ?? 'Class average:', current.classAve), cell(current.bestLabel ?? 'Best average:', current.best), cell(current.worstLabel ?? 'Lowest average:', current.worst), cell(current.studentsLabel ?? 'Students:', current.students, 2)],
      [cell(current.passedLabel ?? 'Meeting pass threshold:', current.passed), cell('Pass threshold:', i.passingAverage ?? '10 / 20'), cell('Assessments:', 'Sequence results', 5)],
      ...gradingRow,
    ];
  }

  if (i.term === 2) {
    const previous = figures[0].value!;
    return [
      [cell('1st term average / position:', `${previous.ave} / ${previous.position}`, 5), cell('2nd term average / position:', `${current.ave} / ${current.position}`, 6)],
      [cell('2nd term weighted total:', current.totalWeighted, 4), cell('Total coefficients:', current.totalCoefficients, 3), cell(current.classAveLabel ?? 'Class average:', current.classAve, 4)],
      [cell(current.bestLabel ?? 'Best average:', current.best, 3), cell(current.worstLabel ?? 'Lowest average:', current.worst, 3), cell(current.passedLabel ?? 'Meeting pass threshold:', `${current.passed} / ${current.students}`, 5)],
      ...gradingRow,
    ];
  }

  const first = figures[0].value!;
  const second = figures[1].value!;
  return [
    [cell('1st term average / position:', `${first.ave} / ${first.position}`, 3), cell('2nd term average / position:', `${second.ave} / ${second.position}`, 3), cell('3rd term average / position:', `${current.ave} / ${current.position}`, 3), cell('Annual average / position:', `${i.annualAve} / ${i.annualPos}`, 2)],
    [cell('3rd term weighted total:', current.totalWeighted, 4), cell('Total coefficients:', current.totalCoefficients, 3), cell(current.classAveLabel ?? 'Class average:', current.classAve, 4)],
    [cell(current.bestLabel ?? 'Best average:', current.best, 3), cell(current.worstLabel ?? 'Lowest average:', current.worst, 3), cell(current.passedLabel ?? 'Students meeting threshold:', `${current.passed} / ${current.students}`, 5)],
    ...gradingRow,
  ];
}
