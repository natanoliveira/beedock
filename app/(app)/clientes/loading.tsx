import { AppSkeleton } from "@/components/atoms/AppSkeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Carregando clientes" aria-busy="true" className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <AppSkeleton className="h-9 w-40" />
        <AppSkeleton className="h-12 w-32" />
      </div>
      <AppSkeleton className="h-12 w-full md:max-w-md" />
      <div className="bg-card overflow-hidden rounded-xl border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0">
            <AppSkeleton className="h-4 flex-1" />
            <AppSkeleton className="h-4 w-12" />
            <AppSkeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
