"use client";

import { useActionState } from "react";
import { AppButton } from "@/components/atoms/AppButton";
import { startNavigationProgress } from "@/components/atoms/NavigationProgress";
import { LogoutButton } from "@/components/molecules/LogoutButton";
import { LegalDocumentView } from "@/components/organisms/LegalDocumentView";
import type { TermsAcceptFormProps } from "./TermsAcceptForm.types";

export function TermsAcceptForm({ documents, action, logoutAction }: TermsAcceptFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const agreeError = state.fieldErrors?.agree;

  return (
    <form action={formAction} onSubmit={() => startNavigationProgress("/inicio")} className="grid gap-5" noValidate>
      {documents.map(({ id, ...doc }) => (
        <div key={id} className="grid gap-2">
          <input type="hidden" name="documentId" value={id} />
          <LegalDocumentView {...doc} scroll />
        </div>
      ))}
      <div>
        <label className="flex min-h-11 items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="agree"
            aria-invalid={agreeError ? true : undefined}
            aria-describedby={agreeError ? "agree-error" : undefined}
            className="mt-0.5 size-5 shrink-0"
          />
          <span>Li e aceito {documents.length > 1 ? "os documentos acima" : "o documento acima"}.</span>
        </label>
        {agreeError && (
          <p id="agree-error" role="alert" className="text-expense mt-1 text-sm font-bold">
            {agreeError}
          </p>
        )}
      </div>
      {state.error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg px-3 py-2.5 text-sm font-bold">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <AppButton
          type="submit"
          tone="ink"
          size="lg"
          disabled={pending}
          className="dark:bg-primary dark:text-primary-foreground flex-1"
        >
          {pending ? "Salvando…" : "Aceitar e continuar"}
        </AppButton>
        <LogoutButton logoutAction={logoutAction} label="Sair" />
      </div>
    </form>
  );
}
