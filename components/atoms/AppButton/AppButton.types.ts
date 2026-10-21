import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import type { Button } from "@/components/ui/button";
import type { appButtonVariants } from "./variants";

export type AppButtonProps = Omit<ComponentProps<typeof Button>, "variant" | "size"> &
  VariantProps<typeof appButtonVariants>;
