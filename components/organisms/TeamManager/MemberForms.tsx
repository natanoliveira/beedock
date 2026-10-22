"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import { AppLabel } from "@/components/atoms/AppLabel";
import { AppSelect } from "@/components/atoms/AppSelect";
import { FormField } from "@/components/molecules/FormField";
import { InviteLink } from "@/components/molecules/InviteLink";
import type { InviteState, TeamManagerProps } from "./TeamManager.types";

const RoleSelect = ({ id, defaultValue = "FUNCIONARIO" }: { id: string; defaultValue?: string }) => (
  <div className="grid gap-1.5">
    <AppLabel htmlFor={id}>Papel *</AppLabel>
    <AppSelect id={id} name="role" defaultValue={defaultValue}>
      <option value="FUNCIONARIO">Funcionário</option>
      <option value="ADMIN">Admin</option>
    </AppSelect>
  </div>
);

const Actions = ({ pending, label, onCancel }: { pending: boolean; label: string; onCancel: () => void }) => (
  <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
    <AppButton type="button" tone="outline" onClick={onCancel} disabled={pending}>
      Cancelar
    </AppButton>
    <AppButton type="submit" disabled={pending}>
      {pending ? "Aguarde…" : label}
    </AppButton>
  </div>
);

const ErrorBox = ({ error }: { error?: string }) =>
  error ? (
    <p role="alert" className="bg-expense-soft text-expense rounded-lg px-3 py-2.5 text-sm font-bold">
      {error}
    </p>
  ) : null;

/** Convite novo; no sucesso troca o formulário pelo link. */
export function InviteForm({ action, onClose }: { action: TeamManagerProps["inviteAction"]; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(async (prev: InviteState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok && r.inviteUrl) toast.success("Convite gerado.");
    return r.ok ? { ...r, values: { phone: String(fd.get("phone") ?? "") } } : r;
  }, {});

  if (state.ok && state.inviteUrl) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <InviteLink url={state.inviteUrl} phone={String(state.values?.phone ?? "") || null} />
        <div className="flex md:justify-end">
          <AppButton type="button" tone="outline" onClick={onClose}>
            Concluir
          </AppButton>
        </div>
      </div>
    );
  }
  const v = (k: string) => String(state.values?.[k] ?? "");
  return (
    <form action={formAction} noValidate className="grid gap-4">
      <FormField label="Nome *" name="name" id="member-name" defaultValue={v("name")} error={state.fieldErrors?.name} autoComplete="off" required />
      <FormField label="E-mail *" name="email" id="member-email" type="email" inputMode="email" defaultValue={v("email")} error={state.fieldErrors?.email} autoComplete="off" required />
      <FormField label="Telefone (WhatsApp)" name="phone" id="member-phone" type="tel" inputMode="tel" defaultValue={v("phone")} error={state.fieldErrors?.phone} autoComplete="off" />
      <RoleSelect id="member-role" defaultValue={v("role") || "FUNCIONARIO"} />
      <ErrorBox error={state.error ?? state.fieldErrors?.role} />
      <Actions pending={pending} label="Gerar convite" onCancel={onClose} />
    </form>
  );
}

/** Vincula usuário que já existe (MASTER). */
export function LinkForm({ action, organizationId, onClose }: { action: NonNullable<TeamManagerProps["linkAction"]>; organizationId: string; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(async (prev: Parameters<typeof action>[0], fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok) {
      toast.success("Usuário vinculado.");
      onClose();
    }
    return r;
  }, {});
  return (
    <form action={formAction} noValidate className="grid gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <FormField label="E-mail do usuário *" name="email" id="link-email" type="email" inputMode="email" defaultValue={String(state.values?.email ?? "")} error={state.fieldErrors?.email} autoComplete="off" required />
      <RoleSelect id="link-role" defaultValue={String(state.values?.role ?? "FUNCIONARIO")} />
      <ErrorBox error={state.error ?? state.fieldErrors?.organizationId ?? state.fieldErrors?.role} />
      <Actions pending={pending} label="Vincular" onCancel={onClose} />
    </form>
  );
}
