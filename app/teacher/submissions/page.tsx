import Link from 'next/link';
import { ArrowRight, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Alert, EmptyState, PageHeading, SectionCard, StatusBadge } from '../../components/ui';

const PAGE_SIZE = 100;

export default async function MySubmissions({ searchParams }: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, Math.floor(2147483647 / PAGE_SIZE))
    : 1;
  const sb = await createClient();
  const { data } = await sb.from('mark_submissions')
    .select('id,status,rejection_reason,submitted_at,class_subject_id,sequence_id,class_subjects(classes(name,stream),subjects(name)),sequences(seq_no,label)')
    .order('submitted_at', { ascending: false, nullsFirst: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rows = data ?? [];
  const hasNext = rows.length > PAGE_SIZE;
  const submissions = rows.slice(0, PAGE_SIZE);

  return (
    <div className="stack">
      <PageHeading
        eyebrow="My workspace"
        title="My submissions"
        subtitle="Track the approval status of the marks you have submitted."
      />
      <SectionCard title="Submission history" subtitle={`Showing ${submissions.length ? (page - 1) * PAGE_SIZE + 1 : 0}–${(page - 1) * PAGE_SIZE + submissions.length}`}>
        {submissions.length ? (
          <ul className="divide-y divide-slate-100">
            {submissions.map((r: any) => (
              <li key={r.id} className="px-5 py-4 transition hover:bg-slate-50/60">
                <Link href={`/teacher/marks/${r.class_subject_id}/${r.sequence_id}`} className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Send className="h-4 w-4" aria-hidden="true" /></span>
                    <div className="min-w-0">
                      <p className="list-title truncate">{r.class_subjects?.classes?.name}{r.class_subjects?.classes?.stream ? ` ${r.class_subjects.classes.stream}` : ''} · {r.class_subjects?.subjects?.name}</p>
                      <p className="list-meta">{r.sequences?.label ?? `Sequence ${r.sequences?.seq_no}`}{r.submitted_at && ` · ${new Date(r.submitted_at).toLocaleDateString()}`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={r.status === 'submitted' ? 'pending' : r.status} />
                    <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </div>
                </Link>
                {r.rejection_reason && (
                  <div className="mt-3"><Alert tone="error" title="Administrator feedback">{r.rejection_reason}</Alert></div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="card-body">
            <EmptyState icon={Send}
              title={page > 1 ? 'No submissions on this page' : 'No submissions yet'}
              description={page > 1 ? 'Go to the previous page to see earlier submissions.' : 'Marks you submit for approval will appear here.'} />
          </div>
        )}
        {(page > 1 || hasNext) && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
            {page > 1 ? <Link href={`/teacher/submissions?page=${page - 1}`} className="btn btn-secondary btn-sm">Previous</Link> : <span />}
            {hasNext && <Link href={`/teacher/submissions?page=${page + 1}`} className="btn btn-secondary btn-sm">Next</Link>}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
