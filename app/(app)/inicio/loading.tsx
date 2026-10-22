import { AppSkeleton } from "@/components/atoms/AppSkeleton";
import { QuickActionsSkeleton } from "@/components/organisms/QuickActions/QuickActionsSkeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Carregando início" aria-busy="true" className="grid gap-6">
      <AppSkeleton className="h-9 w-56" />
      {/* o papel não chega ao loading: esqueleto do layout maior (Admin, com "Sobrou"); Funcionário perde só o 3º */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        {[0, 1, 2].map((i) => (
          <AppSkeleton key={i} className="h-[74px] rounded-lg md:h-[86px]" />
        ))}
      </div>
      <QuickActionsSkeleton />
      <div className="grid gap-3">
        <AppSkeleton className="h-5 w-40" />
        <AppSkeleton className="h-36 rounded-lg" />
      </div>
    </div>
  );
}
