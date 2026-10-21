import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AppInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn("bg-background h-12 rounded-lg border-2 px-3.5 text-base md:text-base", className)}
      {...props}
    />
  );
}
