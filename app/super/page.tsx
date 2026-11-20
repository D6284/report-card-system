import { Building2, CheckCircle2, Plus, School, Users } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSchool, toggleSchoolStatus } from './actions';
import { Alert, EmptyState, PageHeading, SectionCard, StatCard } from '../components/ui';

export default async function SuperDashboard({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireRole('super_admin');
  const { error, saved } = await searchParams;
  const admin = createAdminClient();

  const [{ data: schools }, { data: memberships }, { data: students }] = await Promise.all([
    admin.from('schools').select('id,name,location,is_active,created_at').order('name'),
    admin.from('school_memberships').select('school_id,role,is_active,profiles(full_name)'),
    admin.from('students').select('school_id').eq('is_active', true),
  ]);

  const adminsBySchool = new Map<string, string[]>();
  (memberships ?? []).filter((m: any) => m.role === 'school_admin' && m.is_active).forEach((m: any) => {
    adminsBySchool.set(m.school_id, [...(adminsBySchool.get(m.school_id) ?? []), m.profiles?.full_name ?? 'Administrator']);
  });
  const studentsBySchool = new Map<string, number>();
  (students ?? []).forEach((s: any) => studentsBySchool.set(s.school_id, (studentsBySchool.get(s.school_id) ?? 0) + 1));
  const activeCount = (schools ?? []).filter((s: any) => s.is_active).length;

  return (
    <div className="stack">
      <PageHeading
        eyebrow="System administration"
        title="Schools"
        subtitle="Create and manage schools from the system administration workspace."
        actions={<span className="badge badge-brand">{schools?.length ?? 0} schools</span>}
      />
      {error && <Alert tone="error" role="alert">{error}</Alert>}
      {saved && <Alert tone="success">School created successfully.</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total schools" value={schools?.length ?? 0} icon={School} tone="brand" />
        <StatCard label="Active schools" value={activeCount} icon={CheckCircle2} tone="success" />
        <StatCard label="Students" value={students?.length ?? 0} icon={Users} tone="info" />
      </div>

      <SectionCard title="Registered schools" subtitle="Monitor school status, administrators and student counts.">
        {schools?.length ? (
          <div className="table-wrap !rounded-none !border-0 !shadow-none">
            <table className="data-table">
              <thead><tr><th>School</th><th>Location</th><th>Administrators</th><th>Students</th><th>Status</th><th /></tr></thead>
              <tbody>
                {schools.map((school: any) => (
                  <tr key={school.id}>
                    <td><p className="font-semibold text-slate-800">{school.name}</p><p className="text-xs text-slate-500">Created {new Date(school.created_at).toLocaleDateString()}</p></td>
                    <td>{school.location ?? '—'}</td>
                    <td>{(adminsBySchool.get(school.id) ?? []).join(', ') || <span className="text-slate-400">None</span>}</td>
                    <td>{studentsBySchool.get(school.id) ?? 0}</td>
                    <td><span className={`badge ${school.is_active ? 'badge-success' : 'badge-danger'}`}>{school.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="text-right">
                      <form action={toggleSchoolStatus}>
                        <input type="hidden" name="id" value={school.id} />
                        <input type="hidden" name="is_active" value={String(school.is_active)} />
                        <button className="btn btn-ghost btn-xs" type="submit">{school.is_active ? 'Deactivate' : 'Activate'}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card-body"><EmptyState icon={Building2} title="No schools yet" description="Create your first school using the form below." /></div>
        )}
      </SectionCard>

      <SectionCard title="Create school & first administrator" subtitle="An account and temporary credentials are created automatically.">
        <form action={createSchool}>
          <div className="card-body form-grid">
            <div className="field"><label className="label" htmlFor="name">School name</label><input id="name" name="name" required className="input" placeholder="e.g. Greenfield Secondary" /></div>
            <div className="field"><label className="label" htmlFor="location">Location</label><input id="location" name="location" className="input" placeholder="City" /></div>
            <div className="field"><label className="label" htmlFor="admin_name">Administrator name</label><input id="admin_name" name="admin_name" required className="input" /></div>
            <div className="field"><label className="label" htmlFor="admin_email">Administrator email</label><input id="admin_email" name="admin_email" type="email" required className="input" placeholder="admin@school.edu" /></div>
            <div className="field sm:col-span-2 lg:col-span-3"><label className="label" htmlFor="admin_password">Temporary password</label><input id="admin_password" name="admin_password" type="password" minLength={8} required className="input" placeholder="At least 8 characters" /></div>
          </div>
          <div className="card-footer"><button className="btn btn-primary btn-sm" type="submit"><Plus className="h-4 w-4" aria-hidden="true" /> Create school</button></div>
        </form>
      </SectionCard>
    </div>
  );
}
