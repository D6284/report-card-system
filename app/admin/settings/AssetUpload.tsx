'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ImagePlus, Loader2 } from 'lucide-react';

export default function AssetUpload({ kind, label, currentPath }: { kind: string; label: string; currentPath?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMessage(null);
    const fd = new FormData();
    fd.set('kind', kind);
    fd.set('file', file);
    try {
      const res = await fetch('/api/school-assets', { method: 'POST', body: fd });
      const json = await res.json();
      setMessage(res.ok
        ? { ok: true, text: 'Uploaded successfully' }
        : { ok: false, text: json.error ?? 'Upload failed' });
      if (res.ok) router.refresh();
    } catch {
      setMessage({ ok: false, text: 'Upload failed. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-5 text-center transition hover:border-indigo-400 hover:bg-indigo-50/30">
      <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
      </span>
      <p className="text-sm font-bold text-slate-800">{label}</p>
      <p className="mt-1 w-full truncate text-xs text-slate-500" title={currentPath ?? undefined}>{currentPath ?? 'Not uploaded'}</p>
      <label className="btn btn-secondary btn-xs mt-4 cursor-pointer">
        {busy ? 'Uploading…' : 'Choose image'}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
      </label>
      {message && (
        <p role="status" className={`mt-3 flex items-center gap-1 break-words text-[11px] font-medium ${message.ok ? 'text-emerald-600' : 'text-red-600'}`}>
          {message.ok && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}{message.text}
        </p>
      )}
    </div>
  );
}
