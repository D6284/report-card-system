import { notFound } from 'next/navigation';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSchoolSession } from '@/lib/auth/session';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { reviewSubmission, reopenSubmission } from '../../actions';
import { Alert, BackLink, PageHeading, SectionCard, StatusBadge } from '../../../components/ui';

export default async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSchoolSession('school_admin');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { data: sub } = await sb.from('mark_submissions').select('id,status,rejection_reason,cycle_no,class_subject_id,class_subjects(max_mark,classes(name,stream),subjects(name)),sequences(seq_no,label),profiles:teacher_id(full_name)').eq('id', id).eq('school_id', session.schoolId).single();
  if (!sub) notFound();
  const { data: marks } = await sb.from('marks').select('state,value,remark,student_enrollments(students(full_name,admission_no))').eq('submission_id', id);
  const { data: logs } = await sb.from('approval_logs').select('created_at,from_status,to_status,reason,cycle_no').eq('submission_id', id).order('created_at');
  const cs: any = sub.class_subjects;
  const max = Number(cs.max_mark);
  const rows = (marks ?? []).map((m: any) => ({ ...m, name: m.student_enrollments?.students?.full_name, adm: m.student_enrollments?.students?.admission_no }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const missing = rows.filter((r) => r.state === 'missing').length;
  const bad = rows.filter((r) => r.state === 'entered' && (r.value < 0 || r.value > max)).length;
  const valid = !missing && !bad;

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Marks approval"
        title={`${cs.classes?.name} ${cs.classes?.stream ?? ''} · ${cs.subjects?.name}`}
        subtitle={`${(sub.sequences as any)?.label ?? `Sequence ${(sub.sequences as any)?.seq_no}`} · Submitted by ${(sub.profiles as any)?.full_name ?? 'Teacher'} · Cycle ${sub.cycle_no}`}
        actions={<BackLink href="/admin/approvals" label="All submissions" />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={sub.status} />
        <span className="badge badge-neutral">Maximum mark: {max}</span>
        <span className={`badge ${valid ? 'badge-success' : 'badge-danger'}`}>{rows.length} students · {missing} missing · {bad} out of range</span>
      </div>

      {!valid && <Alert tone="error" title="Review required">Resolve the missing or out-of-range marks before approving this submission.</Alert>}

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>No.</th><th>Admission</th><th>Student</th><th>Mark</th><th>Remark</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="text-slate-400">{i + 1}</td>
                <td className="text-xs text-slate-500">{r.adm}</td>
                <td className="font-medium text-slate-800">{r.name}</td>
                <td>
                  {r.state === 'entered'
                    ? <span className={`font-bold ${r.value < 0 || r.value > max ? 'text-red-600' : 'text-slate-900'}`}>{r.value}</span>
                    : <span className="badge badge-warning">{r.state.replaceAll('_', ' ')}</span>}
                </td>
                <td className="text-xs text-slate-500">{r.remark ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sub.status === 'submitted' && (
        <div className="grid gap-4 md:grid-cols-2">
          <form action={reviewSubmission} className="card card-body space-y-3">
            <input type="hidden" name="submission_id" value={id} />
            <input type="hidden" name="decision" value="approved" />
            <span className="quick-action-icon bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /></span>
            <p className="card-title">Approve all marks</p>
            <p className="card-subtitle">Confirm that every mark is valid and ready for reporting.</p>
            <button className="btn btn-primary btn-block" type="submit"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approve submission</button>
          </form>
          <form action={reviewSubmission} className="card card-body space-y-3">
            <input type="hidden" name="submission_id" value={id} />
            <input type="hidden" name="decision" value="rejected" />
            <span className="quick-action-icon bg-red-50 text-red-600"><XCircle className="h-5 w-5" aria-hidden="true" /></span>
            <p className="card-title">Request corrections</p>
            <label className="label" htmlFor="reason">Reason for rejection</label>
            <textarea id="reason" name="reason" required rows={3} placeholder="Explain what the teacher should correct" className="textarea" />
            <button className="btn btn-danger btn-block" type="submit"><XCircle className="h-4 w-4" aria-hidden="true" /> Reject submission</button>
          </form>
        </div>
      )}

      {sub.status === 'approved' && (
        <SectionCard title="Reopen for correction" subtitle="The teacher will be able to edit and resubmit these marks.">
          <form action={reopenSubmission} className="card-body grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="submission_id" value={id} />
            <div className="field"><label className="label" htmlFor="reopen_reason">Reason for reopening</label><textarea id="reopen_reason" name="reason" required rows={2} placeholder="Record the reason for this action" className="textarea" /></div>
            <button className="btn btn-secondary" type="submit"><RotateCcw className="h-4 w-4" aria-hidden="true" /> Reopen</button>
          </form>
        </SectionCard>
      )}

      <SectionCard title="Review history" subtitle="A complete audit trail for this submission.">
        <div className="card-body">
          {logs?.length ? (
            <ol className="timeline">
              {logs.map((l, i) => (
                <li key={i} className="timeline-item">
                  <p className="font-semibold text-slate-800">{l.from_status ?? 'Created'} → {l.to_status}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{new Date(l.created_at).toLocaleString()} · Cycle {l.cycle_no}{l.reason && ` · ${l.reason}`}</p>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-slate-500">No history recorded yet.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
