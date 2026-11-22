import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTerm, computeAnnual, ordinal, normalise, gradeFor, competenceRemarkForGrade, type SubjectDef, type MarkRec } from '../lib/results/compute.ts';

const subj = (id: string, group: string, coef: number, max = 20): SubjectDef => ({ classSubjectId: id, name: id, groupId: group, groupName: group, groupOrder: 0, coefficient: coef, maxMark: max, displayOrder: 0, teacher: 'T' });
const marks = new Map<string, MarkRec>();
const put = (e: string, s: string, n: number, v: number | null, approved = true, state: MarkRec['state'] = 'entered', termNo = 1) => marks.set(`${e}|${s}|${termNo}|${n}`, { state, value: v, approved });
const lookup = (e: string, s: string, termNo: number, n: number) => marks.get(`${e}|${s}|${termNo}|${n}`);
const subjects = [subj('math', 'Science', 4), subj('eng', 'Arts', 4), subj('cs', 'Science', 2)];
const run = (ids: string[], termNo = 1) => computeTerm({ subjects, enrollmentIds: ids, termNo, seqNos: [1, 2], mark: lookup, passingAverage: 10 });

test('spec example: weighted term average 15.2 and group figures', () => {
  marks.clear();
  put('A', 'math', 1, 15); put('A', 'math', 2, 15); put('A', 'eng', 1, 14); put('A', 'eng', 2, 14); put('A', 'cs', 1, 18); put('A', 'cs', 2, 18);
  const r = run(['A']).students.get('A')!;
  assert.equal(r.average, 15.2); assert.equal(r.totalWeighted, 152); assert.equal(r.totalCoefficients, 10);
  assert.equal(r.groups.Science.total, 96); assert.equal(r.groups.Science.ave, 16); // (15*4 + 18*2) / 6
  assert.equal(r.groups.Arts.ave, 14);
});
test('ties share positions; incomplete student is unranked and excluded from stats', () => {
  marks.clear();
  for (const e of ['A', 'B', 'C']) for (const s of ['math', 'eng', 'cs']) for (const n of [1, 2]) put(e, s, n, e === 'C' ? 12 : 15);
  for (const s of ['math', 'eng', 'cs']) for (const n of [1, 2]) put('D', s, n, n === 2 && s === 'eng' ? null : 18, true, n === 2 && s === 'eng' ? 'missing' : 'entered');
  const out = run(['A', 'B', 'C', 'D']);
  assert.deepEqual(['A', 'B', 'C', 'D'].map((e) => out.students.get(e)!.position), [1, 1, 3, null]);
  assert.equal(out.students.get('D')!.status, 'incomplete');
  assert.equal(out.stats.eligibleCount, 3); assert.equal(out.stats.excludedCount, 1); assert.equal(out.stats.highest, 15);
  // Subject positions include any student whose own subject result is complete (D's maths is complete): D 18, A/B 15 tie, C 12.
  assert.deepEqual(['D', 'A', 'B', 'C'].map((e) => out.students.get(e)!.subjects[0].position), [1, 2, 2, 4]);
});
test('unapproved marks remain incomplete and are not included in the average', () => {
  marks.clear();
  for (const s of ['math', 'eng', 'cs']) for (const n of [1, 2]) put('A', s, n, 20, n === 1 || s !== 'math');
  const r = run(['A']).students.get('A')!;
  assert.equal(r.status, 'incomplete'); assert.equal(r.subjects[0].reason, 'pending_approval'); assert.equal(r.average, 20);
});
test('marks out of other maxima are scaled to /20', () => {
  assert.equal(normalise(30, 40), 15); assert.equal(normalise(17.5, 20), 17.5);
});
test('annual average and ranking need all three terms', () => {
  const out = computeAnnual(new Map([['A', [15, 16, 17]], ['B', [15, 16, null]], ['C', [15, 16, 17]]] as any), 10);
  assert.equal(out.get('A')!.average, 16); assert.equal(out.get('A')!.position, 1); assert.equal(out.get('C')!.position, 1);
  assert.equal(out.get('B')!.average, null); assert.equal(out.get('B')!.decision, 'under_review');
});
test('configured assessment weights and arbitrary component counts drive term results', () => {
  marks.clear();
  put('A', 'math', 1, 10, true);
  put('A', 'math', 2, 20, true);
  put('A', 'math', 3, 20, true);
  marks.get('A|math|1|1')!.weight = 2;
  const result = computeTerm({
    subjects: [subj('math', 'Science', 3)],
    enrollmentIds: ['A'],
    termNo: 1,
    seqNos: [1, 2, 3],
    mark: lookup,
    passingAverage: 10,
  }).students.get('A')!;
  assert.equal(result.subjects[0].avg, 15);
  assert.equal(result.subjects[0].weighted, 45);
  assert.equal(result.average, 15);
  assert.deepEqual(result.subjects[0].assessments.map((assessment) => assessment.value), [10, 20, 20]);
});
test('partial records rank only against students with the same assessment basis', () => {
  marks.clear();
  for (const [e, math1, english1] of [['A', 15, 10], ['B', 17, 12], ['C', 19, 14]] as const) {
    put(e, 'math', 1, math1); put(e, 'eng', 1, english1);
    if (e !== 'C') {
      put(e, 'math', 2, 15); put(e, 'eng', 2, 10);
    }
    put(e, 'cs', 1, 8);
  }
  const out = run(['A', 'B', 'C']);
  assert.deepEqual(['A', 'B', 'C'].map((id) => out.students.get(id)!.position), [2, 1, null]);
  assert.deepEqual(['A', 'B', 'C'].map((id) => out.students.get(id)!.positionComparableCount), [2, 2, 1]);
  assert.equal(out.students.get('C')!.average, 14.8);
  assert.equal(out.students.get('C')!.status, 'incomplete');
});
test('mark lookup keeps sequence numbers separate across terms', () => {
  marks.clear();
  put('A', 'math', 1, 10, true, 'entered', 1);
  put('A', 'math', 1, 20, true, 'entered', 2);
  const first = computeTerm({ subjects: [subj('math', 'Science', 1)], enrollmentIds: ['A'], termNo: 1, seqNos: [1], mark: lookup, passingAverage: 10 });
  const second = computeTerm({ subjects: [subj('math', 'Science', 1)], enrollmentIds: ['A'], termNo: 2, seqNos: [1], mark: lookup, passingAverage: 10 });
  assert.equal(first.students.get('A')!.average, 10);
  assert.equal(second.students.get('A')!.average, 20);
});
test('annual average follows configured term weights', () => {
  const out = computeAnnual(new Map([['A', [10, 20, 20]]] as any), 10, [2, 1, 1]);
  assert.equal(out.get('A')!.average, 15);
});
test('annual positions compare only students with the same finalized subject basis', () => {
  const averages = new Map<string, [number | null, number | null, number | null]>([
    ['A', [16, 16, 16]],
    ['B', [15, 15, 15]],
    ['C', [14, 14, 14]],
  ]);
  const bases = new Map<string, [string, string, string]>([
    ['A', ['same-1', 'same-2', 'same-3']],
    ['B', ['same-1', 'same-2', 'same-3']],
    ['C', ['different-1', 'different-2', 'different-3']],
  ]);
  const out = computeAnnual(averages, 10, [], bases);
  assert.deepEqual(['A', 'B', 'C'].map((id) => out.get(id)!.position), [1, 2, null]);
  assert.deepEqual(['A', 'B', 'C'].map((id) => out.get(id)!.positionComparableCount), [2, 2, 1]);
});
test('competence remarks follow the configured grade letter', () => {
  assert.equal(competenceRemarkForGrade('A'), 'Competence fully acquired');
  assert.equal(competenceRemarkForGrade('B'), 'Competence fairly acquired');
  assert.equal(competenceRemarkForGrade('C'), 'Competence acquired');
  assert.equal(competenceRemarkForGrade('D'), 'Competence not acquired');
  assert.equal(competenceRemarkForGrade('E'), 'Competence not acquired');
  assert.equal(competenceRemarkForGrade(''), '');
});
test('ordinals and grades', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '103rd']);
  assert.equal(gradeFor(15.2, [{ min_avg: 0, max_avg: 9.99, grade: 'D' }, { min_avg: 10, max_avg: 20, grade: 'B' }]), 'B');
});
