import { CalendarDays, Check, Lock, Unlock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { requireSchoolSession } from '@/lib/auth/session';
import { addAssessmentSequence, closeYear, createAcademicYear, saveAnnualTermWeight, saveSequenceAssessment, setCurrentYear, toggleSequence, toggleTerm } from '../actions';
import ConfirmButton from '../../components/ConfirmButton';
import { Alert, EmptyState, PageHeading, SectionCard } from '../../components/ui';
import { resolveYears } from '@/lib/local-preview';
import { syncLocalTeachingStructure } from '@/lib/local-preview';

export default async function YearsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await requireSchoolSession('school_admin');
  const localAuth = isLocalAuthEnabled();
  const syncError = localAuth ? await syncLocalTeachingStructure(session.schoolId) : null;
  const sb = localAuth ? createAdminClient() : await createClient();
  const { data: yearRows, error: yearError } = await sb.from('academic_years')
    .select('id,name,is_current,starts_on,ends_on,terms(id,term_no,is_open,annual_weight,sequences(id,seq_no,is_open,label,weight))')
    .eq('school_id', session.schoolId).order('name', { ascending: false });
  const years = isLocalAuthEnabled() ? yearRows ?? [] : await resolveYears(yearRows);

  return (
    <div className="stack">
      <PageHeading
        eyebrow="Structure"
        title="Academic years"
        subtitle="Configure the assessment components and their weights for each term. The weighted average is used; no separate exam is assumed. Report cards support up to four components per term to keep the A4 table readable."
      />
      {error && <Alert tone="error" role="alert">{error}</Alert>}
      {syncError && <Alert tone="error" role="alert">{syncError}</Alert>}
      {yearError && <Alert tone="error" role="alert">{yearError.message}</Alert>}

      <SectionCard title="Create academic year" subtitle="Three terms are created. Add the assessment components your school uses to each term.">
        <form action={createAcademicYear} className="card-body grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="field"><label className="label" htmlFor="name">Year name</label><input id="name" name="name" placeholder="2026/2027" required className="input" /></div>
          <div className="field"><label className="label" htmlFor="starts_on">Start date</label><input id="starts_on" name="starts_on" type="date" className="input" /></div>
          <div className="field"><label className="label" htmlFor="ends_on">End date</label><input id="ends_on" name="ends_on" type="date" className="input" /></div>
          <div className="flex items-end"><button className="btn btn-primary btn-block" type="submit"><CalendarDays className="h-4 w-4" aria-hidden="true" /> Create year</button></div>
        </form>
      </SectionCard>

      {years?.length ? years.map((y: any) => {
        const sequences = (y.terms ?? []).flatMap((t: any) => t.sequences ?? []).sort((a: any, b: any) => a.seq_no - b.seq_no);
        return (
          <SectionCard key={y.id} className="animate-in"
            title={<span className="flex items-center gap-2">{y.name}{y.is_current && <span className="badge badge-success">Current</span>}</span>}
            subtitle={`${(y.terms ?? []).length} terms · ${sequences.length} assessment sequences${y.starts_on ? ` · ${y.starts_on}` : ''}${y.ends_on ? ` to ${y.ends_on}` : ''}`}
            actions={!y.is_current ? (
              <form action={setCurrentYear}>
                <input type="hidden" name="id" value={y.id} />
                <button className="btn btn-secondary btn-xs"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Set current</button>
              </form>
            ) : undefined}>
            <div className="card-body flex flex-wrap gap-2">
              {(y.terms ?? []).map((t: any) => (
                <div key={t.id} className="w-full rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <form action={toggleTerm}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="open" value={String(!t.is_open)} />
                      <button className={`chip ${t.is_open ? 'btn-soft !text-emerald-700 ring-1 ring-inset ring-emerald-200' : 'chip-idle'}`}>
                        {t.is_open ? <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                        Term {t.term_no} · {t.is_open ? 'Open' : 'Closed'}
                      </button>
                    </form>
                    <form action={saveAnnualTermWeight} className="flex items-end gap-2">
                      <input type="hidden" name="id" value={t.id} />
                      <label className="field text-xs"><span className="label">Annual weight</span><input name="annual_weight" type="number" min="0.01" max="100" step="0.01" required defaultValue={t.annual_weight ?? 1} className="input !w-24 !py-1.5" /></label>
                      <button className="btn btn-secondary btn-xs">Save</button>
                    </form>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {(t.sequences ?? []).sort((a: any, b: any) => a.seq_no - b.seq_no).map((q: any) => (
                      <div key={q.id} className="rounded-lg bg-slate-50 p-2">
                        <form action={saveSequenceAssessment} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={q.id} />
                          <label className="field min-w-[130px] flex-1 text-xs"><span className="label">Assessment name</span><input name="label" maxLength={40} required defaultValue={q.label ?? `Sequence ${q.seq_no}`} className="input !py-1.5" /></label>
                          <label className="field text-xs"><span className="label">Weight</span><input name="weight" type="number" min="0.01" max="100" step="0.01" required defaultValue={q.weight ?? 1} className="input !w-20 !py-1.5" /></label>
                          <button className="btn btn-secondary btn-xs">Save</button>
                        </form>
                        <form action={toggleSequence} className="mt-2">
                          <input type="hidden" name="id" value={q.id} />
                          <input type="hidden" name="open" value={String(!q.is_open)} />
                          <button className={`chip ${q.is_open ? 'btn-soft !text-indigo-700 ring-1 ring-inset ring-indigo-200' : 'chip-idle'}`}>
                            {q.is_open ? <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                            {q.label ?? `Sequence ${q.seq_no}`} · {q.is_open ? 'Open' : 'Closed'}
                          </button>
                        </form>
                      </div>
                    ))}
                    <form action={addAssessmentSequence} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-300 p-2">
                      <input type="hidden" name="term_id" value={t.id} />
                      <label className="field min-w-[130px] flex-1 text-xs"><span className="label">Add assessment</span><input name="label" maxLength={40} required placeholder="e.g. Continuous assessment" className="input !py-1.5" /></label>
                      <label className="field text-xs"><span className="label">Weight</span><input name="weight" type="number" min="0.01" max="100" step="0.01" defaultValue="1" required className="input !w-20 !py-1.5" /></label>
                      <button className="btn btn-secondary btn-xs">Add</button>
                    </form>
                  </div>
                </div>
              ))}
              {!sequences.length && <p className="text-sm text-slate-500">No sequences configured for this year.</p>}
              {y.is_current && (
                <form action={closeYear} className="ml-auto">
                  <input type="hidden" name="id" value={y.id} />
                  <ConfirmButton message="Close this academic year? All terms and sequences will be locked." className="btn btn-secondary btn-xs"><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Close year</ConfirmButton>
                </form>
              )}
            </div>
          </SectionCard>
        );
      }) : <EmptyState icon={CalendarDays} title="No academic years" description="Create your first academic year to begin configuring sequences." />}
    </div>
  );
}
