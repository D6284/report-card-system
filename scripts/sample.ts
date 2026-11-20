import { writeFileSync } from 'node:fs';
import { renderDocument } from '../lib/report/render.ts';
import { buildSummaryRows } from '../lib/report/summary.ts';
import type { ReportCardData, GroupBlock, SubjectLine } from '../lib/report/types.ts';

const svgPhoto = (label: string, hue: number) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300"><rect width="240" height="300" fill="hsl(${hue},40%,85%)"/><circle cx="120" cy="110" r="46" fill="hsl(${hue},40%,45%)"/><path d="M30 300c0-62 40-100 90-100s90 38 90 100z" fill="hsl(${hue},40%,45%)"/><text x="120" y="285" font-size="34" text-anchor="middle" fill="white" font-family="sans-serif">${label}</text></svg>`);
const logo = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="94" fill="#fff" stroke="#1a3a7a" stroke-width="8"/><circle cx="100" cy="100" r="60" fill="#1a3a7a"/><text x="100" y="112" font-size="34" fill="#fff" text-anchor="middle" font-family="sans-serif">LOGO</text></svg>');

const line = (name: string, coef: number, a: number, b: number, pos: number, teacher: string): SubjectLine => {
  const avg = (a + b) / 2;
  return { name, coef: String(coef), assessments: [{ label: 'Sequence 5', ave: a.toFixed(2), total: (a * coef).toFixed(2) }, { label: 'Sequence 6', ave: b.toFixed(2), total: (b * coef).toFixed(2) }],
    term: { ave: avg.toFixed(2), total: (avg * coef).toFixed(2), pos: String(pos) },
    grade: avg >= 16 ? 'A' : avg >= 12 ? 'B' : avg >= 10 ? 'C' : 'D',
    competenceRemark: avg >= 16 ? 'Competence fully acquired' : avg >= 12 ? 'Competence fairly acquired' : avg >= 10 ? 'Competence acquired' : 'Competence not acquired',
    teacher };
};
const mk = (name: string, subs: string[]): GroupBlock => ({
  name, subjects: subs.map((s, i) => line(s, 2 + (i % 3), 10 + (i % 7), 11 + (i % 6), 1 + i, 'Mr. Teacher ' + (i + 1))),
  groupTotal: '312.00', groupAve: '13.45', groupPos: '4th' });

const SCI = ['Mathematics', 'Chemistry', 'Biology', 'Physics', 'Computer Science', 'Additional Maths', 'Food and nutrition'];
const ART = ['ENGLISH Language', 'FRENCH Language', 'History', 'Geography', 'Economics', 'Literature in English', 'Citizenship education'];
const OTH = ['Religious Studies', 'Physical Education', 'Logic'];
const summaryTerm = (ave: string, position: string, classAve: string, best: string, worst: string, students: string, passed: string) => ({
  ave, position, totalWeighted: '312.00', totalCoefficients: '24.00', classAve, best, worst, students, passed,
});

function card(i: number, n: { sci: number; art: number; oth: number }, name: string): ReportCardData {
  const groups = [mk('Science group Results', SCI.slice(0, n.sci)), mk('Arts group Results', ART.slice(0, n.art)), mk('Others Results', OTH.slice(0, n.oth))];
  return {
    school: { name: 'ST. THERESE SECONDARY SCHOOL', leftLines: ['REPUBLIC OF CAMEROON', '---', 'Peace \u2013 Work \u2013 Fatherland', '---', 'MINISTRY OF SECONDARY EDUCATION'],
      rightLines: ['REPUBLIQUE DU CAMEROUN', '---', 'Paix \u2013 Travail \u2013 Patrie', '---', 'MINISTRY OF SECONDARY EDUCATION', 'REGIONAL DELEGATION FOR EAST'], motto: 'Motto : Prayers-Hardwork-Discipline', logoSrc: logo },
    title: 'THIRD TERM REPORT CARD', academicYear: '2023/2024', seqLabels: ['1st Test', '2nd Test'], termLabel: '3rd Term',
    student: { id: 'stu-' + i, fullName: name, className: 'Form 5 Science', rollNo: '45', repeater: 'No', dob: '12/03/2008', pob: 'Kumba', gender: 'F', admissionNo: 'ADM-00' + i, classMaster: 'Mrs. Class Master', tel: '6xx xxx xxx', photoSrc: svgPhoto('S' + i, i * 90) },
    groups,
    summaryRows: buildSummaryRows({ term: 3, terms: [summaryTerm('14.20', '4th', '11.30', '16.80', '6.40', '45', '30'), summaryTerm('15.10', '3rd', '11.80', '17.20', '7.00', '45', '32'), summaryTerm('15.60', '2nd', '12.00', '18.20', '6.40', '45', '33')],
      annualAve: '14.97', annualPos: '2nd' }),
    discipline: { abs: '2', suspensions: '0', punishments: '0', warning: '0', remark: 'Good', principalRemark: '' },
    decision: 'passed', stampSpace: 'blank', signatureSrc: null, stampSrc: null,
  };
}
const which = process.argv[2] ?? 'full';
const sizes = { full: { sci: 7, art: 7, oth: 3 }, f12: { sci: 5, art: 5, oth: 2 }, f17: { sci: 7, art: 7, oth: 3 } }[which as 'full'];
const N = Number(process.argv[3] ?? 3);
const names = ['MBAH ELIZABETH NGWENYI', 'TABOT JOHNSON', 'A VERY LONG NAME FOR TESTING NGUETSEUP MBOUOMBOUO'];
const cards = Array.from({ length: N }, (_, k) => card(k + 1, sizes, names[k] ?? 'STUDENT NUMBER ' + (k + 1)));
const { html, plans, blocked } = renderDocument(cards);
writeFileSync(`out/${which}${N > 3 ? N : ''}.html`, html);
console.log(JSON.stringify({ plan: plans[0], blocked }));
