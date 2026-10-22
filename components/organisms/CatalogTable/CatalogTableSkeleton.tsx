import { AppSkeleton } from "@/components/atoms/AppSkeleton";

export function CatalogTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Carregando cadastro" className="grid gap-4">
      <div className="flex justify-end">
        <AppSkeleton className="h-12 w-full md:w-44" />
      </div>
      <div className="bg-card divide-y overflow-hidden rounded-lg border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="grid flex-1 basis-48 gap-1.5">
              <AppSkeleton className="h-4 w-40" />
              <AppSkeleton className="h-3.5 w-24" />
            </div>
            <AppSkeleton className="h-6 w-16 rounded-full" />
            <AppSkeleton className="h-6 w-20 rounded-full" />
            <AppSkeleton className="h-11 w-36" />
          </div>
        ))}
      </div>
    </div>
  );
}
