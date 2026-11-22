import type { ReportCardData, SubjectLine, GroupBlock } from './types.ts';
import { planLayout, A4, MARGIN, type LayoutPlan } from './layout.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const PLACEHOLDER_PHOTO =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300"><rect width="240" height="300" fill="#eceff3"/><circle cx="120" cy="110" r="46" fill="#b9c1cc"/><path d="M30 300c0-62 40-100 90-100s90 38 90 100z" fill="#b9c1cc"/></svg>');

export const CSS = (fontPt: number) => `
@page { size: A4 portrait; margin: 0 }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; background:#fff; color-scheme:light; }
body { font-family: Arial, "Liberation Sans", "Open Sans", sans-serif; color:#172033; font-size:${fontPt}pt; }
.page { width:${A4.w}mm; height:${A4.h - 1}mm; padding:${MARGIN}mm; overflow:hidden; page-break-after:always; position:relative; background:#fff; color:#172033; }
.page:last-child { page-break-after:auto; }
table { border-collapse:collapse; table-layout:fixed; width:100%; }
td, th { border:0.25mm solid #526071; padding:0.35mm 0.8mm; overflow:hidden; white-space:nowrap; text-overflow:clip; vertical-align:middle; }
.nb td { border:0; }
.box { border:0.3mm solid #222; text-align:center; font-weight:bold; font-size:7.6pt; line-height:1.25; }
.c { text-align:center; } .b { font-weight:bold; } .l { text-align:left; }
.grp td { background:#e9eef5; font-weight:bold; color:#172b4d; }
.subj td { text-align:center; } .subj td.n { text-align:left; padding-left:1.2mm; }
.assessment { font-size:6.5pt; line-height:1.05; }
.competence { font-size:6pt; line-height:1.05; white-space:normal; }
.th th { background:#e8edf4; font-weight:bold; font-size:7.5pt; }
.sig { font-weight:bold; font-size:8.5pt; }
.stamp { border:0.35mm dashed #555; text-align:center; color:#888; font-size:6.5pt; }
`;

function subjectRow(s: SubjectLine, p: LayoutPlan): string {
  const assessments = s.assessments.map((assessment) => `<td class="assessment" title="${esc(assessment.label)} average ${esc(assessment.ave)}, weighted total ${esc(assessment.total)}">${esc(assessment.ave)}<br/><span>Total ${esc(assessment.total)}</span></td>`).join('');
  return `<tr class="subj" style="height:${p.rowMm}mm"><td class="n">${esc(s.name)}</td><td>${esc(s.coef)}</td>${assessments}
<td>${esc(s.term.ave)}</td><td>${esc(s.term.total)}</td><td>${esc(s.term.pos)}</td><td>${esc(s.grade)}</td><td class="competence">${esc(s.competenceRemark)}</td><td class="n">${esc(s.teacher)}</td></tr>`;
}

function groupRows(g: GroupBlock, p: LayoutPlan, columnCount: number): string {
  if (g.subjects.length === 0) return ''; // never render empty groups
  return g.subjects.map((s) => subjectRow(s, p)).join('') +
    `<tr class="grp" style="height:${p.rowMm}mm"><td colspan="${columnCount}"><strong>${esc(g.name)}</strong> &nbsp; Weighted total: ${esc(g.groupTotal)} &nbsp; Average: ${esc(g.groupAve)} &nbsp; Position: ${esc(g.groupPos)}</td></tr>`;
}

function decisionText(d: ReportCardData): string {
  if (d.stampSpace !== 'print' || !d.decision) return '';
  const t = { passed: 'PASSED', failed: 'FAILED', conditional: 'CONDITIONAL', under_review: 'UNDER REVIEW' }[d.decision];
  return `<div style="font-size:12pt;font-weight:bold;color:#222;padding-top:2mm">${t}</div>`;
}

