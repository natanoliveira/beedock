"use client";

import { useActionState } from "react";
import { AppButton } from "@/components/atoms/AppButton";
import { FormField } from "@/components/molecules/FormField";
import type { AcceptInviteFormProps } from "./AcceptInviteForm.types";

export function AcceptInviteForm({ token, action, existingUser = false }: AcceptInviteFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {existingUser ? (
        <FormField
          label="Sua senha atual"
          name="password"
          type="password"
          autoComplete="current-password"
          error={fe.password}
          required
        />
      ) : (
        <>
          <FormField
            label="Senha"
            name="password"
            type="password"
            autoComplete="new-password"
            error={fe.password}
            required
          />
          <FormField
            label="Confirmar senha"
            name="confirm"
            type="password"
            autoComplete="new-password"
            error={fe.confirm}
            required
          />
        </>
      )}
      {state.error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg px-3 py-2.5 text-sm font-bold">
          {state.error}
        </p>
      )}
      <AppButton type="submit" tone="ink" size="lg" disabled={pending} className="w-full">
        {existingUser ? (pending ? "Entrando…" : "Entrar na empresa") : pending ? "Criando conta…" : "Criar conta"}
      </AppButton>
    </form>
  );
}
