"use client";

import { ChevronDown, Loader2, Plus, UserPlus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/atoms/AppDialog";
import { AppInput } from "@/components/atoms/AppInput";
import { AppLabel } from "@/components/atoms/AppLabel";
import { AppSelect } from "@/components/atoms/AppSelect";
import { FormField } from "@/components/molecules/FormField";
import { centsToMask, MoneyInput } from "@/components/molecules/MoneyInput";
import { cn } from "@/lib/utils";

export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, unknown>;
};

export type OrderFormValues = {
  id: string;
  customerId: string;
  productTypeId: string;
  description: string;
  totalCents: number;
  dueDate: string;
};

export type OrderFormOptions = {
  customers: { id: string; name: string; phoneTail: string }[];
  productTypes: { id: string; name: string; active: boolean }[];
  paymentMethods: { id: string; name: string; active: boolean }[];
};

export type OrderFormProps = {
  /** null fecha; "create" abre vazio; objeto abre em edição. */
  target: "create" | OrderFormValues | null;
  onClose: () => void;
  saveAction: (id: string | null, prev: FormState, fd: FormData) => Promise<FormState>;
  options: OrderFormOptions;
  /** "YYYY-MM-DD" no fuso da empresa. */
  today: string;
};

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <AppLabel htmlFor={htmlFor}>{label}</AppLabel>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-destructive text-sm">{error}</p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-muted-foreground text-sm">{hint}</p>
      ) : null}
    </div>
  );
}

