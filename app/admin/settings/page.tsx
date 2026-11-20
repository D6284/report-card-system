import { Building2, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { requireSchoolSession } from '@/lib/auth/session';
import { createGradingRule, deleteGradingRule, updateSchoolSettings } from '../actions';
import AssetUpload from './AssetUpload';
import { Alert, PageHeading, SectionCard } from '../../components/ui';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const session = await requireSchoolSession('school_admin');
  const localAuth = isLocalAuthEnabled();
  const sb = localAuth ? createAdminClient() : await createClient();

  const [{ data: school, error: schoolError }, { data: settings, error: settingsError }, { data: rules, error: rulesError }] = await Promise.all([
    sb.from('schools').select('*').eq('id', session.schoolId).maybeSingle(),
    sb.from('school_settings').select('*').eq('school_id', session.schoolId).maybeSingle(),
    sb.from('grading_rules').select('id,min_avg,max_avg,grade,remark,display_order').eq('school_id', session.schoolId).order('display_order'),
  ]);

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Configuration"
        title="School settings & branding"
        subtitle="Configure institutional identity, report headers, passing thresholds and grading bands."
      />

      {error && <Alert tone="error" role="alert">{error}</Alert>}
      {saved && <Alert tone="success">Settings updated successfully.</Alert>}
      {(schoolError || settingsError || rulesError) && <Alert tone="error" role="alert">
        Could not load all school settings: {[schoolError, settingsError, rulesError].filter(Boolean).map((queryError) => queryError?.message).join('; ')}
      </Alert>}
      {!school && (localAuth
        ? <Alert tone="info">This local workspace has not been initialized yet. Enter your school name and save to create its school profile and settings.</Alert>
        : <Alert tone="warning">No school profile is linked to this account. Contact a super administrator.</Alert>)}

      <form action={updateSchoolSettings} className="stack">
        <SectionCard title="Institutional identity" subtitle="These details appear on generated report cards.">
          <div className="card-body form-grid">
            <div className="field"><label className="label" htmlFor="name">School name</label><input id="name" name="name" defaultValue={school?.name ?? ''} required className="input" /></div>
            <div className="field"><label className="label" htmlFor="motto">Motto</label><input id="motto" name="motto" defaultValue={school?.motto ?? ''} className="input" /></div>
            <div className="field"><label className="label" htmlFor="location">Location / city</label><input id="location" name="location" defaultValue={school?.location ?? ''} className="input" /></div>
            <div className="field"><label className="label" htmlFor="address">Address</label><input id="address" name="address" defaultValue={school?.address ?? ''} className="input" /></div>
            <div className="field"><label className="label" htmlFor="phone">Contact phone</label><input id="phone" name="phone" defaultValue={school?.phone ?? ''} className="input" /></div>
            <div className="field"><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" defaultValue={school?.email ?? ''} className="input" /></div>
            <div className="field"><label className="label" htmlFor="website">Website</label><input id="website" name="website" type="url" defaultValue={school?.website ?? ''} className="input" /></div>
          </div>
        </SectionCard>

        <SectionCard title="Academic & evaluation rules" subtitle="Control how results are calculated and reported.">
          <div className="card-body space-y-5">
            <div className="form-grid">
              <div className="field"><label className="label" htmlFor="passing_average">Passing average (/20)</label><input id="passing_average" name="passing_average" type="number" step="0.01" min="0" max="100" defaultValue={settings?.passing_average ?? 10} required className="input" /></div>
              <div className="field"><label className="label" htmlFor="default_max_mark">Default maximum mark</label><input id="default_max_mark" name="default_max_mark" type="number" step="0.01" min="1" max="100" defaultValue={settings?.default_max_mark ?? 20} required className="input" /></div>
              <div className="field"><label className="label" htmlFor="ranking_policy">Ranking policy</label><select id="ranking_policy" name="ranking_policy" defaultValue={settings?.ranking_policy ?? 'competition'} className="select"><option value="competition">Competition (1st, 1st, 3rd)</option></select></div>
            </div>
            <div className="field"><label className="label" htmlFor="report_footer">Report footer</label><textarea id="report_footer" name="report_footer" rows={2} defaultValue={settings?.report_footer ?? ''} className="textarea" /></div>
            <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-500 md:grid-cols-3">
              <div>Logo: <span className="font-mono text-slate-700">{settings?.logo_path ?? school?.logo_path ?? 'not uploaded'}</span></div>
              <div>Signature: <span className="font-mono text-slate-700">{settings?.signature_path ?? 'not uploaded'}</span></div>
              <div>Stamp: <span className="font-mono text-slate-700">{settings?.stamp_path ?? 'not uploaded'}</span></div>
            </div>
          </div>
          <div className="card-footer"><button className="btn btn-primary btn-sm" type="submit"><Save className="h-4 w-4" aria-hidden="true" /> Save settings</button></div>
        </SectionCard>
      </form>

      <SectionCard title="Official report card assets" subtitle="Images are stored privately and embedded into generated PDFs.">
        <div className="card-body grid gap-4 md:grid-cols-3">
          <AssetUpload kind="logo" label="School logo" currentPath={school?.logo_path} />
          <AssetUpload kind="signature" label="Principal signature" currentPath={settings?.signature_path} />
          <AssetUpload kind="stamp" label="Official stamp" currentPath={settings?.stamp_path} />
        </div>
      </SectionCard>

      <SectionCard title="Grading bands" subtitle="Define the grade boundaries used across report cards.">
        <div className="table-wrap !rounded-none !border-0 !shadow-none">
          <table className="data-table">
            <thead><tr><th>Grade</th><th>Range</th><th>Remark</th><th>Order</th><th /></tr></thead>
            <tbody>
              {(rules ?? []).map((r) => (
                <tr key={r.id}>
                  <td><span className="badge badge-brand">{r.grade}</span></td>
                  <td>{Number(r.min_avg).toFixed(2)} – {Number(r.max_avg).toFixed(2)}</td>
                  <td>{r.remark ?? '—'}</td>
                  <td className="text-slate-500">{r.display_order}</td>
                  <td className="text-right">
                    <form action={deleteGradingRule}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="btn btn-ghost btn-xs !text-red-600" type="submit">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
              {!rules?.length && <tr><td colSpan={5} className="py-8 text-center text-sm text-slate-500">No grading bands configured yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <form action={createGradingRule} className="card-body grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input name="grade" placeholder="Grade" required className="input" aria-label="Grade" />
          <input name="min_avg" type="number" step="0.01" min="0" max="100" placeholder="Min" required className="input" aria-label="Minimum average" />
          <input name="max_avg" type="number" step="0.01" min="0" max="100" placeholder="Max" required className="input" aria-label="Maximum average" />
          <input name="remark" placeholder="Remark" className="input" aria-label="Remark" />
          <div className="flex gap-2">
            <input name="display_order" type="number" min="0" defaultValue={0} className="input w-20" aria-label="Display order" />
            <button className="btn btn-primary flex-1" type="submit"><Building2 className="h-4 w-4" aria-hidden="true" /> Add</button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
