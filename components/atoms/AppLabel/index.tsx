import type { ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function AppLabel({ className, ...props }: ComponentProps<typeof Label>) {
  return <Label className={cn("font-heading text-sm font-bold [font-stretch:100%]", className)} {...props} />;
}
