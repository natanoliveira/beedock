import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function AppSkeleton(props: ComponentProps<typeof Skeleton>) {
  return <Skeleton aria-hidden {...props} />;
}
