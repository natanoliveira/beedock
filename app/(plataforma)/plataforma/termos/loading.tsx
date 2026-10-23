import { AppSkeleton } from "@/components/atoms/AppSkeleton";

export default function Loading() {
  return (
    <div className="grid gap-5" aria-busy="true">
      <AppSkeleton className="h-9 w-56" />
      <div className="grid gap-4 lg:grid-cols-2">
        <AppSkeleton className="h-64 rounded-xl" />
        <AppSkeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
