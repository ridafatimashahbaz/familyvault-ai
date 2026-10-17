import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentLoading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label="Loading document">
      <Skeleton className="h-4 w-32" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-24 rounded-md" />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <div className="space-y-5">
          <Skeleton className="h-[38rem] rounded-card" />
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-56 rounded-card" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-[34rem] rounded-card" />
          <Skeleton className="h-72 rounded-card" />
        </div>
      </div>

      <span className="sr-only">Loading document…</span>
    </div>
  );
}
