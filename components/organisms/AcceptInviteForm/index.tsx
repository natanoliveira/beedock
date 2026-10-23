"use client";

import { useActionState } from "react";
import { AppButton } from "@/components/atoms/AppButton";
import { FormField } from "@/components/molecules/FormField";
import type { AcceptInviteFormProps } from "./AcceptInviteForm.types";

export function AcceptInviteForm({ token, action, existingUser = false, requireTerms = false }: AcceptInviteFormProps) {
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
      {(requireTerms || fe.terms) && (
        <div>
          <label className="flex min-h-11 items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="terms"
              aria-invalid={fe.terms ? true : undefined}
              aria-describedby={fe.terms ? "terms-error" : undefined}
              className="mt-0.5 size-5 shrink-0"
            />
            <span>
              Li e aceito os{" "}
              <a href="/termos" target="_blank" rel="noopener noreferrer" className="font-bold underline">
                Termos de Uso
              </a>{" "}
              e a{" "}
              <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-bold underline">
                Política de Privacidade
              </a>
            </span>
          </label>
          {fe.terms && (
            <p id="terms-error" role="alert" className="text-expense mt-1 text-sm font-bold">
              {fe.terms}
            </p>
          )}
        </div>
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
