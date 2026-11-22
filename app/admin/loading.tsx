export default function AdminLoading() {
  return (
    <div className="stack" role="status" aria-label="Loading workspace">
      <span className="sr-only">Loading workspace…</span>
      <div className="space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-64 max-w-full animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
        <div className="h-72 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
      </div>
    </div>
  );
}
