"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import { startNavigationProgress, stopNavigationProgress } from "@/components/atoms/NavigationProgress";

type Props = {
  enterAction: () => Promise<{ error?: string }>;
  disabled?: boolean;
  disabledHint?: string;
};

/** "Entrar na empresa" (MASTER): sucesso redireciona; erro vira toast. */
export function EnterOrgButton({ enterAction, disabled, disabledHint }: Props) {
  const [pending, startTransition] = useTransition();
  return (
    <AppButton
      type="button"
      disabled={disabled || pending}
      title={disabled ? disabledHint : undefined}
      onClick={() =>
        startTransition(async () => {
          startNavigationProgress("/inicio");
          const r = await enterAction();
          if (r?.error) {
            stopNavigationProgress();
            toast.error(r.error);
          }
        })
      }
    >
      Entrar na empresa
    </AppButton>
  );
}
