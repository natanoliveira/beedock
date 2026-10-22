import { AppSkeleton } from "@/components/atoms/AppSkeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <AppSkeleton className="h-9 w-40" />
      <AppSkeleton className="h-72 w-full" />
    </div>
  );
}
