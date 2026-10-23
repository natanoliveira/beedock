import { AppSkeleton } from "@/components/atoms/AppSkeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Carregando pedidos" aria-busy="true" className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <AppSkeleton className="h-9 w-40" />
        <AppSkeleton className="h-12 w-32" />
      </div>
      <div className="flex gap-2">
        {[28, 24, 24, 28, 20].map((w, i) => (
          <AppSkeleton key={i} className="h-11 rounded-full" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <AppSkeleton className="h-12 w-full md:max-w-xl" />
      <div className="bg-card overflow-hidden rounded-xl border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0">
            <AppSkeleton className="h-4 w-10" />
            <AppSkeleton className="h-4 flex-1" />
            <AppSkeleton className="h-4 w-16" />
            <AppSkeleton className="h-5 w-20 rounded-full" />
            <AppSkeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
