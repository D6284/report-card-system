import Link from 'next/link';
import {
  ArrowUpRight, BarChart3, Calculator, CheckCircle2, ClipboardCheck, Clock3, FileText,
  GraduationCap, School, Users, XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSchoolSession } from '@/lib/auth/session';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { Avatar, EmptyState, PageHeading, SectionCard, StatCard } from '../components/ui';

export default async function AdminHome() {
  const session = await requireSchoolSession('school_admin');
  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const school = session.schoolId;

  const count = async (table: string, apply?: (q: any) => any) => {
    let query = sb.from(table).select('id', { count: 'exact', head: true }).eq('school_id', school);
    if (apply) query = apply(query);
    const { count: value } = await query;
    return value ?? 0;
  };

  const [students, classes, pending, approved, rejected, teachers, recentStudents, activity] = await Promise.all([
    count('students', (q) => q.eq('is_active', true)),
    count('classes', (q) => q.eq('is_active', true)),
    count('mark_submissions', (q) => q.eq('status', 'submitted')),
    count('mark_submissions', (q) => q.eq('status', 'approved')),
    count('mark_submissions', (q) => q.eq('status', 'rejected')),
    count('school_memberships', (q) => q.eq('role', 'teacher').eq('is_active', true)),
    sb.from('students').select('id,full_name,admission_no,created_at').eq('school_id', school).order('created_at', { ascending: false }).limit(5),
    sb.from('audit_logs').select('id,action,entity,created_at').eq('school_id', school).order('created_at', { ascending: false }).limit(5),
  ]);

  const stats = [
    { label: 'Active students', value: students, icon: Users, tone: 'brand' as const, note: 'Enrolled this year', href: '/admin/students' },
    { label: 'Classes', value: classes, icon: School, tone: 'info' as const, note: 'Currently active', href: '/admin/classes' },
    { label: 'Teachers', value: teachers, icon: GraduationCap, tone: 'brand' as const, note: 'Teaching staff', href: '/admin/teachers' },
    { label: 'Pending approval', value: pending, icon: Clock3, tone: 'warning' as const, note: 'Awaiting review', href: '/admin/approvals' },
    { label: 'Approved', value: approved, icon: CheckCircle2, tone: 'success' as const, note: 'Marks finalized', href: '/admin/approvals?status=approved' },
    { label: 'Rejected', value: rejected, icon: XCircle, tone: 'danger' as const, note: 'Need correction', href: '/admin/approvals?status=rejected' },
  ];

  const actions = [
    { href: '/admin/approvals', icon: ClipboardCheck, tone: 'bg-amber-50 text-amber-600', title: 'Review marks', text: `${pending} submission${pending === 1 ? '' : 's'} awaiting your decision.` },
    { href: '/admin/results', icon: Calculator, tone: 'bg-violet-50 text-violet-600', title: 'Calculate results', text: 'Bulk-calculate approved marks and generate report cards.' },
    { href: '/admin/reports', icon: FileText, tone: 'bg-indigo-50 text-indigo-600', title: 'Generate report cards', text: 'Produce official A4 PDFs from approved results.' },
    { href: '/admin/analytics', icon: BarChart3, tone: 'bg-emerald-50 text-emerald-600', title: 'View analytics', text: 'Analyse class, subject and sequence performance.' },
  ];

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Overview"
        title="School administration dashboard"
        subtitle="A live overview of your school's academic operations."
        actions={<span className="badge badge-success"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live data</span>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </div>

      <div>
        <p className="section-title mb-3">Quick actions</p>
        <div className="grid gap-4 md:grid-cols-3">
          {actions.map(({ href, icon: Icon, tone, title, text }, i) => (
            <Link key={href} href={href} className={`quick-action group animate-in ${['delay-1', 'delay-2', 'delay-3'][i] ?? ''}`}>
              <span className={`quick-action-icon ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <p className="quick-action-title">{title}</p>
              <p className="quick-action-text">{text}</p>
              <span className="quick-action-arrow">Open workspace <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Recent student registrations" subtitle="Latest students added to the school">
          {recentStudents.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {recentStudents.data.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={s.full_name} />
                  <div className="min-w-0">
                    <p className="list-title truncate">{s.full_name}</p>
                    <p className="list-meta truncate">{s.admission_no} · {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="card-body"><EmptyState icon={Users} title="No registrations yet" description="Students added through the Students page will appear here.
" /></div>}
        </SectionCard>
        <SectionCard title="Recent administrative activity" subtitle="Latest recorded changes">
          {activity.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {activity.data.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <p className="list-title">{a.action.replaceAll('_', ' ')}</p>
                  <p className="list-meta">{a.entity ?? 'system'} · {a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</p>
                </li>
              ))}
            </ul>
          ) : <div className="card-body"><EmptyState icon={ClipboardCheck} title="No activity yet" description="Administrative changes will be recorded here." /></div>}
        </SectionCard>
      </div>
    </div>
  );
}
