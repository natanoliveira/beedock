import { AppSkeleton } from "@/components/atoms/AppSkeleton";

export function QuickActionsSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-3 gap-2 md:max-w-xl">
      <AppSkeleton className="h-12" />
      <AppSkeleton className="h-12" />
      <AppSkeleton className="h-12" />
    </div>
  );
}
