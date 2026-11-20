import test from 'node:test';
import assert from 'node:assert/strict';
import { planLayout } from '../lib/report/layout.ts';
import { renderDocument } from '../lib/report/render.ts';
import { buildSummaryRows } from '../lib/report/summary.ts';
import type { ReportCardData, GroupBlock, SubjectLine } from '../lib/report/types.ts';

const subj = (n: string): SubjectLine => ({ name: n, coef: '2', assessments: [{ label: 'Sequence 1', ave: '10', total: '20' }, { label: 'Sequence 2', ave: '10', total: '20' }], term: { ave: '10', total: '20', pos: '1' }, grade: 'C', competenceRemark: 'Competence acquired', teacher: 'T' });
const group = (name: string, n: number): GroupBlock => ({ name, subjects: Array.from({ length: n }, (_, i) => subj(`${name}-S${i}`)), groupTotal: '1', groupAve: '1', groupPos: '1' });
const termFigure = { ave: '1', position: '1', totalWeighted: '1', totalCoefficients: '1', classAve: '1', best: '1', worst: '1', students: '1', passed: '1' };
const card = (id: string, counts: number[], extra: Partial<ReportCardData['student']> = {}): ReportCardData => ({
  school: { name: 'Example School', leftLines: ['A'], rightLines: ['B'], logoSrc: 'data:logo' }, title: 'T', academicYear: '2026/2027', seqLabels: ['1', '2'], termLabel: 'Term',
  student: { id, fullName: 'Name ' + id, className: 'F1', rollNo: '1', repeater: 'No', dob: '', pob: '', gender: 'M', admissionNo: 'A' + id, classMaster: '', tel: '', photoSrc: `data:photo-of-${id}`, ...extra },
  groups: counts.map((n, i) => group('G' + i, n)), summaryRows: buildSummaryRows({ term: 3, terms: [termFigure, termFigure, termFigure], annualAve: '1', annualPos: '1' }),
  discipline: { abs: '0', suspensions: '0', punishments: '0', warning: '0', remark: '', principalRemark: '' },
 decision: 'passed', stampSpace: 'blank', signatureSrc: null, stampSrc: null,
});

test('12, 15 and 17 subject classes fit one A4 page', () => {
  for (const counts of [[5, 5, 2], [6, 6, 3], [7, 7, 3]]) assert.equal(planLayout(card('1', counts)).fits, true);
});
test('absurd subject count is flagged, never silently overflowed', () => {
  const p = planLayout(card('1', [20, 20, 5]));
  assert.equal(p.fits, false);
  assert.ok(p.warnings[0].includes('one A4 page'));
});
test('empty groups are not rendered', () => {
  const { html } = renderDocument([card('1', [3, 0, 2])]);
  assert.ok(html.includes('G0') && html.includes('G2'));
  assert.ok(!html.includes('G1-S') && !html.includes('>G1<'));
});
test('each page shows only its own student photo and credentials', () => {
  const { html } = renderDocument([card('A', [3]), card('B', [3]), card('C', [3])]);
  const pages = html.split('<div class="page"').slice(1);
  assert.equal(pages.length, 3);
  ['A', 'B', 'C'].forEach((id, i) => {
    assert.ok(pages[i].includes(`data:photo-of-${id}`));
    assert.ok(pages[i].includes(`Name ${id}`));
    for (const other of ['A', 'B', 'C'].filter((x) => x !== id)) {
      assert.ok(!pages[i].includes(`data:photo-of-${other}`));
      assert.ok(!pages[i].includes(`Name ${other}`));
    }
  });
});
test('missing photo shows placeholder, not a broken image', () => {
  const { html } = renderDocument([card('A', [3], { photoSrc: null })]);
  assert.ok(html.includes('data:image/svg+xml'));
});
test('stamp space is blank by default; printed only when configured', () => {
  assert.ok(!renderDocument([card('A', [3])]).html.includes('PASSED'));
  assert.ok(renderDocument([{ ...card('A', [3]), stampSpace: 'print' }]).html.includes('PASSED'));
  assert.ok(renderDocument([card('A', [3])]).html.includes('STAMP HERE'));
});
test('first-term report shows no future term results', () => {
  const rows = buildSummaryRows({ term: 1, terms: [{ ...termFigure, ave: '14', classAve: '11', passed: '5' }, null, null], annualAve: '', annualPos: '' });
  const text = JSON.stringify(rows);
  assert.ok(text.includes('Term average:') && !text.includes('2nd term') && !text.includes('Annual average'));
});
test('HTML escapes student data', () => {
  assert.ok(!renderDocument([card('A', [1], { fullName: '<script>x</script>' })]).html.includes('<script>x'));
});
test('17-subject card formats Science, Arts and Others groups with totals', () => {
  const c = card('1', [7, 7, 3]);
  const { html, plans } = renderDocument([c]);
  assert.equal(plans[0].fits, true);
  assert.ok(html.includes('Weighted total: 1'));
  assert.ok(html.includes('Average: 1'));
  assert.ok(html.includes('Position: 1'));
  assert.ok(html.includes('width:210mm'));
});
test('assessment averages and coefficient-weighted totals stay together in each dynamic column', () => {
  const { html } = renderDocument([card('A', [2])]);
  assert.ok(html.includes('Total 20'));
  assert.ok(html.includes('Ave. / total'));
});
test('competence remark is rendered with the subject grade', () => {
  const { html } = renderDocument([card('A', [2])]);
  assert.ok(html.includes('Competence remark'));
  assert.ok(html.includes('Competence acquired'));
});
test('school identity is always printed in the centered report header', () => {
  const { html } = renderDocument([card('A', [2])]);
  assert.ok(html.includes('Example School'));
});
test('too many assessment columns are blocked instead of clipped', () => {
  const tooMany = { ...card('A', [2]), seqLabels: ['1', '2', '3', '4', '5'] };
  assert.equal(planLayout(tooMany).fits, false);
});
test('second-term report compares first-term average and position without future results', () => {
  const rows = buildSummaryRows({
    term: 2,
    terms: [{ ...termFigure, ave: '12', position: '4th' }, { ...termFigure, ave: '14', position: '2nd' }, null],
    annualAve: '',
    annualPos: '',
  });
  const text = JSON.stringify(rows);
  assert.ok(text.includes('12 / 4th') && text.includes('14 / 2nd'));
  assert.ok(!text.includes('3rd term') && !text.includes('Annual average'));
});
test('third-term report includes all term comparisons and annual standing', () => {
  const rows = buildSummaryRows({
    term: 3,
    terms: [
      { ...termFigure, ave: '12', position: '4th' },
      { ...termFigure, ave: '14', position: '2nd' },
      { ...termFigure, ave: '16', position: '1st' },
    ],
    annualAve: '14.5',
    annualPos: '2nd',
  });
  const text = JSON.stringify(rows);
  assert.ok(text.includes('12 / 4th') && text.includes('14 / 2nd') && text.includes('16 / 1st'));
  assert.ok(text.includes('14.5 / 2nd'));
});
