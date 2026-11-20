import { Activity } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { EmptyState, PageHeading, SectionCard } from '../../components/ui';

export default async function SystemActivityPage() {
  await requireRole('super_admin');
  const admin = createAdminClient();
  const [{ data: logs }, { data: profiles }] = await Promise.all([
    admin.from('audit_logs').select('id,school_id,actor_id,action,entity,entity_id,created_at').order('created_at', { ascending: false }).limit(100),
    admin.from('profiles').select('id,full_name'),
  ]);
  const actor = new Map((profiles ?? []).map((p: any) => [p.id as string, p.full_name as string]));

  return (
    <div className="stack">
      <PageHeading
        eyebrow="System administration"
        title="System activity"
        subtitle="Most recent audited changes across all schools."
        actions={<span className="badge badge-brand">Last {logs?.length ?? 0} events</span>}
      />
      <SectionCard title="Audit log" subtitle="Newest events appear first.">
        {logs?.length ? (
          <div className="table-wrap !rounded-none !border-0 !shadow-none">
            <table className="data-table">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>School</th></tr></thead>
              <tbody>
                {logs.map((log: any) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="font-medium text-slate-700">{actor.get(log.actor_id) ?? 'System'}</td>
                    <td><span className="badge badge-neutral">{log.action}</span></td>
                    <td>{log.entity ?? '—'}</td>
                    <td className="font-mono text-xs text-slate-500">{log.school_id ?? 'system'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card-body"><EmptyState icon={Activity} title="No activity recorded" description="Audited changes will appear here as the system is used." /></div>
        )}
      </SectionCard>
    </div>
  );
}
