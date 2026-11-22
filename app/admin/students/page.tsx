import Link from 'next/link';
import { Download, FileSpreadsheet, Search, SlidersHorizontal, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createStudent, moveStudentEnrollment, toggleStudentStatus } from '../actions';
import ConfirmButton from '../../components/ConfirmButton';
import PhotoUpload from './PhotoUpload';
import { Alert, Avatar, EmptyState, PageHeading, SectionCard, StatusBadge } from '../../components/ui';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { localClasses, localStudents, localYears, resolveClasses, resolveYears, syncLocalTeachingStructure } from '@/lib/local-preview';
import { requireSchoolSession } from '@/lib/auth/session';

type Params = { error?: string; q?: string; class?: string; year?: string; gender?: string; status?: string; saved?: string; page?: string };
const PAGE_SIZE = 100;

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { error, q, class: classId, year, gender, status, saved, page: pageParam } = await searchParams;
  const requestedPage = Number(pageParam);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, Math.floor(2147483647 / PAGE_SIZE))
    : 1;
  const localAuth = isLocalAuthEnabled();
  const session = await requireSchoolSession('school_admin');
  const syncError = localAuth ? await syncLocalTeachingStructure(session.schoolId) : null;
  const sb = localAuth ? createAdminClient() : await createClient();
  const [{ data: classRows }, { data: yearRows }] = await Promise.all([
    sb.from('classes').select('id,name,stream').eq('school_id', session.schoolId).order('name'),
    sb.from('academic_years').select('id,name,is_current').eq('school_id', session.schoolId).order('name', { ascending: false }),
  ]);
  const classes = localAuth ? await localClasses() : await resolveClasses(classRows);
  const years = localAuth ? await localYears() : await resolveYears(yearRows);
  const current = years?.find((y) => y.is_current)?.id;
  const selectedYear = year || current || '';
  let rows: any[] = [];
  if (isLocalAuthEnabled()) {
    const localClassMap = new Map(classes.map((c: any) => [c.id, c]));
    const term = q?.replace(/[%,]/g, '').toLowerCase() ?? '';
    rows = (await localStudents())
      .filter((s) => !selectedYear || s.academic_year_id === selectedYear)
      .filter((s) => !classId || s.class_id === classId)
      .filter((s) => !gender || s.gender === gender)
      .filter((s) => status !== 'active' || s.is_active)
      .filter((s) => status !== 'inactive' || !s.is_active)
      .filter((s) => !term || s.full_name.toLowerCase().includes(term) || s.admission_no.toLowerCase().includes(term))
      .map((s) => ({ id: s.id, status: 'active', classes: localClassMap.get(s.class_id), students: s }));
  } else {
    let query = sb.from('student_enrollments').select('id,status,classes(name,stream),students!inner(id,full_name,admission_no,gender,is_active,photo_path)');
    if (selectedYear) query = query.eq('academic_year_id', selectedYear);
    if (classId) query = query.eq('class_id', classId);
    if (gender) query = query.eq('students.gender', gender);
    if (status === 'active') query = query.eq('students.is_active', true);
    if (status === 'inactive') query = query.eq('students.is_active', false);
    if (q) {
      const term = q.replace(/[%,]/g, '');
      query = query.or(`students.full_name.ilike.%${term}%,students.admission_no.ilike.%${term}%`);
    }
    const result = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    rows = result.data ?? [];
  }
  const hasNext = rows.length > PAGE_SIZE;
  const visibleRows = rows.slice(0, PAGE_SIZE);
  const paths = visibleRows.map((r: any) => r.students.photo_path).filter(Boolean);
  const { data: signed } = paths.length ? await sb.storage.from('student-photos').createSignedUrls(paths, 3600) : { data: [] as any[] };
  const url = new Map((signed ?? []).map((s: any) => [s.path, s.signedUrl]));
  const exportParams = new URLSearchParams();
  if (selectedYear) exportParams.set('year', selectedYear);
  for (const [key, value] of Object.entries({ q, class: classId, gender, status })) if (value) exportParams.set(key, value);
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams(exportParams);
    params.set('page', String(nextPage));
    return `/admin/students?${params}`;
  };

  return (
    <div className="stack">
      <PageHeading
        eyebrow="People"
        title="Students"
        subtitle="Register students, manage enrolments and keep official photos up to date."
        actions={<div className="toolbar">
          <Link href={`/api/students/export?${exportParams}`} className="btn btn-secondary btn-sm"><Download className="h-4 w-4" aria-hidden="true" /> Export CSV</Link>
          <Link href="/admin/students/import" className="btn btn-secondary btn-sm"><FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Bulk import</Link>
        </div>}
      />

      {saved && <Alert tone="success">{saved}</Alert>}
      {error && <Alert tone="error" role="alert">{error}</Alert>}
      {syncError && <Alert tone="error" role="alert">Could not sync students for teacher mark entry: {syncError}</Alert>}

      <SectionCard title="Register a student" subtitle="Admission numbers are generated automatically when left blank.">
        <form action={createStudent}>
          <div className="card-body grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="field"><label className="label" htmlFor="full_name">Full name</label><input id="full_name" name="full_name" placeholder="Student full name" required className="input" /></div>
            <div className="field"><label className="label" htmlFor="admission_no">Admission number</label><input id="admission_no" name="admission_no" placeholder="Auto-generated if blank" className="input" /></div>
            <div className="field"><label className="label" htmlFor="gender">Gender</label><select id="gender" name="gender" required className="select"><option value="">Select gender</option><option value="M">Male</option><option value="F">Female</option></select></div>
            <div className="field"><label className="label" htmlFor="date_of_birth">Date of birth</label><input id="date_of_birth" name="date_of_birth" type="date" className="input" /></div>
            <div className="field"><label className="label" htmlFor="place_of_birth">Place of birth</label><input id="place_of_birth" name="place_of_birth" placeholder="City" className="input" /></div>
            <div className="field"><label className="label" htmlFor="guardian_name">Parent / guardian</label><input id="guardian_name" name="guardian_name" placeholder="Full name" className="input" /></div>
            <div className="field"><label className="label" htmlFor="guardian_phone">Guardian phone</label><input id="guardian_phone" name="guardian_phone" placeholder="Phone number" className="input" /></div>
            <div className="field"><label className="label" htmlFor="class_id">Class</label><select id="class_id" name="class_id" required className="select"><option value="">Select class</option>{classes?.map((c) => <option key={c.id} value={c.id}>{c.name} {c.stream}</option>)}</select></div>
            <div className="field"><label className="label" htmlFor="academic_year_id">Academic year</label><select id="academic_year_id" name="academic_year_id" required defaultValue={selectedYear} className="select">{years?.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>)}</select>
