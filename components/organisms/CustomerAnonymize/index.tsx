"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/atoms/AppDialog";
import { AppLabel } from "@/components/atoms/AppLabel";
import type { FormState } from "@/components/organisms/CustomerForm";

type Props = {
  customerId: string;
  customerName: string;
  /** anonymizeCustomerAction: (id, prev, fd) com o campo `reason`. */
  action: (id: string, prev: FormState, fd: FormData) => Promise<FormState>;
  /** Gatilho próprio; o padrão é um botão de perigo. */
  triggerClassName?: string;
};

function Body({ customerId, action, onClose }: Pick<Props, "customerId" | "action"> & { onClose: () => void }) {
  const [state, run, pending] = useActionState(async (prev: FormState, fd: FormData): Promise<FormState> => {
    const r = await action(customerId, prev, fd);
    if (r.ok) {
      toast.success("Cliente anonimizado.");
      onClose();
    } else if (r.error) toast.error(r.error);
    return r;
  }, {});
  const error = state.fieldErrors?.reason;
  return (
    <form action={run} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <AppLabel htmlFor="anonymize-reason">Motivo</AppLabel>
        <textarea
          id="anonymize-reason"
          name="reason"
          rows={3}
          maxLength={500}
          required
          autoFocus
          defaultValue={String(state.values?.reason ?? "")}
          aria-invalid={error ? true : undefined}
          className="bg-background focus-visible:border-ring focus-visible:ring-ring/50 rounded-lg border-2 px-3.5 py-2.5 text-base outline-none focus-visible:ring-3"
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">{error}</p>
        ) : (
          <p className="text-muted-foreground text-sm">Mínimo de 10 caracteres. Fica registrado na auditoria.</p>
        )}
      </div>
      {state.error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg p-3 text-sm font-medium">{state.error}</p>
      )}
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <AppButton type="button" tone="outline" onClick={onClose} disabled={pending}>Cancelar</AppButton>
        <AppButton type="submit" tone="danger" disabled={pending}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {pending ? "Anonimizando…" : "Anonimizar"}
        </AppButton>
      </div>
    </form>
  );
}

/** LGPD: troca os dados pessoais por marcadores. Irreversível, com motivo obrigatório. */
export function CustomerAnonymize({ customerId, customerName, action, triggerClassName }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AppButton type="button" tone="danger" className={triggerClassName} onClick={() => setOpen(true)}>
        Anonimizar
      </AppButton>
      <AppDialog open={open} onOpenChange={setOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>Anonimizar {customerName}?</AppDialogTitle>
            <AppDialogDescription>
              Nome, WhatsApp, e-mail, documento e endereço são apagados, inclusive nos lançamentos dos pedidos. Não dá
              para desfazer.
            </AppDialogDescription>
          </AppDialogHeader>
          {open && <Body customerId={customerId} action={action} onClose={() => setOpen(false)} />}
        </AppDialogContent>
      </AppDialog>
    </>
  );
}
