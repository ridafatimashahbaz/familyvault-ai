import { Skeleton } from "@/components/ui/skeleton";

export default function FamilyLoading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label="Loading family profiles">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-card" />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="divide-y divide-ink-100 overflow-hidden rounded-card border border-ink-200/80 bg-surface shadow-card">
          <Skeleton className="h-12 w-full rounded-none" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-8 w-32 rounded-lg" />
            </div>
          ))}
        </div>
        <Skeleton className="h-96 rounded-card" />
      </div>

      <span className="sr-only">Loading family profiles…</span>
    </div>
  );
}