</div>
          </div>
          <div className="card-footer"><button className="btn btn-primary btn-sm" type="submit">Register student</button></div>
        </form>
      </SectionCard>

      <form method="get" className="filter-bar">
        <div className="field min-w-[200px] flex-1">
          <label className="label" htmlFor="filter-q">Name or admission number</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input id="filter-q" name="q" defaultValue={q} placeholder="Name or admission number" className="input pl-10" />
          </div>
        </div>
        <div className="field min-w-[180px]">
          <label className="label" htmlFor="filter-class">Class</label>
          <select id="filter-class" name="class" defaultValue={classId ?? ''} className="select"><option value="">All classes</option>{classes?.map((c) => <option key={c.id} value={c.id}>{c.name} {c.stream}</option>)}</select>
        </div>
        <div className="field min-w-[160px]">
          <label className="label" htmlFor="filter-year">Academic year</label>
          <select id="filter-year" name="year" defaultValue={selectedYear} className="select"><option value="">All academic years</option>{years?.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
        </div>
        <div className="field min-w-[130px]">
          <label className="label" htmlFor="filter-gender">Gender</label>
          <select id="filter-gender" name="gender" defaultValue={gender ?? ''} className="select"><option value="">All</option><option value="M">Male</option><option value="F">Female</option></select>
        </div>
        <div className="field min-w-[130px]">
          <label className="label" htmlFor="filter-status">Status</label>
          <select id="filter-status" name="status" defaultValue={status ?? ''} className="select"><option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        </div>
        <button className="btn btn-secondary" type="submit"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filter</button>
      </form>

      <SectionCard title="Enrolled students" subtitle={`Showing ${visibleRows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–${(page - 1) * PAGE_SIZE + visibleRows.length}`}>
        {visibleRows.length ? (
          <ul className="divide-y divide-slate-100">
            {visibleRows.map((r: any) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50/60">
                <div className="flex min-w-0 items-center gap-3">
                  {url.get(r.students.photo_path)
                    ? /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={url.get(r.students.photo_path)} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" />
                    : <Avatar name={r.students.full_name} />}
                  <div className="min-w-0">
                    <p className="list-title truncate">{r.students.full_name}</p>
                    <p className="list-meta truncate">{r.students.admission_no} · {r.classes?.name} {r.classes?.stream}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.students.is_active ? 'active' : 'inactive'} />
                  <PhotoUpload studentId={r.students.id} currentUrl={url.get(r.students.photo_path) ?? null} />
                  <form action={toggleStudentStatus}>
                    <input type="hidden" name="id" value={r.students.id} />
                    <input type="hidden" name="active" value={String(r.students.is_active)} />
                    <ConfirmButton message={r.students.is_active ? 'Deactivate this student?' : 'Reactivate this student?'} className="btn btn-ghost btn-xs">
                      {r.students.is_active ? 'Deactivate' : 'Reactivate'}
                    </ConfirmButton>
                  </form>
                  {localAuth && (
                    <details className="basis-full">
                      <summary className="cursor-pointer text-xs font-semibold text-indigo-600">Move to another class</summary>
                      <form action={moveStudentEnrollment} className="mt-3 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="admission_no" value={r.students.admission_no} />
                        <div className="field min-w-[150px] flex-1">
                          <label className="label" htmlFor={`move-class-${r.students.id}`}>Class</label>
                          <select id={`move-class-${r.students.id}`} name="class_id" required className="select">
                            <option value="">Select class</option>
                            {(classes ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name} {c.stream}</option>)}
                          </select>
                        </div>
                        <div className="field min-w-[150px] flex-1">
                          <label className="label" htmlFor={`move-year-${r.students.id}`}>Academic year</label>
                            <select id={`move-year-${r.students.id}`} name="academic_year_id" required defaultValue={years?.find((y: any) => y.is_current)?.id ?? ''} className="select">
                              <option value="">Select year</option>
                              {(years ?? []).map((y: any) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>)}
                            </select>
                        </div>
                        <button className="btn btn-secondary btn-xs" type="submit">Move enrollment</button>
                      </form>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card-body"><EmptyState icon={Users} title="No students found" description="Try another search, or register a new student using the form above." /></div>
        )}
        {(page > 1 || hasNext) && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
            {page > 1 ? <Link href={pageHref(page - 1)} className="btn btn-secondary btn-sm">Previous</Link> : <span />}
            {hasNext && <Link href={pageHref(page + 1)} className="btn btn-secondary btn-sm">Next</Link>}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
