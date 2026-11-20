import { BadgeCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireSchoolSession } from '@/lib/auth/session';
import { setDecision } from '../actions';
import { Alert, EmptyState, PageHeading, SectionCard, StatusBadge } from '../../components/ui';
import { resolveClasses } from '@/lib/local-preview';

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await requireSchoolSession('school_admin');
  const sb = await createClient();

  const [{ data: results }, { data: enrollments }, { data: students }, { data: classRows }, { data: history }] = await Promise.all([
    sb.from('student_annual_results').select('enrollment_id,annual_average,annual_position,auto_decision,manual_decision,manual_reason').eq('school_id', session.schoolId),
    sb.from('student_enrollments').select('id,student_id,class_id').eq('school_id', session.schoolId),
    sb.from('students').select('id,full_name,admission_no').eq('school_id', session.schoolId),
    sb.from('classes').select('id,name,stream').eq('school_id', session.schoolId),
        sb.from('audit_logs').select('id,action,entity,entity_id,new_value,created_at').eq('school_id', session.schoolId).eq('entity', 'student_annual_results').order('created_at', { ascending: false }).limit(50),
  ]);
  const classes = await resolveClasses(classRows);

  const enrollmentMap =
 new Map((enrollments ?? []).map((e: any) => [e.id as string, e]));
  const studentMap = new Map((students ?? []).map((s: any) => [s.id as string, s]));
  const classMap = new Map((classes ?? []).map((c: any) => [c.id as string, c]));
  const options = ['passed', 'failed', 'conditional', 'under_review'];

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Operations"
        title="Annual decisions"
        subtitle="Authorized overrides are stored separately from the automatic academic decision."
      />
      {error && <Alert tone="error" role="alert">{error}</Alert>}

      {!results?.length ? (
        <EmptyState icon={BadgeCheck} title="No annual results yet" description="Generate third-term report cards first to create annual results." />
      ) : (
        <SectionCard title="Student decisions" subtitle={`${results.length} result${results.length === 1 ? '' : 's'} available for review`}>
          <div className="table-wrap !rounded-none !border-0 !shadow-none">
            <table className="data-table">
              <thead><tr><th>Student</th><th>Class</th><th>Average</th><th>Automatic</th><th>Final decision</th><th>Reason</th><th>Override</th></tr></thead>
              <tbody>
                {results.map((r: any) => {
                  const enr: any = enrollmentMap.get(r.enrollment_id);
                  const stu: any = enr ? studentMap.get(enr.student_id) : null;
                  const cls: any = enr ? classMap.get(enr.class_id) : null;
                  const final = r.manual_decision ?? r.auto_decision;
                  return (
                    <tr key={r.enrollment_id}>
                      <td>
                        <p className="font-semibold text-slate-800">{stu?.full_name ?? 'Student'}</p>
                        <p className="text-xs text-slate-500">{stu?.admission_no}</p>
                      </td>
                      <td>{cls ? `${cls.name} ${cls.stream ?? ''}` : '—'}</td>
                      <td className="font-semibold text-slate-800">{r.annual_average === null ? '—' : Number(r.annual_average).toFixed(2)}</td>
                      <td><StatusBadge status={r.auto_decision ?? 'pending'} /></td>
                      <td><StatusBadge status={final ?? 'pending'} /></td>
                      <td className="max-w-[220px] text-xs text-slate-500">{r.manual_reason ?? '—'}</td>
                      <td>
                        <form action={setDecision} className="flex min-w-[230px] flex-col gap-2">
                          <input type="hidden" name="enrollment_id" value={r.enrollment_id} />
                          <select name="decision" defaultValue={r.manual_decision ?? r.auto_decision} className="select !py-1.5 !text-xs" aria-label="Decision">
                            {options.map((o) => <option key={o} value={o}>{o.replaceAll('_', ' ')}</option>)}
                          </select>
                          <div className="flex gap-2">
                            <input name="reason" placeholder="Reason (optional)" defaultValue={r.manual_reason ?? ''} className="input !py-1.5 !text-xs" aria-label="Reason" />
                            <button className="btn btn-primary btn-xs shrink-0" type="submit">Save</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Decision history" subtitle="Audit trail of changes to annual academic decisions">
        {history?.length ? (
          <ul className="divide-y divide-slate-100">
            {history.map((h: any) => {
              const enrollmentId = h.new_value?.enrollment_id;
              const enr: any = enrollmentId ? enrollmentMap.get(enrollmentId) : null;
              const stu: any = enr ? studentMap.get(enr.student_id) : null;
              return (
                <li key={h.id} className="px-5 py-3">
                  <p className="list-title">{stu?.full_name ?? 'Student'} · {h.action.toLowerCase()}</p>
                  <p className="list-meta">
                    {h.new_value?.manual_decision ? `Decision: ${h.new_value.manual_decision.replaceAll('_', ' ')} · ` : ''}
                    {h.created_at ? new Date(h.created_at).toLocaleString() : '—'}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : <div className="card-body"><EmptyState icon={BadgeCheck} title="No decision history yet" description="Decision overrides will be recorded here." /></div>}
      </SectionCard>
    </div>
  );
}
