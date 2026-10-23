"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
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
import { FormField } from "@/components/molecules/FormField";
import { formatPhone } from "@/lib/phone";

export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, unknown>;
};

export type CustomerFormValues = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
  address: string | null;
  note: string | null;
};

export type CustomerFormProps = {
  /** null fecha; "create" abre vazio; objeto abre em edição. */
  target: "create" | CustomerFormValues | null;
  onClose: () => void;
  saveAction: (id: string | null, prev: FormState, fd: FormData) => Promise<FormState>;
};

function Body({ target, onClose, saveAction }: CustomerFormProps & { target: "create" | CustomerFormValues }) {
  const row = target === "create" ? null : target;
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData): Promise<FormState> => {
    const r = await saveAction(row?.id ?? null, prev, fd);
    if (r.ok) {
      toast.success(row ? "Cliente atualizado." : "Cliente cadastrado.");
      onClose();
    } else if (r.error) toast.error(r.error);
    return r;
  }, {});

  useEffect(() => {
    if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const val = (k: keyof CustomerFormValues, fallback = "") => String(state.values?.[k] ?? fallback);
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <form ref={formRef} action={action} className="grid gap-4" noValidate>
      <FormField label="Nome" name="name" defaultValue={val("name", row?.name)} error={err("name")} required maxLength={120} autoComplete="off" autoFocus />
      <FormField
        label="WhatsApp"
        name="phone"
        type="tel"
        inputMode="tel"
        defaultValue={val("phone", row ? formatPhone(row.phone) : "")}
        error={err("phone")}
        hint="DDD + número. Só os dígitos ficam salvos."
        required
        maxLength={20}
        autoComplete="off"
      />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="E-mail" name="email" type="email" inputMode="email" defaultValue={val("email", row?.email ?? "")} error={err("email")} maxLength={120} autoComplete="off" />
        <FormField label="CPF ou CNPJ" name="document" inputMode="numeric" defaultValue={val("document", row?.document ?? "")} error={err("document")} maxLength={18} autoComplete="off" />
      </div>
      <FormField label="Endereço" name="address" defaultValue={val("address", row?.address ?? "")} error={err("address")} maxLength={200} autoComplete="off" />
      <div className="grid gap-1.5">
        <AppLabel htmlFor="customer-note">Observação</AppLabel>
        <textarea
          id="customer-note"
          name="note"
          rows={3}
          maxLength={500}
          defaultValue={val("note", row?.note ?? "")}
          aria-invalid={err("note") ? true : undefined}
          className="bg-background focus-visible:border-ring focus-visible:ring-ring/50 rounded-lg border-2 px-3.5 py-2.5 text-base outline-none focus-visible:ring-3"
        />
        {err("note") && <p role="alert" className="text-destructive text-sm">{err("note")}</p>}
      </div>

      {state.error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg p-3 text-sm font-medium">
          {state.error}
        </p>
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
export function CustomerForm({ target, onClose, saveAction }: CustomerFormProps) {
  const [seen, setSeen] = useState<{ target: CustomerFormProps["target"]; last: CustomerFormProps["target"]; session: number }>({
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
      <AppDialogContent className="top-0 left-0 h-dvh max-w-none translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none p-4 sm:max-w-none md:top-1/2 md:left-1/2 md:h-auto md:max-h-[92dvh] md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:p-6">
        <AppDialogHeader>
          <AppDialogTitle className="text-xl font-extrabold">{shown && shown !== "create" ? "Editar cliente" : "Novo cliente"}</AppDialogTitle>
          <AppDialogDescription>Nome e WhatsApp são obrigatórios. Enter salva, Esc fecha.</AppDialogDescription>
        </AppDialogHeader>
        {shown && <Body key={seen.session} target={shown} onClose={onClose} saveAction={saveAction} />}
      </AppDialogContent>
    </AppDialog>
  );
}
