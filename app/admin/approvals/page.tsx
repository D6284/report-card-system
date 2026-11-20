import Link from 'next/link';
import { Inbox, ClipboardCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSchoolSession } from '@/lib/auth/session';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { Alert, EmptyState, PageHeading, SectionCard, StatusBadge } from '../../components/ui';

export default async function Approvals({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const { error, status = 'submitted' } = await searchParams;
  const session = await requireSchoolSession('school_admin');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { data } = await sb.from('mark_submissions').select('id,status,submitted_at,profiles:teacher_id(full_name),class_subjects(classes(name,stream),subjects(name)),sequences(seq_no,label)')
    .eq('school_id', session.schoolId).eq('status', status).order('submitted_at', { ascending: false }).limit(100);

  const tabs = [
    { key: 'submitted', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'reopened', label: 'Reopened' },
  ];

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Operations"
        title="Marks approval"
        subtitle="Review teacher submissions, approve results or request corrections."
      />
      {error && <Alert tone="error" role="alert">{error}</Alert>}

      <div className="toolbar" role="tablist" aria-label="Submission status">
        {tabs.map((tab) => (
          <Link key={tab.key} href={`?status=${tab.key}`} role="tab" aria-selected={tab.key === status}
            className={`chip ${tab.key === status ? 'chip-active' : 'chip-idle'}`}>
            {tab.label}
          </Link>
        ))}
      </div>

      <SectionCard title="Submissions" subtitle={`${data?.length ?? 0} record${data?.length === 1 ? '' : 's'} in this view`}>
        {data?.length ? (
          <ul className="divide-y divide-slate-100">
            {data.map((r: any) => (
              <li key={r.id}>
                <Link href={`/admin/approvals/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50/70">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><ClipboardCheck className="h-4 w-4" aria-hidden="true" /></span>
                    <div className="min-w-0">
                      <p className="list-title truncate">{r.class_subjects?.classes?.name}{r.class_subjects?.classes?.stream ? ` ${r.class_subjects.classes.stream}` : ''} · {r.class_subjects?.subjects?.name}</p>
                      <p className="list-meta truncate">{r.sequences?.label ?? `Sequence ${r.sequences?.seq_no}`} · {r.profiles?.full_name ?? 'Teacher'}{r.submitted_at && ` · ${new Date(r.submitted_at).toLocaleDateString()}`}</p>
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card-body"><EmptyState icon={Inbox} title="Nothing here" description="There are no submissions with this status right now." /></div>
        )}
      </SectionCard>
    </div>
  );
}
