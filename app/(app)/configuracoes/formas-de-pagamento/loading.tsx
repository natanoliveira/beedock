import { AppSkeleton } from "@/components/atoms/AppSkeleton";
import { CatalogTableSkeleton } from "@/components/organisms/CatalogTable";

export default function Loading() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <AppSkeleton className="h-9 w-56" />
      <CatalogTableSkeleton />
    </div>
  );
}
