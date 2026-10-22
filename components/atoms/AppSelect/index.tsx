import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Select nativo: teclado e lista do celular de graça, e entra no FormData sem cola. */
export function AppSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "bg-background border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-12 w-full min-w-0 rounded-lg border-2 px-3 text-base outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
