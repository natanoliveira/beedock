import { AppSkeleton } from "@/components/atoms/AppSkeleton";

export function TransactionListSkeleton({ rows = 6, withProfit = true }: { rows?: number; withProfit?: boolean }) {
  return (
    <div role="status" aria-label="Carregando lançamentos" className="grid gap-4">
      <div
        className={
          withProfit ? "grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4" : "grid grid-cols-2 gap-2.5 md:gap-4"
        }
      >
        {[0, 1, ...(withProfit ? [2] : [])].map((i) => (
          <AppSkeleton
            key={i}
            className={`h-[74px] rounded-lg md:h-[86px] ${i === 2 ? "col-span-2 md:col-span-1" : ""}`}
          />
        ))}
      </div>
      <div className="bg-card hidden overflow-hidden rounded-lg border md:block">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0">
            <AppSkeleton className="h-4 w-12" />
            <AppSkeleton className="h-4 flex-1" />
            <AppSkeleton className="h-5 w-24 rounded-full" />
            <AppSkeleton className="h-4 w-20" />
            <AppSkeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-2.5 md:hidden">
        {Array.from({ length: Math.min(rows, 5) }, (_, i) => (
          <div key={i} className="bg-card grid gap-2 rounded-lg border p-3">
            <div className="flex justify-between gap-4">
              <AppSkeleton className="h-4 w-2/3" />
              <AppSkeleton className="h-4 w-20" />
            </div>
            <AppSkeleton className="h-5 w-28 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
