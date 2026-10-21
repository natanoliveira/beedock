import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppButtonProps } from "./AppButton.types";
import { appButtonVariants } from "./variants";

export function AppButton({ tone, size, className, ...props }: AppButtonProps) {
  return <Button variant="ghost" className={cn(appButtonVariants({ tone, size }), className)} {...props} />;
}
