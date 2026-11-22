import 'server-only';
import { cookies } from 'next/headers';
import { isLocalAuthEnabled } from './auth/local-token';
import { createAdminClient } from './supabase/admin';

const CLASSES_COOKIE = 'local_preview_classes';
const YEARS_COOKIE = 'local_preview_years';
const STUDENTS_COOKIE = 'local_preview_students';

const DEFAULT_CLASSES = [
  { id: '00000000-0000-0000-0000-0000000000b1', name: 'Form 1', stream: '', class_teacher_id: null },
  { id: '00000000-0000-0000-0000-0000000000b2', name: 'Form 2', stream: '', class_teacher_id: null },
  { id: '00000000-0000-0000-0000-0000000000b3', name: 'Form 3', stream: '', class_teacher_id: null },
  { id: '00000000-0000-0000-0000-0000000000b4', name: 'Form 4', stream: 'Science', class_teacher_id: null },
  { id: '00000000-0000-0000-0000-0000000000b5', name: 'Form 4', stream: 'Arts', class_teacher_id: null },
  { id: '00000000-0000-0000-0000-0000000000b6', name: 'Form 5', stream: 'Science', class_teacher_id: null },
  { id: '00000000-0000-0000-0000-0000000000b7', name: 'Form 5', stream: 'Arts', class_teacher_id: null },
];

function makeYear(id: string, name: string, isCurrent: boolean) {
  return {
    id,
    name,
    is_current: isCurrent,
    starts_on: null as string | null,
    ends_on: null as string | null,
    terms: [1, 2, 3].map((termNo) => ({
      id: `${id}-t${termNo}`,
      term_no: termNo,
      is_open: termNo === 1,
      sequences: [] as { id: string; seq_no: number; is_open: boolean; label?: string; weight?: number }[],
    })),
  };
}

const DEFAULT_YEARS = [
  makeYear('00000000-0000-0000-0000-0000000000c1', '2026/2027', true),
  makeYear('00000000-0000-0000-0000-0000000000c2', '2025/2026', false),
  makeYear('00000000-0000-0000-0000-0000000000c3', '2024/2025', false),
];

