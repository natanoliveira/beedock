"use client";

import { Loader2, LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogTrigger,
} from "@/components/atoms/AppDialog";
import type { LogoutButtonProps } from "./LogoutButton.types";

const WAIT_MS = 2000;

export function LogoutButton({ logoutAction }: LogoutButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
    try {
      await logoutAction(); // o redirect para /login é tratado pelo router, não chega aqui como erro
    } catch {
      setPending(false);
      toast.error("Não foi possível sair. Tente novamente.");
    }
  };

  return (
    <AppDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AppDialogTrigger asChild>
        <AppButton type="button" tone="ghost" size="icon" aria-label="Sair" className="hover:bg-white/10">
          <LogOut aria-hidden />
        </AppButton>
      </AppDialogTrigger>
      <AppDialogContent
        showCloseButton={!pending}
        onEscapeKeyDown={(e) => pending && e.preventDefault()}
        onPointerDownOutside={(e) => pending && e.preventDefault()}
      >
        <AppDialogHeader>
          <AppDialogTitle>Sair da conta?</AppDialogTitle>
          <AppDialogDescription>Você vai precisar entrar de novo com e-mail e senha.</AppDialogDescription>
        </AppDialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AppButton type="button" tone="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </AppButton>
          <AppButton type="button" tone="danger" onClick={confirm} disabled={pending}>
            {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {pending ? "Saindo…" : "Sair"}
          </AppButton>
        </div>
        <p role="status" className="sr-only">
          {pending ? "Saindo da conta…" : ""}
        </p>
      </AppDialogContent>
    </AppDialog>
  );
}
