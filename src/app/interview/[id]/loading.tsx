import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <main className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-[1440px] flex-col gap-4 p-4" aria-busy="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
        <div className="hidden flex-col gap-4 lg:flex">
          <Skeleton className="h-[26rem] rounded-3xl" />
          <Skeleton className="flex-1 rounded-2xl" />
        </div>
        <div className="flex flex-col gap-4 rounded-3xl p-4">
          <Skeleton className="h-14 w-3/5" />
          <Skeleton className="ml-auto h-11 w-2/5" />
          <Skeleton className="h-14 w-1/2" />
          <div className="flex-1" />
          <Skeleton className="h-12" />
        </div>
        <Skeleton className="hidden rounded-3xl lg:block" />
      </div>
    </main>
  );
}
