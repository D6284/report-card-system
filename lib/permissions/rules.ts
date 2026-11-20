/** Pure mirror of the database rules, used for server-side checks and tests. */
export type Role = 'school_admin' | 'teacher';
export interface Actor { id: string; role: Role; schoolId: string }
export interface Assignment { teacherId: string; classSubjectId: string }
export interface Submission { teacherId: string; schoolId: string; status: string }

export const canEnterMarks = (a: Actor, classSubjectId: string, assignments: Assignment[]) =>
  a.role === 'teacher' && assignments.some((x) => x.teacherId === a.id && x.classSubjectId === classSubjectId);

export const canReview = (a: Actor, s: Submission) =>
  a.role === 'school_admin' && a.schoolId === s.schoolId && a.id !== s.teacherId && s.status === 'submitted';

export const canTeacherEdit = (a: Actor, s: Submission) =>
  a.id === s.teacherId && ['draft', 'rejected', 'reopened'].includes(s.status);
