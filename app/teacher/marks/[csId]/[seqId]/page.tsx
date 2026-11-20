import { notFound } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import MarksTable, { type Row } from './MarksTable';
import { Alert, BackLink, PageHeading, StatusBadge } from '../../../../components/ui';

export default async function MarksPage({ params }: { params: Promise<{ csId: string; seqId: string }> }) {
  const { csId, seqId } = await params;
  const sb = await createClient();
  const { data: cs } = await sb.from('class_subjects').select('id,class_id,academic_year_id,max_mark,classes(name,stream),subjects(name)').eq('id', csId).single();
  const { data: seq } = await sb.from('sequences').select('id,seq_no,label,is_open').eq('id', seqId).single();
  if (!cs || !seq) notFound();
  const { data: enr } = await sb.from('student_enrollments').select('id,students(full_name,admission_no)').eq('class_id', cs.class_id).eq('academic_year_id', cs.academic_year_id).eq('status', 'active');
  const { data: sub } = await sb.from('mark_submissions').select('id,status,rejection_reason,submitted_at').eq('class_subject_id', csId).eq('sequence_id', seqId).maybeSingle();
  const { data: marks } = sub ? await sb.from('marks').select('enrollment_id,state,value,remark').eq('submission_id', sub.id) : { data: [] as any[] };
  const byEnr = new Map((marks ?? []).map((m: any) => [m.enrollment_id, m]));
  const rows: Row[] = (enr ?? []).map((e: any) => {
    const m: any = byEnr.get(e.id);
    return { enrollmentId: e.id, adm: e.students.admission_no, name: e.students.full_name, state: m?.state ?? 'missing', value: m?.value != null ? String(m.value) : '', remark: m?.remark ?? '' };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const status = sub?.status ?? 'draft';
  const locked = !seq.is_open || !['draft', 'rejected', 'reopened'].includes(status);
  const c: any = cs;

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Mark entry"
        title={`${c.classes.name}${c.classes.stream ? ` ${c.classes.stream}` : ''} · ${c.subjects.name}`}
        subtitle={`${seq.label ?? `Sequence ${seq.seq_no}`} · Maximum mark ${cs.max_mark}`}
        actions={<BackLink href="/teacher/submissions" label="My submissions" />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status === 'submitted' ? 'pending' : status} />
        {!seq.is_open && <span className="badge badge-warning">Assessment closed</span>}
        <span className="badge badge-neutral"><BookOpen className="h-3 w-3" aria-hidden="true" /> {rows.length} students</span>
      </div>
      {sub?.status === 'rejected' && <Alert tone="error" title="Rejected — corrections required">{sub.rejection_reason}. Correct the marks and submit again.</Alert>}
      {sub?.status === 'reopened' && <Alert tone="info" title="Reopened for correction">{sub.rejection_reason}</Alert>}
      {!seq.is_open && <Alert tone="warning">This assessment is closed. Marks cannot be edited.</Alert>}
      {rows.length === 0 && <Alert tone="info">No students are enrolled in this class for this academic year. Ask the administrator to move the student to this class and year on the Students page.</Alert>}
      <MarksTable classSubjectId={csId} sequenceId={seqId} max={Number(cs.max_mark)} rows={rows} status={status} submittedAt={sub?.submitted_at ?? null} locked={locked} />
    </div>
  );
}
