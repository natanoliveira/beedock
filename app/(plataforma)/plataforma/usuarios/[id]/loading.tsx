import { AppSkeleton } from "@/components/atoms/AppSkeleton";

export default function Loading() {
  return (
    <div className="grid gap-5" aria-busy="true">
      <AppSkeleton className="h-5 w-24" />
      <AppSkeleton className="h-9 w-64" />
      <AppSkeleton className="h-20 rounded-xl" />
      <AppSkeleton className="h-56 rounded-xl" />
    </div>
  );
}
