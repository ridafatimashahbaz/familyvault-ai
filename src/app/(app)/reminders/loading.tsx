import { Skeleton } from "@/components/ui/skeleton";

export default function RemindersLoading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label="Loading reminders">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-16 rounded-lg" />
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-card" />
        ))}
      </div>

      <div className="divide-y divide-ink-100 overflow-hidden rounded-card border border-ink-200/80 bg-surface shadow-card">
        <Skeleton className="h-12 w-full rounded-none" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-28 rounded-md" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading reminders…</span>
    </div>
  );
}
