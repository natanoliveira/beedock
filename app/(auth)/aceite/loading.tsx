import { AppSkeleton } from "@/components/atoms/AppSkeleton";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Carregando"
      aria-busy="true"
      className="mx-auto grid w-full max-w-prose gap-4 px-4 py-8"
    >
      <AppSkeleton className="h-9 w-56" />
      <AppSkeleton className="h-64 rounded-lg" />
    </div>
  );
}
