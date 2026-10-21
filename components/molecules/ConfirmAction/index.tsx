"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import { AppDialog, AppDialogContent, AppDialogDescription, AppDialogHeader, AppDialogTitle } from "@/components/atoms/AppDialog";
import { AppDrawer, AppDrawerContent, AppDrawerDescription, AppDrawerHeader, AppDrawerTitle } from "@/components/atoms/AppDrawer";
import { useMediaQuery } from "@/hooks/use-media-query";

type Props = {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  danger?: boolean;
  /** Server action já com os argumentos fixos; recebe o motivo opcional. */
  onConfirm: (reason?: string) => Promise<{ ok?: boolean; error?: string; fieldErrors?: Record<string, string> }>;
};

export function ConfirmAction({ triggerLabel, title, description, confirmLabel, successMessage, danger, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const desktop = useMediaQuery("(min-width: 768px)");

  const confirm = () =>
    start(async () => {
      const r = await onConfirm(reason.trim() || undefined);
      if (r.ok) {
        toast.success(successMessage);
        setOpen(false);
        setReason("");
      } else {
        toast.error(r.error ?? Object.values(r.fieldErrors ?? {})[0] ?? "Não foi possível concluir.");
      }
    });

  const body = (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="confirm-reason" className="font-heading text-sm font-bold [font-stretch:100%]">
          Motivo (opcional)
        </label>
        <textarea
          id="confirm-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          className="bg-background focus-visible:border-ring focus-visible:ring-ring/50 rounded-lg border-2 px-3.5 py-2.5 text-base outline-none focus-visible:ring-3"
        />
        <p className="text-muted-foreground text-sm">Fica registrado na auditoria.</p>
      </div>
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <AppButton type="button" tone="outline" onClick={() => setOpen(false)} disabled={pending}>
          Cancelar
        </AppButton>
        <AppButton type="button" tone={danger ? "danger" : "ink"} onClick={confirm} disabled={pending}>
          {pending ? "Aguarde…" : confirmLabel}
        </AppButton>
      </div>
    </div>
  );

  return (
    <>
      <AppButton type="button" tone={danger ? "danger" : "outline"} onClick={() => setOpen(true)}>
        {triggerLabel}
      </AppButton>
      {desktop ? (
        <AppDialog open={open} onOpenChange={setOpen}>
          <AppDialogContent>
            <AppDialogHeader>
              <AppDialogTitle>{title}</AppDialogTitle>
              <AppDialogDescription>{description}</AppDialogDescription>
            </AppDialogHeader>
            {body}
          </AppDialogContent>
        </AppDialog>
      ) : (
        <AppDrawer open={open} onOpenChange={setOpen}>
          <AppDrawerContent>
            <AppDrawerHeader>
              <AppDrawerTitle>{title}</AppDrawerTitle>
              <AppDrawerDescription>{description}</AppDrawerDescription>
            </AppDrawerHeader>
            <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)]">{body}</div>
          </AppDrawerContent>
        </AppDrawer>
      )}
    </>
  );
}
