'use client';

import { useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, Trash2 } from 'lucide-react';

const OK = ['image/jpeg', 'image/png', 'image/webp'];

export default function PhotoUpload({ studentId, currentUrl }: { studentId: string; currentUrl: string | null }) {
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!OK.includes(f.type)) return setMsg({ ok: false, text: 'Use JPG, PNG or WebP.' });
    if (f.size > 2 * 1024 * 1024) return setMsg({ ok: false, text: 'Maximum file size is 2 MB.' });
    setMsg(null); setFile(f); setPreview(URL.createObjectURL(f));
  }

  async function save() {
    if (!file || busy) return;
    setBusy(true); setMsg(null);
    const fd = new FormData(); fd.append('photo', file);
    try {
      const r = await fetch(`/api/students/${studentId}/photo`, { method: 'POST', body: fd });
      const json = await r.json().catch(() => ({}));
      setMsg(r.ok ? { ok: true, text: 'Photo saved' } : { ok: false, text: json.error ?? 'Upload failed' });
      if (r.ok) setFile(null);
    } catch {
      setMsg({ ok: false, text: 'Upload failed. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Remove this photo?') || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/students/${studentId}/photo`, { method: 'DELETE' });
      if (r.ok) { setPreview(null); setFile(null); setMsg({ ok: true, text: 'Photo removed' }); }
      else setMsg({ ok: false, text: 'Could not remove the photo.' });
    } catch {
      setMsg({ ok: false, text: 'Could not remove the photo.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {preview
        ? /* eslint-disable-next-line @next/next/no-img-element */
          <img src={preview} alt="" className="h-14 w-11 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
        : <div className="grid h-14 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-[10px] font-medium text-slate-400">No photo</div>}
      <div className="space-y-2">
        <label className="btn btn-secondary btn-xs cursor-pointer">
          <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" /> Choose image
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy}
            onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {file && (
          <button type="button" onClick={save} disabled={busy} className="btn btn-primary btn-xs ml-2">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
            Save
          </button>
        )}
        {(currentUrl || preview) && (
          <button type="button" onClick={remove} disabled={busy} className="btn btn-ghost btn-xs ml-2 !text-red-600">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
          </button>
        )}
        {msg && <p role="status" className={`text-[11px] font-medium ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
