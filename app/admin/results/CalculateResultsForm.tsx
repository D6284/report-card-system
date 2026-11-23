'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, Loader2 } from 'lucide-react';
import { Alert } from '@/app/components/ui';

export interface CalculateResultsFormProps {
  classId: string;
  yearId: string;
  termNo: number;
  message: string;
  disabled: boolean;
}

const CALCULATION_TIMEOUT_MS = 58000;

interface CalculationResult {
  ok: boolean;
  runId?: string;
  status?: string;
  totalStudents?: number;
  completeStudents?: number;
  incompleteStudents?: number;
  pendingSubmissions?: number;
  cards?: number;
  error?: string;
}

export default function CalculateResultsForm({
  classId,
  yearId,
  termNo,
  message,
  disabled,
}: CalculateResultsFormProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const router = useRouter();

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm(message)) return;

    setPending(true);
    setError(null);
    setResult(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALCULATION_TIMEOUT_MS);

    try {
      const formData = new FormData();
      formData.set('class_id', classId);
      formData.set('academic_year_id', yearId);
      formData.set('term', String(termNo));

      const res = await fetch('/api/results/calculate', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      const json = (await res.json()) as CalculationResult;

      if (!res.ok || json.ok === false) {
        throw new Error(json.error || 'Calculation failed.');
      }

      setResult(json);
      // Refresh the route so the server-rendered UI reflects the new run status
      // without requiring a full website reload.
      router.refresh();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Calculation timed out. It may still be running on the server; refresh the page to check the result.');
      } else {
        setError(err instanceof Error ? err.message : 'Calculation failed.');
      }
    } finally {
      clearTimeout(timer);
      setPending(false);
    }
  }, [classId, yearId, termNo, message, router]);

  return (
    <form onSubmit={handleSubmit} className="card-body space-y-4">
      <p className="text-sm text-slate-600">
        Only approved marks are included. Missing marks remain incomplete or provisional. Pending and rejected marks never enter official result rows.
      </p>
      <button
        type="submit"
        disabled={disabled || pending}
        className="btn btn-primary btn-block"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
            Calculating…
          </>
        ) : (
          <>
            <Calculator className="h-4 w-4 mr-2" /> CALCULATE APPROVED RESULTS
          </>
        )}
      </button>
      {error && <Alert tone="error" role="alert">{error}</Alert>}
      {result && result.ok && (
        <Alert tone="success" role="status">
          Calculation finished{' '}
          <span className="font-semibold">
            {result.completeStudents ?? 0} of {result.totalStudents ?? 0} student(s) calculated
            {result.incompleteStudents ?? 0 > 0 ? `, ${result.incompleteStudents} incomplete` : ''}
            {result.pendingSubmissions ?? 0 > 0 ? `, ${result.pendingSubmissions} with pending submissions` : ''}
          </span>
          .
        </Alert>
      )}
    </form>
  );
}
