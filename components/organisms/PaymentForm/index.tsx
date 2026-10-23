"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
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

export type PaymentTarget =
  | { mode: "create"; amountCents?: number }
  | { mode: "edit"; id: string; amountCents: number; paymentMethodId: string; paidAt: string };

export type PaymentFormProps = {
  target: PaymentTarget | null;
  onClose: () => void;
  /** savePaymentAction já com o pedido vinculado: (paymentId|null, prev, fd). */
  saveAction: (paymentId: string | null, prev: FormState, fd: FormData) => Promise<FormState>;
  paymentMethods: { id: string; name: string; active: boolean }[];
  /** Forma atual do recebimento em edição, mesmo desativada. */
  today: string;
  balanceLabel: string;
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

function Body({ target, onClose, saveAction, paymentMethods, today }: PaymentFormProps & { target: PaymentTarget }) {
  const row = target.mode === "edit" ? target : null;
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData): Promise<FormState> => {
    const r = await saveAction(row?.id ?? null, prev, fd);
    if (r.ok) {
      toast.success(row ? "Recebimento atualizado." : "Recebimento registrado.");
      onClose();
    } else if (r.error) toast.error(r.error);
    return r;
  }, {});

  useEffect(() => {
    if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const val = (k: string, fallback = "") => String(state.values?.[k] ?? fallback);
  const err = (k: string) => state.fieldErrors?.[k];
  const initialCents = target.amountCents;

  return (
    <form ref={formRef} action={action} className="grid gap-4" noValidate>
      <Field label="Valor (R$)" htmlFor="pay-amount" error={err("amount")}>
        <MoneyInput
          id="pay-amount"
          name="amount"
          autoFocus
          defaultValue={val("amount", initialCents ? centsToMask(initialCents) : "")}
          aria-invalid={err("amount") ? true : undefined}
          aria-describedby={err("amount") ? "pay-amount-error" : undefined}
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Forma de pagamento" htmlFor="pay-method" error={err("paymentMethodId")}>
          <AppSelect
            id="pay-method"
            name="paymentMethodId"
            defaultValue={val("paymentMethodId", row?.paymentMethodId ?? "")}
            aria-invalid={err("paymentMethodId") ? true : undefined}
            aria-describedby={err("paymentMethodId") ? "pay-method-error" : undefined}
          >
            <option value="">Escolha…</option>
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.active ? "" : " (desativada)"}</option>
            ))}
          </AppSelect>
        </Field>
        <FormField label="Data" id="pay-date" name="paidAt" type="date" max={today} defaultValue={val("paidAt", row?.paidAt ?? today)} error={err("paidAt")} />
      </div>

      {state.error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg p-3 text-sm font-medium">{state.error}</p>
      )}

      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <AppButton type="button" tone="ghost" onClick={onClose} disabled={pending}>Cancelar</AppButton>
        <AppButton type="submit" disabled={pending}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {pending ? "Salvando…" : "Salvar"}
        </AppButton>
      </div>
    </form>
  );
}

/** Dialog de recebimento; o corpo remonta a cada abertura. */
export function PaymentForm(props: PaymentFormProps) {
  const { target, onClose, balanceLabel } = props;
  return (
    <AppDialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>{target?.mode === "edit" ? "Editar recebimento" : "Registrar recebimento"}</AppDialogTitle>
          <AppDialogDescription>Saldo do pedido: {balanceLabel}. O valor entra também em Lançamentos.</AppDialogDescription>
        </AppDialogHeader>
        {target && <Body key={JSON.stringify(target)} {...props} target={target} />}
      </AppDialogContent>
    </AppDialog>
  );
}
