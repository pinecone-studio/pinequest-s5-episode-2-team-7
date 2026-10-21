import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8" aria-busy="true">
      <Skeleton className="h-9 w-80 max-w-full" />
      <Skeleton className="mt-3 h-4 w-60" />
      <Skeleton className="mt-8 h-72 rounded-[2rem]" />
      <Skeleton className="mt-6 h-56 rounded-3xl" />
    </main>
  );
}
