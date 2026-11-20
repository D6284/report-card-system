import { BookOpen, Layers3, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSubject, createGroup, assignSubject, deleteSubject } from '../actions';
import ConfirmButton from '../../components/ConfirmButton';
import { Alert, EmptyState, PageHeading, SectionCard } from '../../components/ui';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { requireSchoolSession } from '@/lib/auth/session';
import { syncLocalTeachingStructure } from '@/lib/local-preview';

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const session = await requireSchoolSession('school_admin');
  const localSyncError = isLocalAuthEnabled() ? await syncLocalTeachingStructure(session.schoolId) : null;
  const [{ data: subjects }, { data: groups }, { data: classRows }, { data: yearRows }, { data: cs }] = await Promise.all([
    sb.from('subjects').select('id,name,code,class_subjects(classes(name,stream),academic_years(name))').eq('school_id', session.schoolId).order('name'),
    sb.from('subject_groups').select('id,name').eq('school_id', session.schoolId).order('display_order'),
    sb.from('classes').select('id,name,stream').eq('school_id', session.schoolId).order('name'),
    sb.from('academic_years').select('id,name,is_current').eq('school_id', session.schoolId).order('name', { ascending: false }),
    sb.from('class_subjects').select('id,coefficient,max_mark,classes(name,stream),subjects(name),subject_groups(name),academic_years(name)').eq('school_id', session.schoolId).limit(200),
  ]);
  const classes = classRows ?? [];
  const years = yearRows ?? [];

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Structure"
        title="Subjects & groups"
        subtitle="Maintain the subject catalogue and assign subjects to classes with coefficients."
      />
      {error && <Alert tone="error" role="alert">{error}</Alert>}
      {localSyncError && <Alert tone="error" role="alert">Could not prepare local classes and academic years: {localSyncError}</Alert>}

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="New subject" subtitle="Add a subject to the school catalogue.">
          <form action={createSubject} className="card-body flex gap-3">
            <div className="field flex-1"><label className="label" htmlFor="subject_name">Subject name</label><input id="subject_name" name="name" placeholder="e.g. Mathematics" required className="input" /></div>
            <div className="field w-28"><label className="label" htmlFor="subject_code">Code</label><input id="subject_code" name="code" placeholder="MTH" className="input" /></div>
            <div className="flex items-end"><button className="btn btn-primary" type="submit"><Plus className="h-4 w-4" aria-hidden="true" /> Add</button></div>
          </form>
        </SectionCard>
        <SectionCard title="New subject group" subtitle="Group related subjects for reporting.">
          <form action={createGroup} className="card-body flex flex-wrap gap-3">
            <div className="field min-w-[160px] flex-1"><label className="label" htmlFor="group_name">Group name</label><input id="group_name" name="name" placeholder="e.g. Science group" required className="input" /></div>
            <div className="field w-20"><label className="label" htmlFor="display_order">Order</label><input id="display_order" name="display_order" type="number" defaultValue={0} className="input" /></div>
            <div className="flex items-end"><button className="btn btn-primary" type="submit"><Layers3 className="h-4 w-4" aria-hidden="true" /> Add</button></div>
          </form>
        </SectionCard>
      </div>

      <SectionCard title="Subject catalogue" subtitle={`${subjects?.length ?? 0} subject${subjects?.length === 1 ? '' : 's'} configured`}>
        {subjects?.length ? (
          <ul className="divide-y divide-slate-100">
            {subjects.map((s: any) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="list-title">{s.name} {s.code && <span className="ml-1 text-xs font-semibold text-indigo-600">{s.code}</span>}</p>
                  <p className="list-meta">{(s.class_subjects ?? []).length ? (s.class_subjects ?? []).map((cs: any) => `${cs.classes?.name} ${cs.classes?.stream ?? ''} (${cs.academic_years?.name})`.trim()).join(' · ') : 'Not assigned to any class'}</p>
                </div>
                <form action={deleteSubject}>
                  <input type="hidden" name="id" value={s.id} />
                  <ConfirmButton message="Delete this subject? Only allowed when it has no class assignments." className="btn btn-ghost btn-xs !text-red-600"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        ) : <div className="card-body"><EmptyState icon={BookOpen} title="No subjects yet" description="Add a subject using the form above." /></div>}
      </SectionCard>

      <SectionCard title="Assign subject to class" subtitle="Coefficients and maximum marks drive the calculation engine.">
        <form action={assignSubject}>
          <div className="card-body grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="field"><label className="label" htmlFor="class_id">Class</label><select id="class_id" name="class_id" required className="select"><option value="">Select class</option>{classes?.map((c) => <option key={c.id} value={c.id}>{c.name} {c.stream}</option>)}</select></div>
            <div className="field"><label className="label" htmlFor="academic_year_id">Academic year</label><select id="academic_year_id" name="academic_year_id" required className="select">{years?.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}</select></div>
            <div className="field"><label className="label" htmlFor="subject_id">Subject</label><select id="subject_id" name="subject_id" required className="select"><option value="">Select subject</option>{subjects?.map((s: any) => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
</select></div>
            <div className="field"><label className="label" htmlFor="group_id">Group</label><select id="group_id" name="group_id" className="select"><option value="">No group</option>{groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
            <div className="field"><label className="label" htmlFor="coefficient">Coefficient</label><input id="coefficient" name="coefficient" type="number" step="0.5" placeholder="e.g. 2" required className="input" /></div>
            <div className="field"><label className="label" htmlFor="max_mark">Maximum mark</label><input id="max_mark" name="max_mark" type="number" defaultValue={20} className="input" /></div>
            <div className="flex items-end sm:col-span-2 lg:col-span-2"><button className="btn btn-primary btn-block" type="submit"><BookOpen className="h-4 w-4" aria-hidden="true" /> Assign subject</button></div>
          </div>
        </form>
      </SectionCard>

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Class</th><th>Year</th><th>Subject</th><th>Group</th><th>Coefficient</th><th>Max mark</th></tr></thead>
          <tbody>
            {(cs ?? []).map((r: any) => (
              <tr key={r.id}>
                <td className="font-medium text-slate-800">{r.classes?.name} {r.classes?.stream}</td>
                <td>{r.academic_years?.name}</td>
                <td>{r.subjects?.name}</td>
                <td>{r.subject_groups?.name ?? <span className="text-slate-400">—</span>}</td>
                <td>{r.coefficient}</td>
                <td>{r.max_mark}</td>
              </tr>
            ))}
            {!cs?.length && <tr><td colSpan={6} className="py-10 text-center"><EmptyState icon={BookOpen} title="No subjects assigned" description="Assign a subject to a class using the form above." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
