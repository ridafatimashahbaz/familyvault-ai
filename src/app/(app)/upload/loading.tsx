import { Skeleton } from "@/components/ui/skeleton";

export default function UploadLoading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label="Loading upload page">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-ink-200 bg-surface px-6 py-16">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="mt-2 h-10 w-36 rounded-lg" />
      </div>

      <Skeleton className="h-72 rounded-card" />

      <span className="sr-only">Loading the upload page…</span>
    </div>
  );
}
