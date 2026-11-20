import Link from 'next/link';
import { ArrowLeft, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireSchoolSession } from '@/lib/auth/session';
import { importStudentsFromExcel } from '../../actions';
import { Alert, PageHeading, SectionCard } from '../../../components/ui';
import { resolveClasses, resolveYears } from '@/lib/local-preview';

export default async function StudentImportPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const session = await requireSchoolSession('school_admin');
  const sb = await createClient();

  const [{ data: classRows }, { data: yearRows }] = await Promise.all([
    sb.from('classes').select('id,name,stream').eq('school_id', session.schoolId).order('name'),
        sb.from('academic_years').select('id,name,is_current').eq('school_id', session.schoolId).order('name', { ascending: false }),
  ]);
  const classes = await resolveClasses(classRows);
  const years = await resolveYears(yearRows);
  const defaultYear =
 years?.find((y) => y.is_current)?.id ?? years?.[0]?.id;

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Students"
        title="Bulk student import"
        subtitle="Upload an Excel or CSV file to enroll students. Duplicate admission numbers are skipped."
        actions={<Link href="/admin/students" className="btn btn-secondary btn-sm"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to students</Link>}
      />

      {error && <Alert tone="error" role="alert">{error}</Alert>}
      {saved && <Alert tone="success">{saved}</Alert>}
      {!classes?.length && <Alert tone="warning">Create a class before importing students.</Alert>}

      <SectionCard title="Import details" subtitle="Choose the destination class and academic year, then select your spreadsheet.">
        <form action={importStudentsFromExcel} className="space-y-6 p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="class_id">Target class</label>
              <select id="class_id" name="class_id" required className="select">
                <option value="">Select class...</option>
                {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} {c.stream}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="academic_year_id">Academic year</label>
              <select id="academic_year_id" name="academic_year_id" required defaultValue={defaultYear} className="select">
                {(years ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="file">Spreadsheet file (.xlsx, .csv)</label>
            <input id="file" name="file" type="file" accept=".xlsx,.xls,.csv" required className="file-input" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600">
            <p className="mb-2 flex items-center gap-2 font-bold text-slate-800"><FileSpreadsheet className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Expected headers</p>
            <code className="block overflow-x-auto rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-[11px]">
              Full Name | Admission No | Gender | Date of Birth | Place of Birth | Guardian Name | Guardian Phone
            </code>
          </div>
          <button className="btn btn-primary btn-block" type="submit"><UploadCloud className="h-4 w-4" aria-hidden="true" /> Upload and enroll students</button>
        </form>
      </SectionCard>
    </div>
  );
}
