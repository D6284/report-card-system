'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Save, Search, Send } from 'lucide-react';
import { saveMarks } from '../../../actions';
import { validateMark } from '@/lib/calculations/engine';

type State = 'entered' | 'missing' | 'not_assessed' | 'exempted';
export interface Row { enrollmentId: string; adm: string; name: string; state: State; value: string; remark: string }

export default function MarksTable({ classSubjectId, sequenceId, max, rows, status, submittedAt, locked }: {
  classSubjectId: string; sequenceId: string; max: number; rows: Row[]; status: string; submittedAt: string | null; locked: boolean;
}) {
  const [data, setData] = useState<Row[]>(rows);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const parse = (r: Row) => (r.state !== 'entered' && r.state !== 'missing' ? null : r.value.trim() === '' ? null : Number(r.value.replace(',', '.')));
  const errors = useMemo(() => data.map((r) => {
    if (r.state === 'not_assessed' || r.state === 'exempted' || r.value.trim() === '') return '';
    const v = validateMark(Number(r.value.replace(',', '.')), max); return v.ok ? '' : v.error;
  }), [data, max]);
  const missing = data.filter((r) => r.state !== 'not_assessed' && r.state !== 'exempted' && r.value.trim() === '').length;
  const invalid = errors.filter(Boolean).length;
  const entered = data.length - missing;
  const percent = data.length ? Math.round((entered / data.length) * 100) : 0;

  function payload() {
    return {
      class_subject_id: classSubjectId, sequence_id: sequenceId,
      entries: data.map((r) => {
        const v = parse(r);
        const state: State = r.state === 'not_assessed' || r.state === 'exempted' ? r.state : v === null ? 'missing' : 'entered';
        return { enrollment_id: r.enrollmentId, state, value: state === 'entered' ? v : null, remark: r.remark || undefined };
      }),
    };
  }

  function run(submit: boolean) {
    if (invalid) return setMsg({ ok: false, text: 'Fix the highlighted marks first.' });
    if (submit && missing) return setMsg({ ok: false, text: `${missing} mark(s) missing. Enter them or mark the student Not assessed / Exempted.` });
    if (submit && !confirm('Submit all marks for approval? You cannot edit them while pending.')) return;
    start(async () => {
      const r = await saveMarks(payload(), submit);
      if (r.ok) {
        setDirty(false);
        setMsg({ ok: true, text: submit ? 'Submitted for approval.' : `Draft saved (${r.saved} students).` });
        if (submit) location.reload();
      } else setMsg({ ok: false, text: r.error });
    });
  }

  useEffect(() => {
    if (!dirty || locked || invalid) return;
    const t = setTimeout(() => run(false), 2500);
    return () => clearTimeout(t);
  }, [data]); // eslint-disable-line

  const update = (i: number, patch: Partial<Row>) => {
    setData((d) => d.map((r, k) => (k === i ? { ...r, ...patch } : r)));
    setDirty(true);
    setMsg(null);
  };
  const visible = data.map((r, i) => ({ r, i }))
    .filter(({ r }) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.adm.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack">
      <div className="card animate-in">
        <div className="card-body flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-[220px] flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="badge badge-neutral">Status: {status === 'submitted' ? 'pending approval' : status}</span>
              <span className="font-semibold text-slate-800">{entered}/{data.length} entered</span>
              <span className="text-xs text-slate-500">· Max {max}{submittedAt && ` · submitted ${new Date(submittedAt).toLocaleDateString()}`}</span>
              {dirty && <span className="badge badge-warning">Unsaved changes</span>}
            </div>
            <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${percent}%` }} />
            </div>
          </div>
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student" aria-label="Search student" className="input pl-10" />
          </div>
        </div>
      </div>

      {msg && (
        <div className={`alert ${msg.ok ? 'alert-success' : 'alert-error'} animate-in`} role="status">
          {msg.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>No.</th><th>Admission no.</th><th>Student</th><th>Mark /{max}</th><th>Status</th><th>Remark</th></tr></thead>
          <tbody>
            {visible.map(({ r, i }) => (
              <tr key={r.enrollmentId}>
                <td className="text-slate-400">{i + 1}</td>
                <td className="text-xs text-slate-500">{r.adm}</td>
                <td className="font-medium text-slate-800">{r.name}</td>
                <td>
                  <input ref={(el) => { refs.current[i] = el; }} inputMode="decimal" disabled={locked || r.state === 'not_assessed' || r.state === 'exempted'}
                    value={r.value} onChange={(e) => update(i, { value: e.target.value, state: 'entered' })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); refs.current[i + 1]?.focus(); } }}
                    aria-invalid={!!errors[i]} aria-label={`Mark for ${r.name}`}
                    className={`compact-input w-20 ${errors[i] ? '!border-red-400 !bg-red-50' : ''}`} />
                  {errors[i] && <p className="mt-1 text-[11px] font-medium text-red-600">{errors[i]}</p>}
                </td>
                <td>
                  <select disabled={locked} value={r.state === 'not_assessed' || r.state === 'exempted' ? r.state : 'entered'}
                    onChange={(e) => update(i, { state: e.target.value as State, value: e.target.value === 'entered' ? r.value : '' })}
                    className="select !w-auto !py-1.5 !text-xs" aria-label={`Status for ${r.name}`}>
                    <option value="entered">Mark</option>
                    <option value="not_assessed">Not assessed</option>
                    <option value="exempted">Exempted</option>
                  </select>
                </td>
                <td><input disabled={locked} value={r.remark} maxLength={120} onChange={(e) => update(i, { remark: e.target.value })}
                  className="cell-input min-w-[180px]" aria-label={`Remark for ${r.name}`} /></td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-500">No students match your search.</td></tr>}
          </tbody>
        </table>
      </div>

      {!locked && (
        <div className="sticky bottom-3 z-20 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <button disabled={pending} onClick={() => run(false)} className="btn btn-secondary flex-1">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {pending ? 'Saving…' : 'Save draft'}
          </button>
          <button disabled={pending} onClick={() => run(true)} className="btn btn-primary flex-1">
            <Send className="h-4 w-4" aria-hidden="true" /> Submit for approval
          </button>
        </div>
      )}
    </div>
  );
}
