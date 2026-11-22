import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMark, subjectTermResult, studentTermResult, annualAverage, rankStudents, classStatistics, automaticDecision,
} from '../lib/calculations/engine.ts';
import { canEnterMarks, canReview, canTeacherEdit } from '../lib/permissions/rules.ts';

const ok = (v: number) => ({ state: 'entered' as const, value: v, approved: true });
const sub = (id: string, c: number, a: number, b: number) => ({ subjectId: id, coefficient: c, sequences: [ok(a), ok(b)] });

test('T1 first term subject average', () => assert.equal(subjectTermResult(sub('m', 4, 14, 16)).average, 15));
test('T2 second term subject average', () => assert.equal(subjectTermResult(sub('m', 4, 15, 17)).average, 16));
test('T3 third term subject average', () => assert.equal(subjectTermResult(sub('m', 4, 16, 18)).average, 17));
test('T4 annual average', () => assert.equal(annualAverage([15, 16, 17]), 16));
test('T5 weighted term average 15.2', () => {
  const r = studentTermResult([sub('math', 4, 15, 15), sub('eng', 4, 14, 14), sub('cs', 2, 18, 18)]);
  assert.equal(r.average, 15.2);
  assert.equal(r.totalWeighted, 152);
  assert.equal(r.totalCoefficients, 10);
  assert.equal(r.status, 'complete');
});
test('T6 ties share a position (competition ranking)', () => {
  const r = rankStudents([
    { studentId: 'A', average: 17.5 }, { studentId: 'B', average: 17.5 },
    { studentId: 'C', average: 16 }, { studentId: 'D', average: 14.5 },
  ]);
  assert.deepEqual(r.map((x) => x.position), [1, 1, 3, 4]);
});
test('T7 mark above max is invalid', () => {
  assert.equal(validateMark(21).ok, false);
  assert.equal(validateMark(-2).ok, false);
  assert.equal(validateMark(17.5).ok, true);
  assert.equal(validateMark(20).ok, true);
});
test('T8 teacher cannot enter marks for unassigned class', () => {
  const t = { id: 't1', role: 'teacher' as const, schoolId: 's' };
  assert.equal(canEnterMarks(t, 'cs-2', [{ teacherId: 't1', classSubjectId: 'cs-1' }]), false);
  assert.equal(canEnterMarks(t, 'cs-1', [{ teacherId: 't1', classSubjectId: 'cs-1' }]), true);
});
test('T9 teacher cannot approve own marks; admin cannot approve own either', () => {
  const sbm = { teacherId: 'u1', schoolId: 's', status: 'submitted' };
  assert.equal(canReview({ id: 'u1', role: 'teacher', schoolId: 's' }, sbm), false);
  assert.equal(canReview({ id: 'u1', role: 'school_admin', schoolId: 's' }, sbm), false);
  assert.equal(canReview({ id: 'a1', role: 'school_admin', schoolId: 's' }, sbm), true);
  assert.equal(canReview({ id: 'a2', role: 'school_admin', schoolId: 'other' }, sbm), false);
});
test('approved marks are locked for teacher edits', () => {
  const a = { id: 't1', role: 'teacher' as const, schoolId: 's' };
  assert.equal(canTeacherEdit(a, { teacherId: 't1', schoolId: 's', status: 'approved' }), false);
  assert.equal(canTeacherEdit(a, { teacherId: 't1', schoolId: 's', status: 'rejected' }), true);
});
test('missing marks do not block averages from available subjects', () => {
  const r = studentTermResult([sub('m', 4, 14, 16), { subjectId: 'e', coefficient: 4, sequences: [ok(10), { state: 'missing', value: null, approved: false }] }]);
  assert.equal(r.status, 'incomplete');
  assert.equal(r.average, 12.5);
  assert.equal(r.totalWeighted, 100);
  assert.equal(r.totalCoefficients, 8);
  assert.equal(r.subjects[1].average, 10);
  assert.deepEqual(r.incompleteSubjects, ['e']);
});
test('pending (unapproved) marks are not used', () => {
  const r = subjectTermResult({ subjectId: 'm', coefficient: 4, sequences: [ok(14), { state: 'entered', value: 16, approved: false }] });
  assert.equal(r.status, 'incomplete');
  assert.equal(r.reason, 'pending_approval');
  assert.equal(r.average, 14);
  assert.equal(subjectTermResult(
    { subjectId: 'm', coefficient: 4, sequences: [ok(14), { state: 'entered', value: 16, approved: false }] },
    { includePendingMarks: true },
  ).average, 15);
});
test('entered zero remains a valid mark rather than a missing assessment', () => {
  const result = subjectTermResult({
    subjectId: 'civics', coefficient: 3,
    sequences: [{ state: 'entered', value: 0, approved: true }, { state: 'missing', value: null, approved: false }],
  });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.average, 0);
  assert.equal(result.weighted, 0);
});
test('exempted subject is excluded from coefficients', () => {
  const ex = { subjectId: 'x', coefficient: 5, sequences: [{ state: 'exempted' as const, value: null, approved: true }, { state: 'exempted' as const, value: null, approved: true }] };
  const r = studentTermResult([sub('m', 4, 15, 15), ex]);
  assert.equal(r.status, 'complete');
  assert.equal(r.totalCoefficients, 4);
  assert.equal(r.average, 15);
});
test('decimal marks stay exact', () => {
  assert.equal(subjectTermResult(sub('m', 3, 10.1, 10.2)).average, 10.15);
  assert.equal(studentTermResult([sub('a', 1, 0.1, 0.2), sub('b', 2, 0.3, 0.3)]).average, 0.25);
});
test('incomplete students excluded from ranking and stats, not counted as zero', () => {
  const r = rankStudents([{ studentId: 'A', average: 12 }, { studentId: 'B', average: null }, { studentId: 'C', average: 15 }]);
  assert.deepEqual(r.map((x) => x.position), [2, null, 1]);
  const s = classStatistics([12, null, 15], 10);
  assert.equal(s.eligibleCount, 2); assert.equal(s.excludedCount, 1);
  assert.equal(s.classAverage, 13.5); assert.equal(s.highest, 15); assert.equal(s.lowest, 12);
  assert.equal(s.passPercent, 100);
});
test('annual average blocked until all terms finalized', () => {
  assert.equal(annualAverage([15, 16, null]), null);
  assert.equal(annualAverage([15, 16]), null);
});
test('automatic decision uses configurable passing average', () => {
  assert.equal(automaticDecision(10), 'passed');
  assert.equal(automaticDecision(9.99), 'failed');
  assert.equal(automaticDecision(9.99, 9), 'passed');
  assert.equal(automaticDecision(null), 'under_review');
});
