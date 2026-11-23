import type { ReportCardData } from './types.ts';

/** A4 portrait, all values in millimetres. Deterministic: no browser measurement needed. */
export const A4 = { w: 210, h: 297 };
export const MARGIN = 7;
export const CONTENT_H = A4.h - 2 * MARGIN - 4; // safety so wrapped text never spills

const MIN_ROW = 4.7, MAX_ROW = 6.4;

export interface LayoutPlan {
  fits: boolean;
  tier: 'normal' | 'compact';
  rowMm: number;
  fontPt: number;
  headerMm: number; titleMm: number; infoMm: number; thMm: number;
  summaryRowMm: number; discRowMm: number; signMm: number; photoW: number; photoH: number;
  tableRows: number;
  warnings: string[];
}

export function countTableRows(d: Pick<ReportCardData, 'groups'>): number {
  return d.groups.filter((g) => g.subjects.length > 0)
    .reduce((n, g) => n + g.subjects.length + 1, 0); // +1 group-results row
}

export function planLayout(d: ReportCardData): LayoutPlan {
  const rows = countTableRows(d);
  const warnings: string[] = [];
  if (d.seqLabels.length > 4) {
    warnings.push('More than four assessment components cannot fit the A4 subject table at a readable width.');
  }
  const tiers = {
    normal:  { headerMm: 32, titleMm: 11, infoMm: 30, thMm: 8.5, summaryRowMm: 6.2, discRowMm: 5.2, signBase: 24, photoW: 24, photoH: 30 },
    compact: { headerMm: 27, titleMm: 9.5, infoMm: 26, thMm: 7.5, summaryRowMm: 5.4, discRowMm: 4.6, signBase: 20, photoW: 20, photoH: 25 },
  } as const;

  const gaps = 3; // spacing between blocks
  for (const tier of ['normal', 'compact'] as const) {
    const t = tiers[tier];
    const summaryRows = d.summaryRows.length;
    const fixed = t.headerMm + t.titleMm + t.infoMm + t.thMm + summaryRows * t.summaryRowMm + 2 * t.discRowMm + t.signBase + gaps;
    const avail = CONTENT_H - fixed;
    const per = avail / Math.max(rows, 1);
    if (per >= MIN_ROW && d.seqLabels.length <= 4) {
      const rowMm = Math.min(per, MAX_ROW);
      const slack = avail - rowMm * rows;
      const signMm = t.signBase + Math.min(Math.max(slack, 0), 16); // spare room goes to stamp/signature space
      const fontPt = rowMm >= 5.8 ? 8 : rowMm >= 5.2 ? 7.5 : 7;
      if (d.student.fullName.length > 40) warnings.push('Student name is very long and will be shrunk.');
      return { fits: true, tier, rowMm: +rowMm.toFixed(2), fontPt, ...pick(t), signMm: +signMm.toFixed(2), tableRows: rows, warnings };
    }
  }
  if (d.seqLabels.length <= 4) warnings.push(`Cannot fit ${rows} table rows on one A4 page at readable size (min row ${MIN_ROW}mm). Reduce subjects or split the programme.`);
  const t = tiers.compact;
  return { fits: false, tier: 'compact', rowMm: MIN_ROW, fontPt: 7, ...pick(t), signMm: t.signBase, tableRows: rows, warnings };
}

function pick(t: { headerMm: number; titleMm: number; infoMm: number; thMm: number; summaryRowMm: number; discRowMm: number; photoW: number; photoH: number }) {
  const { headerMm, titleMm, infoMm, thMm, summaryRowMm, discRowMm, photoW, photoH } = t;
  return { headerMm, titleMm, infoMm, thMm, summaryRowMm, discRowMm, photoW, photoH };
}
