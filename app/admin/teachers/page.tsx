import { GraduationCap, UserPlus, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createTeacher, assignTeacher, toggleTeacherStatus, removeTeacherAssignment } from '../actions';
import ConfirmButton from '../../components/ConfirmButton';
import { Alert, Avatar, EmptyState, PageHeading, SectionCard, StatusBadge } from '../../components/ui';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { requireSchoolSession } from '@/lib/auth/session';
import { isSupabaseAdminConfigured, TEACHER_SCHEMA_MESSAGE, TEACHER_SETUP_MESSAGE } from '@/lib/supabase/config';
import { syncLocalTeachingStructure } from '@/lib/local-preview';

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await requireSchoolSession('school_admin');
  let configured = false;
  let setupMessage = TEACHER_SETUP_MESSAGE;
  let members: any[] = [];
  let cs: any[] = [];
  let assigns: any[] = [];
  let missingSchool = false;
  if (isSupabaseAdminConfigured()) {
    const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
    const { data: school, error: schoolError } = await sb.from('schools').select('id').eq('id', session.schoolId).maybeSingle();
    if (schoolError) {
      setupMessage = `${TEACHER_SCHEMA_MESSAGE} (${schoolError.message})`;
    } else if (!school) {
      missingSchool = true;
      setupMessage = `This app workspace has no school record yet (${session.schoolId}). Enter the school name in the teacher form below to create the workspace and account together.`;
    } else {
      const localSyncError = isLocalAuthEnabled() ? await syncLocalTeachingStructure(session.schoolId) : null;
      if (localSyncError) {
        setupMessage = `Could not prepare local classes and academic years: ${localSyncError}`;
      } else {
        const [memberResult, classSubjectResult, assignmentResult] = await Promise.all([
          sb.from('school_memberships').select('user_id,is_active,profiles(full_name,is_active)').eq('school_id', session.schoolId).eq('role', 'teacher'),
          sb.from('class_subjects').select('id,classes(name,stream),subjects(name),academic_years(name,is_current)').eq('school_id', session.schoolId).limit(300),
          sb.from('teacher_assignments').select('id,profiles:teacher_id(full_name),class_subjects(classes(name,stream),subjects(name))').eq('school_id', session.schoolId).limit(300),
        ]);
        const failedQuery = [memberResult, classSubjectResult, assignmentResult].find((result) => result.error);
        if (failedQuery?.error) {
          setupMessage = `${TEACHER_SCHEMA_MESSAGE} (${failedQuery.error.message})`;
        } else {
          members = memberResult.data ?? [];
          cs = classSubjectResult.data ?? [];
          assigns = assignmentResult.data ?? [];
          configured = true;
        }
      }
    }
  }

  return (
    <div className="stack">
      <PageHeading
        eyebrow="People"
        title="Teachers & assignments"
        subtitle="Create teacher accounts and assign them to class subjects."
      />
      {error && <Alert tone="error" role="alert">{error}</Alert>}
      {!configured && <Alert tone="warning" role="status">{setupMessage} Never share or commit the service-role key.</Alert>}
      {configured && isLocalAuthEnabled() && (
        <Alert tone="warning" role="status">
          Local admin sign-in is active. Teacher accounts are real Supabase users and can sign in with their Supabase email and password.
          {cs.length === 0 && ' No class subjects are assigned yet. Add a subject and assign it to a class on the Subjects & groups page first.'}
        </Alert>
      )}

      <SectionCard title="Create teacher account" subtitle="Share the temporary password privately with the teacher.">
        <form action={createTeacher}>
          <div className="card-body grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {missingSchool && <div className="field"><label className="label" htmlFor="school_name">School name</label><input id="school_name" name="school_name" placeholder="Your school name" required maxLength={160} disabled={!isSupabaseAdminConfigured()} className="input" /></div>}
            <div className="field"><label className="label" htmlFor="full_name">Full name</label><input id="full_name" name="full_name" placeholder="Full name" required disabled={!configured && !missingSchool} className="input" /></div>
            <div className="field"><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" placeholder="teacher@school.edu" required disabled={!configured && !missingSchool} className="input" /></div>
            <div className="field"><label className="label" htmlFor="password">Temporary password</label><input id="password" name="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" placeholder="8+ characters" required disabled={!configured && !missingSchool} className="input" /></div>
            <div className="flex items-end"><button className="btn btn-primary btn-block" type="submit" disabled={!isSupabaseAdminConfigured() || (!configured && !missingSchool)}><UserPlus className="h-4 w-4" aria-hidden="true" /> Create teacher</button></div>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Teacher accounts" subtitle={`${members?.length ?? 0} teacher${members?.length === 1 ? '' : 's'} configured`}>
        {members?.length ? (
          <ul className="divide-y divide-slate-100">
            {members.map((m: any) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <Avatar name={m.profiles?.full_name} />
                  <div>
                    <p className="list-title">{m.profiles?.full_name ?? 'Teacher'}</p>
                    <p className="list-meta">{m.profiles?.is_active ? 'Active' : 'Inactive'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={m.is_active ? 'active' : 'inactive'} />
                  <form action={toggleTeacherStatus}>
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <input type="hidden" name="active" value={String(m.is_active)} />
                    <ConfirmButton disabled={!configured} message={m.is_active ? 'Deactivate this teacher?' : 'Reactivate this teacher?'} className="btn btn-ghost btn-xs">
                      {m.is_active ? 'Deactivate' : 'Reactivate'}
                    </ConfirmButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : <div className="card-body"><EmptyState icon={Users} title="No teachers yet" description="Create a teacher account using the form above." /></div>}
      </SectionCard>

      <SectionCard title="Assign a teacher" subtitle="Link a teacher to a subject in a specific class.">
        <form action={assignTeacher}>
          <div className="card-body grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="field"><label className="label" htmlFor="teacher_id">Teacher</label><select id="teacher_id" name="teacher_id" required disabled={!configured} className="select"><option value="">Select teacher</option>{members?.map((m: any) => <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>)}</select></div>
            <div className="field"><label className="label" htmlFor="class_subject_id">Class & subject</label><select id="class_subject_id" name="class_subject_id" required disabled={!configured} className="select"><option value="">Select class - subject</option>{cs?.map((r: any) => <option key={r.id} value={r.id}>{r.classes?.name} {r.classes?.stream} - {r.subjects?.name} ({r.academic_years?.name})</option>)}</select></div>
            <div className="flex items-end"><button className="btn btn-primary btn-block" type="submit" disabled={!configured}><GraduationCap className="h-4 w-4" aria-hidden="true" /> Assign teacher</button></div>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Current assignments" subtitle={`${assigns?.length ?? 0} assignment${assigns?.length === 1 ? '' : 's'} configured`}>
        {assigns?.length ? (
          <ul className="divide-y divide-slate-100">
            {assigns.map((a: any) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50/60">
                <div className="flex items-center gap-3">
                  <Avatar name={a.profiles?.full_name} />
                  <div>
                    <p className="list-title">{a.profiles?.full_name ?? 'Teacher'}</p>
                    <p className="list-meta">{a.class_subjects?.classes?.name} {a.class_subjects?.classes?.stream} · {a.class_subjects?.subjects?.name}</p>
                  </div>
                </div>
                <form action={removeTeacherAssignment}>
                  <input type="hidden" name="id" value={a.id} />
                  <ConfirmButton disabled={!configured} message="Remove this teaching assignment?" className="btn btn-ghost btn-xs !text-red-600">Remove</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card-body"><EmptyState icon={Users} title="No assignments yet" description="Create a teacher account and assign them to a class subject above." /></div>
        )}
      </SectionCard>
    </div>
  );
}
