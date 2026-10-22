import { AppSkeleton } from "@/components/atoms/AppSkeleton";
import { TransactionListSkeleton } from "@/components/organisms/TransactionList";

export default function Loading() {
  return (
    <div className="grid gap-4 md:gap-5" aria-busy="true">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AppSkeleton className="h-9 w-48" />
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <AppSkeleton className="h-12 sm:w-32" />
          <AppSkeleton className="h-12 sm:w-32" />
        </div>
      </div>
      <AppSkeleton className="h-12 w-72 max-w-full" />
      <div className="flex gap-2">
        <AppSkeleton className="h-10 w-56" />
        <AppSkeleton className="h-10 w-44" />
      </div>
      <TransactionListSkeleton withProfit={false} />
    </div>
  );
}
