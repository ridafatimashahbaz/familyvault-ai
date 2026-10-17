import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-ink-200/70", className)} aria-hidden="true" />;
}

/** Placeholder shown by a route's loading.tsx while the server component resolves. */
export function DocumentRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
      <Skeleton className="size-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="hidden h-5 w-20 rounded-md sm:block" />
      <Skeleton className="hidden h-3 w-16 md:block" />
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-ink-100" role="status" aria-label="Loading documents">
      {Array.from({ length: rows }, (_, i) => (
        <DocumentRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function PageSkeleton({ title = "Loading" }: { title?: string }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label={title}>
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-card" />
      <span className="sr-only">{title}…</span>
    </div>
  );
}