export function renderPage(d: ReportCardData, plan: LayoutPlan = planLayout(d)): string {
  const s = d.student;
  const nameStyle = s.fullName.length > 24 ? 'font-size:7.4pt;white-space:normal;line-height:1.1' : '';
  const photo = s.photoSrc ?? PLACEHOLDER_PHOTO;
  const logo = d.school.logoSrc
    ? `<img src="${d.school.logoSrc}" style="width:18mm;height:18mm;object-fit:contain"/>`
    : `<div style="width:18mm;height:18mm;border:0.3mm solid #999;border-radius:50%;margin:auto"></div>`;
  const lines = (a: string[]) => a.map((l) => (l === '---' ? '<div style="font-weight:normal;line-height:0.8">------------</div>' : `<div>${esc(l)}</div>`)).join('');

  const assessmentCount = d.seqLabels.length;
  const columnCount = assessmentCount + 8;
  const assessmentWidth = assessmentCount ? 24 / assessmentCount : 0;
  const widths = [assessmentCount ? 17 : 41, 5, ...Array(assessmentCount).fill(assessmentWidth), 8, 9, 5, 4, 18, 10];
  const columns = widths.map((width) => `<col style="width:${width}%"/>`).join('');
  const assessmentHeader = assessmentCount
    ? d.seqLabels.map((label) => `<th>${esc(label)}</th>`).join('') : '';
  const assessmentSubheaders = d.seqLabels.map(() => '<th title="Average normalized to 20; total is the coefficient-weighted mark">Ave./20 + total</th>').join('');
  const dsc = d.discipline;
  const summary = d.summaryRows.map((row) => {
    return `<tr style="height:${plan.summaryRowMm}mm"><td colspan="${columnCount}" style="padding:0"><table class="nb" style="height:${plan.summaryRowMm}mm"><tr class="b">${row.map((c) => `<td class="l" style="width:${100 / row.length}%;white-space:normal">${esc(c.label)} ${esc(c.value)}</td>`).join('')}</tr></table></td></tr>`;
  }).join('');
  return `<div class="page" data-student="${esc(s.id)}">
<table class="nb" style="height:${plan.headerMm}mm"><tr>
 <td style="width:63mm;padding:0"><div class="box" style="height:${plan.headerMm - 2}mm;padding-top:2mm">${lines(d.school.leftLines)}</div></td>
 <td class="c" style="width:68mm;vertical-align:middle;padding:0 1mm">${logo}<div style="font-size:8pt;font-weight:bold;line-height:1.05;margin-top:0.5mm;white-space:normal">${esc(d.school.name)}</div><div style="font-size:6pt;font-weight:bold;margin-top:0.3mm;white-space:normal">${esc(d.school.motto ?? '')}</div></td>
 <td style="width:63mm;padding:0"><div class="box" style="height:${plan.headerMm - 2}mm;padding-top:2mm">${lines(d.school.rightLines)}</div></td></tr></table>
<div class="c b" style="height:${plan.titleMm}mm;font-size:9.5pt;line-height:1.35;padding-top:1mm">${esc(d.title)}<br/>ACADEMIC YEAR ${esc(d.academicYear)}${d.provisional ? ' &mdash; PROVISIONAL' : ''}</div>
<table class="nb" style="height:${plan.infoMm}mm;font-size:8.3pt"><tr>
 <td style="width:${194 - plan.photoW - 3}mm;vertical-align:top;padding:0">
  <table class="nb" style="height:${plan.infoMm}mm"><tr style="height:33%"><td class="b" style="width:50%">Student: <span style="font-weight:normal;${nameStyle}">${esc(s.fullName)}</span></td><td class="b" style="width:25%">Admission no.: <span style="font-weight:normal">${esc(s.admissionNo)}</span></td><td class="b">Class: <span style="font-weight:normal">${esc(s.className)}</span></td></tr>
  <tr style="height:34%"><td class="b">Date of birth: <span style="font-weight:normal">${esc(s.dob)}</span></td><td class="b">Gender: <span style="font-weight:normal">${esc(s.gender)}</span></td><td class="b">Place of birth: <span style="font-weight:normal">${esc(s.pob)}</span></td></tr>
  <tr style="height:33%"><td class="b">Class master: <span style="font-weight:normal">${esc(s.classMaster)}</span></td><td class="b">Class roll: <span style="font-weight:normal">${esc(s.rollNo)}</span></td><td class="b">Guardian tel.: <span style="font-weight:normal">${esc(s.tel)}</span></td></tr></table></td>
 <td style="width:3mm;padding:0"></td>
 <td style="width:${plan.photoW}mm;padding:0;vertical-align:top"><img src="${photo}" style="display:block;width:${plan.photoW}mm;height:${plan.photoH}mm;border:0.3mm solid #222" alt="photo"/></td></tr></table>
<table style="margin-top:1mm">
<colgroup>${columns}</colgroup>
<tr class="th" style="height:${plan.thMm / 2}mm"><th rowspan="2" class="l">Subject</th><th rowspan="2">Coef.</th>${assessmentHeader}<th colspan="3">${esc(d.termLabel)}</th><th rowspan="2">Grade</th><th rowspan="2">Competence remark</th><th rowspan="2" class="l">Teacher</th></tr>
<tr class="th" style="height:${plan.thMm / 2}mm">${assessmentSubheaders}<th>Ave. /20</th><th>Weighted total</th><th>Pos.</th></tr>
${d.groups.map((g) => groupRows(g, plan, columnCount)).join('')}
${summary}
<tr style="height:${plan.discRowMm}mm"><td colspan="${columnCount}" class="c b">ATTENDANCE &amp; DISCIPLINE</td></tr>
<tr style="height:${plan.discRowMm + 0.6}mm" class="b"><td colspan="${Math.max(1, Math.floor(columnCount / 4))}">Absences: ${esc(dsc.abs)}</td><td colspan="${Math.max(1, Math.floor(columnCount / 4))}">Suspensions: ${esc(dsc.suspensions)}</td><td colspan="${Math.max(1, Math.floor(columnCount / 4))}">Warnings: ${esc(dsc.warning)}</td><td colspan="${columnCount - 3 * Math.max(1, Math.floor(columnCount / 4))}">Remark: ${esc(dsc.remark)} ${dsc.punishments ? ` Punishments: ${esc(dsc.punishments)}` : ''}</td></tr>
</table>
<table class="nb" style="height:${plan.signMm}mm;margin-top:1.5mm"><tr>
 <td class="sig c" style="width:62mm;vertical-align:top;padding-top:1mm">PARENTS' SIGNATURE</td>
 <td style="width:70mm;padding:0 3mm"><div class="stamp" style="height:${plan.signMm - 2}mm"><div style="padding-top:1mm">PASS / FAIL &mdash; STAMP HERE</div>${decisionText(d)}</div></td>
  <td class="sig c" style="width:62mm;vertical-align:top;padding-top:1mm">PRINCIPAL${d.discipline.principalRemark ? `<div style="font-weight:normal;font-size:6.5pt;line-height:1.25;padding:0.5mm 1mm 0">${esc(d.discipline.principalRemark)}</div>` : ''}${d.signatureSrc ? `<br/><img src="${d.signatureSrc}" style="height:${Math.min(plan.signMm - 8, 14)}mm"/>` : ''}${d.stampSrc ? `<img src="${d.stampSrc}" style="height:${Math.min(plan.signMm - 6, 20)}mm;position:absolute;opacity:.85"/>` : ''}</td></tr></table>

</div>`;
}

/** One A4 page per student, in order. Each page is rendered from that student's own data only. */
export function renderDocument(cards: ReportCardData[]): { html: string; plans: LayoutPlan[]; blocked: { studentId: string; warnings: string[] }[] } {
  const plans = cards.map((c) => planLayout(c));
  const blocked = cards.map((c, i) => ({ studentId: c.student.id, warnings: plans[i].fits ? [] : plans[i].warnings })).filter((b) => b.warnings.length);
  const fontPt = Math.min(...plans.map((p) => p.fontPt), 8);
  const body = cards.map((c, i) => renderPage(c, plans[i])).join('\n');
  return { html: `<!doctype html><html><head><meta charset="utf-8"><title>Report cards</title><style>${CSS(fontPt)}</style></head><body>${body}</body></html>`, plans, blocked };
}
