import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentsLoading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label="Loading documents">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="space-y-3 rounded-card border border-ink-200/80 bg-surface p-4 shadow-card">
        <div className="flex flex-col gap-2 xl:flex-row">
          <Skeleton className="h-10 xl:w-72" />
          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        </div>
        <Skeleton className="h-4 w-40" />
      </div>

      <div className="divide-y divide-ink-100 overflow-hidden rounded-card border border-ink-200/80 bg-surface shadow-card">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="hidden h-5 w-24 rounded-md sm:block" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading documents…</span>
    </div>
  );
}
