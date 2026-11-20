import Link from 'next/link';
import { ArrowRight, ClipboardList, School } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Alert, EmptyState, PageHeading } from '../components/ui';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { requireSchoolSession } from '@/lib/auth/session';
import { syncLocalTeachingStructure } from '@/lib/local-preview';

export default async function TeacherHome() {
  const session = await requireSchoolSession('teacher');
  const syncError = isLocalAuthEnabled() ? await syncLocalTeachingStructure(session.schoolId) : null;
  const sb = await createClient();
  const [{ data: assigns, error: assignmentError }, { data: seqs, error: sequenceError }] = await Promise.all([
    sb.from('teacher_assignments').select('class_subject_id,class_subjects(academic_year_id,classes(name,stream),subjects(name),academic_years(name,is_current))'),
    sb.from('sequences').select('id,seq_no,label,terms(academic_year_id)').eq('is_open', true).order('seq_no'),
  ]);
  const dashboardError = syncError ?? assignmentError?.message ?? sequenceError?.message;
  const assignments = assigns ?? [];

  return (
    <div className="stack">
      <PageHeading
        eyebrow="My workspace"
        title="My assignments"
        subtitle="Open sequences are shown below. Enter and submit marks for each class subject."
      />
      {dashboardError && <Alert tone="error" role="alert">Could not load mark-entry assignments: {dashboardError}</Alert>}

      {!dashboardError && assignments.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assignments yet" description="Ask your school administrator to assign you to a class subject." />
      ) : !dashboardError && (
        <div className="grid gap-4 md:grid-cols-2">
          {assignments.map((a: any) => {
            const cs = a.class_subjects;
            const open = (seqs ?? []).filter((q: any) => q.terms?.academic_year_id === cs.academic_year_id);
            return (
              <section key={a.class_subject_id} className="card animate-in">
                <div className="card-header">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><School className="h-5 w-5" aria-hidden="true" /></span>
                    <div>
                      <h2 className="card-title">{cs.classes.name} {cs.classes.stream} · {cs.subjects.name}</h2>
                      <p className="card-subtitle">{cs.academic_years.name}{cs.academic_years.is_current ? ' · Current year' : ''}</p>
                    </div>
                  </div>
                </div>
                <div className="card-body flex flex-wrap gap-2">
                  {open.length === 0
                    ? <p className="text-sm text-slate-500">No sequence is currently open for marks.</p>
                    : open.map((q: any) => (
                      <Link key={q.id} href={`/teacher/marks/${a.class_subject_id}/${q.id}`} className="btn btn-primary btn-sm">
                        Enter {q.label ?? `Sequence ${q.seq_no}`} marks <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