async function readCookie<T>(name: string, fallback: T[]): Promise<T[]> {
  if (!isLocalAuthEnabled()) return fallback;
  const store = await cookies();
  const raw = store.get(name)?.value;
  if (!raw) return fallback;
  try {
    const value = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

async function writeCookie(name: string, value: unknown[]) {
  const store = await cookies();
  store.set(name, encodeURIComponent(JSON.stringify(value)), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
}

export async function resolveClasses<T>(rows: T[] | null | undefined) {
  if (rows && rows.length > 0) return rows;
  if (isLocalAuthEnabled()) return localClasses();
  return [];
}

export async function resolveYears<T>(rows: T[] | null | undefined) {
  if (rows && rows.length > 0) return rows;
  if (isLocalAuthEnabled()) return localYears();
  return [];
}

/**
 * When LOCAL_AUTH is enabled, local-preview stub IDs (00000000-0000-0000-0000-0000000000b*)
 * are cookie-generated UUIDs that do NOT exist in Supabase.
 * After syncLocalTeachingStructure() has run, this function maps a stub classId/yearId
 * back to the real Supabase UUID by name-matching against the DB.
 * If the submitted ID is already a real DB UUID it is returned unchanged.
 */
export async function resolveLocalIds(
  schoolId: string,
  submittedClassId: string,
  submittedYearId: string,
): Promise<{ classId: string; yearId: string }> {
  const admin = createAdminClient();
  const [localCls, localYrs] = await Promise.all([localClasses(), localYears()]);

  // Map stub → name
  const stubClass = localCls.find((c) => c.id === submittedClassId);
  const stubYear = localYrs.find((y) => y.id === submittedYearId);

  // If neither is a stub, IDs are already real DB UUIDs
  if (!stubClass && !stubYear) return { classId: submittedClassId, yearId: submittedYearId };

  const [{ data: dbClasses }, { data: dbYears }] = await Promise.all([
    admin.from('classes').select('id,name,stream').eq('school_id', schoolId),
    admin.from('academic_years').select('id,name').eq('school_id', schoolId),
  ]);

  let classId = submittedClassId;
  if (stubClass) {
    const match = (dbClasses ?? []).find(
      (c) => c.name === stubClass.name && (c.stream ?? '') === (stubClass.stream ?? ''),
    );
    if (match) classId = match.id;
  }

  let yearId = submittedYearId;
  if (stubYear) {
    const match = (dbYears ?? []).find((y) => y.name === stubYear.name);
    if (match) yearId = match.id;
  }

  return { classId, yearId };
}

export async function localClasses() {
  return readCookie(CLASSES_COOKIE, DEFAULT_CLASSES);
}

export async function localYears() {
  return readCookie(YEARS_COOKIE, DEFAULT_YEARS);
}

type ClassOption = { id: string; name: string; stream: string | null };
type YearOption = { id: string; name: string };

function sameClass(a: ClassOption, b: ClassOption) {
  return a.name === b.name && (a.stream ?? '') === (b.stream ?? '');
}

export function findLocalClassId(classes: readonly ClassOption[], savedClasses: readonly ClassOption[], submittedId: string) {
  if (classes.some((c) => c.id === submittedId)) return submittedId;
  const saved = savedClasses.find((c) => c.id === submittedId);
  if (!saved) return null;
  return classes.find((c) => sameClass(c, saved))?.id ?? null;
}

export function findLocalYearId(years: readonly YearOption[], savedYears: readonly YearOption[], submittedId: string) {
  if (years.some((y) => y.id === submittedId)) return submittedId;
  const saved = savedYears.find((y) => y.id === submittedId);
  if (!saved) return null;
  return years.find((y) => y.name === saved.name)?.id ?? null;
}

export async function resolveLocalSelection(schoolId: string, submittedClassId: string, submittedYearId: string) {
  const [classes, years] = await Promise.all([localClasses(), localYears()]);
  const localClassId = classes.some((c) => c.id === submittedClassId) ? submittedClassId : null;
  const localYearId = years.some((y) => y.id === submittedYearId) ? submittedYearId : null;
  if (localClassId && localYearId) return { classId: localClassId, yearId: localYearId };
  const admin = createAdminClient();
  const [savedClasses, savedYears] = await Promise.all([
    admin.from('classes').select('id,name,stream').eq('school_id', schoolId),
    admin.from('academic_years').select('id,name').eq('school_id', schoolId),
  ]);
  return {
    classId: localClassId ?? findLocalClassId(classes, savedClasses.data ?? [], submittedClassId),
    yearId: localYearId ?? findLocalYearId(years, savedYears.data ?? [], submittedYearId),
  };
}

export async function syncLocalTeachingStructure(schoolId: string): Promise<string | null> {
  const admin = createAdminClient();
  const [{ data: school, error: schoolError }, [classes, years], { data: savedClasses, error: classQueryError }] = await Promise.all([
    admin.from('schools').select('id').eq('id', schoolId).maybeSingle(),
    Promise.all([localClasses(), localYears()]),
    admin.from('classes').select('id,name,stream').eq('school_id', schoolId),
  ]);
  if (schoolError) return schoolError.message;
  if (!school) return 'Create the school workspace before configuring local classes and subjects';
  if (classQueryError) return classQueryError.message;
  const classKeys = new Set((savedClasses ?? []).map((row) => `${row.name}\u0000${row.stream ?? ''}`));
  const classesToCreate = classes.filter((row) => !classKeys.has(`${row.name}\u0000${row.stream ?? ''}`));
  if (classesToCreate.length) {
    const { error } = await admin.from('classes').upsert(
      classesToCreate.map((row) => ({
        school_id: schoolId,
        name: row.name,
        stream: row.stream || null,
      })),
      { onConflict: 'school_id,name,stream', ignoreDuplicates: true },
    );
    if (error) return error.message;
  }

  const { data: savedYears, error: yearQueryError } = await admin.from('academic_years')
    .select('id,name,is_current').eq('school_id', schoolId);
  if (yearQueryError) return yearQueryError.message;
  const savedYearNames = new Set((savedYears ?? []).map((row) => row.name));
  const hasCurrentYear = (savedYears ?? []).some((row) => row.is_current);
  const yearsToCreate = years.filter((row) => !savedYearNames.has(row.name));
  if (yearsToCreate.length) {
    const { error } = await admin.from('academic_years').upsert(
      yearsToCreate.map((row) => ({
        school_id: schoolId,
        name: row.name,
        starts_on: row.starts_on,
        ends_on: row.ends_on,
        is_current: row.is_current && !hasCurrentYear,
      })),
      { onConflict: 'school_id,name', ignoreDuplicates: true },
    );
    if (error) return error.message;
  }

  const { data: syncedYears, error: syncedYearError } = await admin.from('academic_years')
    .select('id,name').eq('school_id', schoolId);
  if (syncedYearError) return syncedYearError.message;
  const yearIdByName = new Map((syncedYears ?? []).map((row) => [row.name, row.id]));
  const yearIds = [...yearIdByName.values()];
  if (!yearIds.length) return 'No academic years are available for this school';

  const { data: savedTerms, error: termQueryError } = await admin.from('terms')
    .select('id,academic_year_id,term_no').eq('school_id', schoolId).in('academic_year_id', yearIds);
  if (termQueryError) return termQueryError.message;
  const termKeys = new Set((savedTerms ?? []).map((row) => `${row.academic_year_id}\u0000${row.term_no}`));
  const termsToCreate = years.flatMap((year) => {
    const academicYearId = yearIdByName.get(year.name);
    if (!academicYearId) return [];
    return year.terms
      .filter((term) => !termKeys.has(`${academicYearId}\u0000${term.term_no}`))
      .map((term) => ({
        school_id: schoolId,
        academic_year_id: academicYearId,
        term_no: term.term_no,
        starts_on: null,
        ends_on: null,
        is_open: term.is_open,
      }));
  });
  if (termsToCreate.length) {
    const { error } = await admin.from('terms').insert(termsToCreate);
    if (error) return error.message;
  }

  const { data: syncedTerms, error: syncedTermError } = await admin.from('terms')
    .select('id,academic_year_id,term_no').eq('school_id', schoolId).in('academic_year_id', yearIds);
  if (syncedTermError) return syncedTermError.message;
  const termIdByKey = new Map((syncedTerms ?? []).map((row) => [`${row.academic_year_id}\u0000${row.term_no}`, row.id]));
  const termIds = [...termIdByKey.values()];
  if (!termIds.length) return 'No terms are available for the configured academic years';

  const { data: savedSequences, error: sequenceQueryError } = await admin.from('sequences')
    .select('id,term_id,seq_no').eq('school_id', schoolId).in('term_id', termIds);
  if (sequenceQueryError) return sequenceQueryError.message;
  const sequenceKeys = new Set((savedSequences ?? []).map((row) => `${row.term_id}\u0000${row.seq_no}`));
  const sequencesToCreate = years.flatMap((year) => year.terms.flatMap((term) => {
    const academicYearId = yearIdByName.get(year.name);
    const termId = academicYearId ? termIdByKey.get(`${academicYearId}\u0000${term.term_no}`) : null;
    if (!termId) return [];
    return term.sequences
      .filter((sequence) => !sequenceKeys.has(`${termId}\u0000${sequence.seq_no}`))
      .map((sequence) => ({
        school_id: schoolId,
        term_id: termId,
        seq_no: sequence.seq_no,
        label: sequence.label ?? `Sequence ${sequence.seq_no}`,
        weight: sequence.weight ?? 1,
        starts_on: null,
        ends_on: null,
        is_open: sequence.is_open,
      }));
  }));
  if (sequencesToCreate.length) {
    const { error } = await admin.from('sequences').insert(sequencesToCreate);
    if (error) return error.message;
  }

  const localStudentsToSync = await localStudents();
  if (localStudentsToSync.length) {
    const { data: syncedClasses, error: syncedClassError } = await admin.from('classes')
      .select('id,name,stream').eq('school_id', schoolId);
    if (syncedClassError) return syncedClassError.message;
    const classIdByKey = new Map((syncedClasses ?? []).map((row) => [`${row.name}\u0000${row.stream ?? ''}`, row.id]));
    const classIds = new Set((syncedClasses ?? []).map((row) => row.id));
    const yearIds = new Set((syncedYears ?? []).map((row) => row.id));
    const localClassById = new Map(classes.map((row) => [row.id, row]));
    const studentsToSync = localStudentsToSync.flatMap((student) => {
      const localClass = localClassById.get(student.class_id);
      const localYear = years.find((row) => row.id === student.academic_year_id);
      const classId = localClass
        ? classIdByKey.get(`${localClass.name}\u0000${localClass.stream ?? ''}`)
        : classIds.has(student.class_id) ? student.class_id : undefined;
      const academicYearId = localYear
        ? yearIdByName.get(localYear.name)
        : yearIds.has(student.academic_year_id) ? student.academic_year_id : undefined;
      if (!classId || !academicYearId) return [];
      return [{
        student,
        classId,
        academicYearId,
        record: {
          school_id: schoolId,
          admission_no: student.admission_no,
          full_name: student.full_name,
          gender: student.gender,
          date_of_birth: student.date_of_birth || null,
          place_of_birth: student.place_of_birth || null,
          guardian_name: student.guardian_name || null,
          guardian_phone: student.guardian_phone || null,
          is_active: student.is_active,
        },
      }];
    });
    if (studentsToSync.length !== localStudentsToSync.length) {
      return 'Some local students could not be matched to a Supabase class or academic year';
    }

    const { error: studentUpsertError } = await admin.from('students').upsert(
      studentsToSync.map((row) => row.record),
      { onConflict: 'school_id,admission_no', ignoreDuplicates: true },
    );
    if (studentUpsertError) return studentUpsertError.message;

    const { data: syncedStudents, error: syncedStudentError } = await admin.from('students')
      .select('id,admission_no').eq('school_id', schoolId)
      .in('admission_no', studentsToSync.map((row) => row.student.admission_no));
    if (syncedStudentError) return syncedStudentError.message;
    const studentIdByAdmission = new Map((syncedStudents ?? []).map((row) => [row.admission_no, row.id]));
    const enrollments = studentsToSync.flatMap((row) => {
      const studentId = studentIdByAdmission.get(row.student.admission_no);
      if (!studentId) return [];
      return [{
        school_id: schoolId,
        student_id: studentId,
        class_id: row.classId,
        academic_year_id: row.academicYearId,
        status: 'active',
      }];
    });
    if (enrollments.length !== studentsToSync.length) return 'Some local students could not be synchronized';
    const { error: enrollmentError } = await admin.from('student_enrollments').upsert(enrollments, {
      onConflict: 'student_id,academic_year_id',
      ignoreDuplicates: true,
    });
    if (enrollmentError) return enrollmentError.message;
  }
  return null;
}

export async function addLocalClass(name: string, stream: string) {
  const current = await localClasses();
  const next = [...current, { id: crypto.randomUUID(), name, stream, class_teacher_id: null }];
  await writeCookie(CLASSES_COOKIE, next);
  return next;
}

export async function addLocalYear(name: string, startsOn?: string, endsOn?: string) {
  const current = await localYears();
  const year = makeYear(crypto.randomUUID(), name, false);
  year.starts_on = startsOn ?? null;
  year.ends_on = endsOn ?? null;
  const next = [year, ...current.map((y) => ({ ...y, is_current: false }))];
  await writeCookie(YEARS_COOKIE, next);
  return next;
}

export interface LocalStudent {
  id: string;
  full_name: string;
  admission_no: string;
  gender: 'M' | 'F';
  date_of_birth?: string;
  place_of_birth?: string;
  guardian_name?: string;
  guardian_phone?: string;
  class_id: string;
  academic_year_id: string;
  is_active: boolean;
  photo_path: null;
}

export async function localStudents(): Promise<LocalStudent[]> {
  return readCookie<LocalStudent>(STUDENTS_COOKIE, []);
}

export async function addLocalStudent(student: Omit<LocalStudent, 'id' | 'is_active' | 'photo_path'>) {
  const current = await localStudents();
  const next: LocalStudent = { ...student, id: crypto.randomUUID(), is_active: true, photo_path: null };
  await writeCookie(STUDENTS_COOKIE, [...current, next]);
  return next;
}

export async function setLocalStudentStatus(id: string, isActive: boolean) {
  const current = await localStudents();
  await writeCookie(STUDENTS_COOKIE, current.map((s) => s.id === id ? { ...s, is_active: isActive } : s));
}

export async function moveLocalStudentEnrollment(admissionNo: string, classId: string, academicYearId: string) {
  const [current, classes, years] = await Promise.all([localStudents(), localClasses(), localYears()]);
  const validClass = classes.some((c) => c.id === classId);
  const validYear = years.some((y) => y.id === academicYearId);
  if (!validClass || !validYear) return false;
  await writeCookie(STUDENTS_COOKIE, current.map((s) => s.admission_no === admissionNo
    ? { ...s, class_id: classId, academic_year_id: academicYearId }
    : s));
  return true;
}
