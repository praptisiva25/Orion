export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-7xl p-6 md:p-10" role="status" aria-live="polite">
      <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-slate-100" />
      <div className="mt-7 h-40 animate-pulse rounded-2xl bg-white" />
      <span className="sr-only">Loading Admin page...</span>
    </div>
  );
}
