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
import { FormField } from "@/components/molecules/FormField";
import { cn } from "@/lib/utils";
import type { CatalogFormState } from "./CatalogTable.types";

export type DialogTarget = { mode: "create" } | { mode: "rename"; id: string; name: string };

const TYPES = [
  {
    value: "INCOME",
    label: "Entrada",
    tone: "has-checked:border-income has-checked:bg-income-soft has-checked:text-income",
  },
  {
    value: "EXPENSE",
    label: "Saída",
    tone: "has-checked:border-expense has-checked:bg-expense-soft has-checked:text-expense",
  },
] as const;

type Props = {
  target: DialogTarget | null;
  onClose: () => void;
  noun: string;
  withType: boolean;
  saveAction: (id: string | null, prev: CatalogFormState, fd: FormData) => Promise<CatalogFormState>;
};

function Body({ target, onClose, withType, saveAction, noun }: Props & { target: DialogTarget }) {
  const rename = target.mode === "rename";
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: CatalogFormState, fd: FormData) => {
    const r = await saveAction(rename ? target.id : null, prev, fd);
    if (r.ok) {
      toast.success(rename ? "Nome atualizado." : "Criado.");
      onClose();
    }
    return r;
  }, {});
  const nameError = state.fieldErrors?.name;
  const typeError = state.fieldErrors?.type;

  useEffect(() => {
    if (state.fieldErrors) ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    <form ref={ref} action={action} noValidate className="grid gap-4">
      {withType && !rename && (
        <fieldset className="grid gap-1.5">
          <legend className="font-heading mb-1.5 text-sm font-bold [font-stretch:100%]">Tipo</legend>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <label
                key={t.value}
                className={cn(
                  "font-heading focus-within:ring-ring/50 flex h-12 cursor-pointer items-center justify-center rounded-lg border-2 text-base font-bold [font-stretch:100%] focus-within:ring-3",
                  t.tone,
                )}
              >
                <input
                  type="radio"
                  name="type"
                  value={t.value}
                  defaultChecked={String(state.values?.type ?? "EXPENSE") === t.value}
                  className="sr-only"
                />
                {t.label}
              </label>
            ))}
          </div>
          {typeError && (
            <p role="alert" className="text-destructive text-sm">
              {typeError}
            </p>
          )}
        </fieldset>
      )}
      <FormField
        label="Nome"
        id="catalog-name"
        name="name"
        defaultValue={String(state.values?.name ?? (rename ? target.name : ""))}
        error={nameError}
        maxLength={60}
        autoComplete="off"
        autoFocus
      />
      {state.error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg p-3 text-sm font-medium">
          {state.error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <AppButton type="button" tone="ghost" onClick={onClose} disabled={pending}>
          Cancelar
        </AppButton>
        <AppButton type="submit" disabled={pending}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {pending ? "Salvando…" : rename ? "Renomear" : `Criar ${noun}`}
        </AppButton>
      </div>
    </form>
  );
}

export function CatalogFormDialog({ target, onClose, noun, ...rest }: Props) {
  const [seen, setSeen] = useState<{ target: DialogTarget | null; last: DialogTarget | null; session: number }>({
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
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>{shown?.mode === "rename" ? `Renomear ${noun}` : `Nova ${noun}`}</AppDialogTitle>
          <AppDialogDescription>Enter salva, Esc fecha.</AppDialogDescription>
        </AppDialogHeader>
        {shown && <Body key={seen.session} target={shown} onClose={onClose} noun={noun} {...rest} />}
      </AppDialogContent>
    </AppDialog>
  );
}
