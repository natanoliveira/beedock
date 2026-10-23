"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
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
import { AppSelect } from "@/components/atoms/AppSelect";
import { FormField } from "@/components/molecules/FormField";
import { centsToMask, MoneyInput } from "@/components/molecules/MoneyInput";
import type { FormState } from "@/components/organisms/OrderForm";

type Props = {
  orderNumber: number;
  paidCents: number;
  paidLabel: string;
  paymentMethods: { id: string; name: string; active: boolean }[];
  today: string;
  /** cancelOrderAction já com o id do pedido: (prev, fd). */
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
};

function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <AppLabel htmlFor={htmlFor}>{label}</AppLabel>
      {children}
      {error && <p id={`${htmlFor}-error`} role="alert" className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

function Body({ paidCents, paidLabel, paymentMethods, today, action, onClose }: Omit<Props, "orderNumber"> & { onClose: () => void }) {
  const [state, run, pending] = useActionState(async (prev: FormState, fd: FormData): Promise<FormState> => {
    const r = await action(prev, fd);
    if (r.ok) {
      toast.success("Pedido cancelado.");
      onClose();
    } else if (r.error) toast.error(r.error);
    return r;
  }, {});
  const val = (k: string, fallback = "") => String(state.values?.[k] ?? fallback);
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <form action={run} className="grid gap-4" noValidate>
      {paidCents > 0 && (
        <fieldset className="bg-muted/50 grid gap-3 rounded-lg border p-3">
          <legend className="font-heading px-1 text-sm font-bold [font-stretch:100%]">Estorno ao cliente</legend>
          <p className="text-muted-foreground text-sm">
            Já foram recebidos {paidLabel}. O estorno vira uma saída em Lançamentos; os recebimentos continuam registrados.
          </p>
          <Field label="Valor do estorno (R$)" htmlFor="cancel-refund" error={err("refundAmount")}>
            <MoneyInput
              id="cancel-refund"
              name="refundAmount"
              defaultValue={val("refundAmount", centsToMask(paidCents))}
              aria-invalid={err("refundAmount") ? true : undefined}
              aria-describedby={err("refundAmount") ? "cancel-refund-error" : undefined}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Forma de pagamento" htmlFor="cancel-method" error={err("refundPaymentMethodId")}>
              <AppSelect
                id="cancel-method"
                name="refundPaymentMethodId"
                defaultValue={val("refundPaymentMethodId")}
                aria-invalid={err("refundPaymentMethodId") ? true : undefined}
                aria-describedby={err("refundPaymentMethodId") ? "cancel-method-error" : undefined}
              >
                <option value="">Escolha…</option>
                {paymentMethods.filter((m) => m.active).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </AppSelect>
            </Field>
            <FormField label="Data" id="cancel-date" name="refundPaidAt" type="date" max={today} defaultValue={val("refundPaidAt", today)} error={err("refundPaidAt")} />
          </div>
        </fieldset>
      )}
      <div className="grid gap-1.5">
        <AppLabel htmlFor="cancel-reason">Motivo (opcional)</AppLabel>
        <textarea
          id="cancel-reason"
          name="reason"
          rows={3}
          maxLength={500}
          defaultValue={val("reason")}
          className="bg-background focus-visible:border-ring focus-visible:ring-ring/50 rounded-lg border-2 px-3.5 py-2.5 text-base outline-none focus-visible:ring-3"
        />
        <p className="text-muted-foreground text-sm">Fica registrado na auditoria.</p>
      </div>
      {state.error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg p-3 text-sm font-medium">{state.error}</p>
      )}
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <AppButton type="button" tone="outline" onClick={onClose} disabled={pending}>Voltar</AppButton>
        <AppButton type="submit" tone="danger" disabled={pending}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {pending ? "Cancelando…" : "Cancelar pedido"}
        </AppButton>
      </div>
    </form>
  );
}

/** Cancelar é final: para retomar, cria-se um pedido novo. */
export function CancelOrderDialog(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AppButton type="button" tone="danger" onClick={() => setOpen(true)}>
        Cancelar pedido
      </AppButton>
      <AppDialog open={open} onOpenChange={setOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>Cancelar o pedido #{props.orderNumber}?</AppDialogTitle>
            <AppDialogDescription>
              Não dá para desfazer. O pedido fica somente leitura e sai do «A receber».
            </AppDialogDescription>
          </AppDialogHeader>
          {open && <Body {...props} onClose={() => setOpen(false)} />}
        </AppDialogContent>
      </AppDialog>
    </>
  );
}
