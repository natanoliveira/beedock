"use client";

import { useActionState } from "react";
import { AppButton } from "@/components/atoms/AppButton";
import { FormField } from "@/components/molecules/FormField";
import type { LoginFormProps } from "./LoginForm.types";

export function LoginForm({ action }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormField
        label="E-mail"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        defaultValue={state.email}
        required
      />
      <FormField label="Senha" name="password" type="password" autoComplete="current-password" required />
      {state.error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg px-3 py-2.5 text-sm font-bold">
          {state.error}
        </p>
      )}
      <AppButton type="submit" tone="ink" size="lg" disabled={pending} className="w-full">
        {pending ? "Entrando…" : "Entrar"}
      </AppButton>
    </form>
  );
}
