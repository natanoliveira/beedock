import { AppSkeleton } from "@/components/atoms/AppSkeleton";

export default function Loading() {
  return (
    <div className="grid gap-5" aria-busy="true">
      <AppSkeleton className="h-9 w-40" />
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
        <AppSkeleton className="h-[74px]" />
        <AppSkeleton className="h-[74px]" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <AppSkeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