function Body({ target, onClose, saveAction, options, today }: OrderFormProps & { target: "create" | OrderFormValues }) {
  const row = target === "create" ? null : target;
  const formRef = useRef<HTMLFormElement>(null);
  const [newCustomer, setNewCustomer] = useState(false);
  const [filter, setFilter] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);

  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData): Promise<FormState> => {
    const r = await saveAction(row?.id ?? null, prev, fd);
    if (r.ok) {
      toast.success(row ? "Pedido atualizado." : "Pedido salvo.");
      onClose();
    } else if (r.error) toast.error(r.error);
    return r;
  }, {});

  useEffect(() => {
    if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const val = (k: string, fallback = "") => String(state.values?.[k] ?? fallback);
  const err = (k: string) => state.fieldErrors?.[k];
  const needle = filter.trim().toLowerCase();
  const customers = options.customers.filter(
    (c) => !needle || c.name.toLowerCase().includes(needle) || c.phoneTail.includes(needle) || c.id === val("customerId", row?.customerId),
  );
  const types = options.productTypes.filter((t) => t.active || t.id === row?.productTypeId);
  const methods = options.paymentMethods.filter((m) => m.active);
  const depositShown = depositOpen || Boolean(err("depositAmount") || err("depositPaymentMethodId") || err("depositPaidAt"));

  return (
    <form ref={formRef} action={action} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        {newCustomer ? (
          <fieldset className="bg-muted/50 grid gap-3 rounded-lg border p-3">
            <legend className="font-heading px-1 text-sm font-bold [font-stretch:100%]">Novo cliente</legend>
            <FormField label="Nome" name="newCustomerName" id="order-new-name" defaultValue={val("newCustomerName")} error={err("newCustomerName")} maxLength={120} autoComplete="off" autoFocus />
            <FormField label="WhatsApp" name="newCustomerPhone" id="order-new-phone" type="tel" inputMode="tel" defaultValue={val("newCustomerPhone")} error={err("newCustomerPhone")} maxLength={20} autoComplete="off" />
            {err("customerId") && <p role="alert" className="text-destructive text-sm">{err("customerId")}</p>}
            <AppButton type="button" tone="ghost" className="w-fit" onClick={() => setNewCustomer(false)}>
              <X aria-hidden className="size-4" />
              Escolher cliente existente
            </AppButton>
          </fieldset>
        ) : (
          <>
            <Field label="Cliente" htmlFor="order-customer" error={err("customerId")}>
              <AppSelect
                id="order-customer"
                name="customerId"
                defaultValue={val("customerId", row?.customerId ?? "")}
                aria-invalid={err("customerId") ? true : undefined}
                aria-describedby={err("customerId") ? "order-customer-error" : undefined}
              >
                <option value="">Escolha…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · …{c.phoneTail}
                  </option>
                ))}
              </AppSelect>
            </Field>
            {options.customers.length > 8 && (
              <AppInput type="search" aria-label="Filtrar clientes" placeholder="Filtrar por nome ou final do telefone" value={filter} onChange={(e) => setFilter(e.target.value)} autoComplete="off" />
            )}
            {!row && (
              <AppButton type="button" tone="ghost" className="w-fit" onClick={() => setNewCustomer(true)}>
                <UserPlus aria-hidden className="size-4" />
                Novo cliente
              </AppButton>
            )}
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Tipo de produto" htmlFor="order-type" error={err("productTypeId")}>
          <AppSelect
            id="order-type"
            name="productTypeId"
            defaultValue={val("productTypeId", row?.productTypeId ?? "")}
            aria-invalid={err("productTypeId") ? true : undefined}
            aria-describedby={err("productTypeId") ? "order-type-error" : undefined}
          >
            <option value="">Escolha…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.active ? "" : " (desativado)"}</option>
            ))}
          </AppSelect>
        </Field>
        <FormField label="Entrega" id="order-due" name="dueDate" type="date" defaultValue={val("dueDate", row?.dueDate ?? "")} error={err("dueDate")} />
      </div>

      <FormField label="Descrição" id="order-description" name="description" defaultValue={val("description", row?.description ?? "")} error={err("description")} maxLength={200} autoComplete="off" hint="Ex.: 20 camisas time Unidos" />

      <Field label="Valor total (R$)" htmlFor="order-total" error={err("total")}>
        <MoneyInput
          id="order-total"
          name="total"
          defaultValue={val("total", row ? centsToMask(row.totalCents) : "")}
          aria-invalid={err("total") ? true : undefined}
          aria-describedby={err("total") ? "order-total-error" : undefined}
        />
      </Field>

      {!row && (
        <div className="grid gap-3">
          <AppButton type="button" tone="outline" aria-expanded={depositShown} aria-controls="order-deposit" onClick={() => setDepositOpen((v) => !v)} className="justify-between">
            <span className="flex items-center gap-2">
              <Plus aria-hidden className="size-4" />
              Sinal recebido
            </span>
            <ChevronDown aria-hidden className={cn("size-4 transition-transform motion-reduce:transition-none", depositShown && "rotate-180")} />
          </AppButton>
          {depositShown && (
            <div id="order-deposit" className="bg-muted/50 grid gap-3 rounded-lg border p-3 md:grid-cols-3">
              <Field label="Valor (R$)" htmlFor="order-deposit-amount" error={err("depositAmount")}>
                <MoneyInput id="order-deposit-amount" name="depositAmount" defaultValue={val("depositAmount")} aria-invalid={err("depositAmount") ? true : undefined} aria-describedby={err("depositAmount") ? "order-deposit-amount-error" : undefined} />
              </Field>
              <Field label="Forma de pagamento" htmlFor="order-deposit-method" error={err("depositPaymentMethodId")}>
                <AppSelect id="order-deposit-method" name="depositPaymentMethodId" defaultValue={val("depositPaymentMethodId")} aria-invalid={err("depositPaymentMethodId") ? true : undefined} aria-describedby={err("depositPaymentMethodId") ? "order-deposit-method-error" : undefined}>
                  <option value="">Escolha…</option>
                  {methods.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </AppSelect>
              </Field>
              <FormField label="Data" id="order-deposit-date" name="depositPaidAt" type="date" defaultValue={val("depositPaidAt", today)} max={today} error={err("depositPaidAt")} />
            </div>
          )}
        </div>
      )}

      {state.error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg p-3 text-sm font-medium">{state.error}</p>
      )}

      <div className="bg-popover sticky bottom-0 -mx-4 flex flex-col gap-2 border-t px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] md:static md:mx-0 md:flex-row md:justify-end md:border-0 md:p-0">
        <AppButton type="submit" disabled={pending} className="order-1 md:order-2">
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {pending ? "Salvando…" : "Salvar"}
        </AppButton>
        <AppButton type="button" tone="ghost" onClick={onClose} disabled={pending} className="order-2 md:order-1">
          Cancelar
        </AppButton>
      </div>
    </form>
  );
}

/** Dialog; tela cheia abaixo de md. O corpo remonta a cada abertura (estado limpo). */
export function OrderForm({ target, onClose, ...rest }: OrderFormProps) {
  const [seen, setSeen] = useState<{ target: OrderFormProps["target"]; last: OrderFormProps["target"]; session: number }>({
    target,
    last: target,
    session: 0,
  });
  if (target !== seen.target) {
    setSeen({ target, last: target ?? seen.last, session: target ? seen.session + 1 : seen.session });
  }
  const shown = target ?? seen.last;
  return (
    <AppDialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <AppDialogContent className="top-0 left-0 h-dvh max-w-none translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none p-4 sm:max-w-none md:top-1/2 md:left-1/2 md:h-auto md:max-h-[92dvh] md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:p-6">
        <AppDialogHeader>
          <AppDialogTitle className="text-xl font-extrabold">{shown && shown !== "create" ? "Editar pedido" : "Novo pedido"}</AppDialogTitle>
          <AppDialogDescription>Cliente, produto, descrição, valor e entrega são obrigatórios. Esc fecha.</AppDialogDescription>
        </AppDialogHeader>
        {shown && <Body key={seen.session} target={shown} onClose={onClose} {...rest} />}
      </AppDialogContent>
    </AppDialog>
  );
}
