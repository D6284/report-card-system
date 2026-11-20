export interface Cell2 { ave: string; total: string }
export interface SubjectLine {
  name: string; coef: string;
  assessments: { label: string; ave: string; total: string }[];
  term: { ave: string; total: string; pos: string };
  grade: string; competenceRemark: string; teacher: string;
}
export interface GroupBlock {
  name: string;                 // e.g. "Science group Results"
  subjects: SubjectLine[];
  groupTotal: string; groupAve: string; groupPos: string;
}
export interface SummaryCell { label: string; value: string; span?: number }

export interface ReportCardData {
  school: {
    name: string;
    leftLines: string[];        // English column (Republic of Cameroon, motto lines, school name...)
    rightLines: string[];       // French column (admin. authority lines)
    motto?: string;
    logoSrc: string | null;     // data URI or URL of the uploaded logo
  };
  title: string;                // "THIRD TERM REPORT CARD"
  academicYear: string;         // "2023/2024"
  seqLabels: string[];          // configured assessments for the selected term
  termLabel: string;            // "3rd Term"
  student: {
    id: string; fullName: string; className: string; rollNo: string; repeater: string;
    dob: string; pob: string; gender: string; admissionNo: string;
    classMaster: string; tel: string;
    photoSrc: string | null;    // pre-cropped 3:4 image (data URI); null => placeholder
  };
  groups: GroupBlock[];         // empty groups are never rendered
  summaryRows: SummaryCell[][];
  discipline: { abs: string; suspensions: string; punishments: string; warning: string; remark: string; principalRemark: string };
  decision: 'passed' | 'failed' | 'conditional' | 'under_review' | null;
  stampSpace: 'blank' | 'print';   // blank = leave room for a physical PASS/FAIL stamp
  signatureSrc: string | null;
  stampSrc: string | null;
  provisional?: boolean;
}
