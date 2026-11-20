import { Plus, School, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { assignClassTeacher, clearClassTeacher, createClass, deleteClass } from '../actions';
import ConfirmButton from '../../components/ConfirmButton';
import { Alert, EmptyState, PageHeading, SectionCard } from '../../components/ui';
import { resolveClasses } from '@/lib/local-preview';

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const sb = await createClient();
  const [{ data: classRows }, { data: teachers }] = await Promise.all([
    sb.from('classes').select('id,name,stream,class_teacher_id,profiles:class_teacher_id(full_name),student_enrollments(count),class_subjects(count)').order('level_order').order('name'),
    sb.from('school_memberships').select('user_id,profiles(full_name)').eq('role', 'teacher').eq('is_active', true),
  ]);
  const classes = await resolveClasses(classRows);

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Structure"
        title="Classes"
        subtitle="Create and organise the classes used across academic years."
      />
      {error && <Alert tone="error" role="alert">{error}</Alert>}

      <SectionCard title="Add a class" subtitle="Use a descriptive name and an optional stream identifier.">
        <form action={createClass} className="card-body flex flex-col gap-3 sm:flex-row">
          <div className="field flex-1"><label className="label" htmlFor="name">Class name</label><input id="name" name="name" placeholder="e.g. Form 5 Science" required className="input" /></div>
          <div className="field flex-1"><label className="label" htmlFor="stream">Stream</label><input id="stream" name="stream" placeholder="Optional, e.g. A" className="input" /></div>
          <div className="flex items-end"><button className="btn btn-primary" type="submit"><Plus className="h-4 w-4" aria-hidden="true" /> Add class</button></div>
        </form>
      </SectionCard>

      <SectionCard title="All classes" subtitle={`${classes?.length ?? 0} class${classes?.length === 1 ? '' : 'es'} configured`}>
        {classes?.length ? (
          <ul className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((c: any) => {
              const enrolled = c.student_enrollments?.[0]?.count ?? 0;
              const subjects = c.class_subjects?.[0]?.count ?? 0;
              return (
                <li key={c.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><School className="h-4 w-4" aria-hidden="true" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800">{c.name}</span>
                      <span className="block text-xs text-slate-500">{c.stream ? `Stream ${c.stream}` : 'No stream'} · {enrolled} students · {subjects} subjects</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={assignClassTeacher} className="flex min-w-0 flex-1 items-center gap-2">
                      <input type="hidden" name="class_id" value={c.id} />
                      <select name="teacher_id" required defaultValue={c.class_teacher_id ?? ''} className="select !h-9 !py-0 text-xs">
                        <option value="">Assign teacher</option>
                        {teachers?.map((t: any) => <option key={t.user_id} value={t.user_id}>{t.profiles?.full_name}</option>)}
                      </select>
                      <button className="btn btn-secondary btn-xs" type="submit">Save</button>
                    </form>
                    {c.class_teacher_id && (
                      <form action={clearClassTeacher}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmButton message="Clear this class teacher?" className="btn btn-ghost btn-xs">Clear</ConfirmButton>
                      </form>
                    )}
                    <form action={deleteClass}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmButton message="Delete this class? Only allowed when it has no students or subject assignments." className="btn btn-ghost btn-xs !text-red-600"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></ConfirmButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="card-body"><EmptyState icon={School} title="No classes yet" description="Add your first class using the form above." /></div>
        )}
      </SectionCard>
    </div>
  );
}
