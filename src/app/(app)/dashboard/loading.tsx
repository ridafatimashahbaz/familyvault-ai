import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label="Loading dashboard">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-card" />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Skeleton className="h-80 rounded-card" />
          <Skeleton className="h-56 rounded-card" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-64 rounded-card" />
          <Skeleton className="h-52 rounded-card" />
        </div>
      </div>

      <span className="sr-only">Loading your dashboard…</span>
    </div>
  );
}
