import { Skeleton } from "@/components/ui/skeleton";

/** Instant skeleton shown while a page's server data loads. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2"><Skeleton className="h-9 w-72" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      <div className="grid-cols-1 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] rounded-2xl" />)}</div>
      <div className="grid-cols-1 grid gap-6 xl:grid-cols-[1fr_360px]"><Skeleton className="h-80 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
    </div>
  );
}