"use client";

import Link from "next/link";
import { Link2 } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import { AppLabel } from "@/components/atoms/AppLabel";
import { AppSelect } from "@/components/atoms/AppSelect";
import { ConfirmAction } from "@/components/molecules/ConfirmAction";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ResponsiveModal } from "@/components/organisms/TeamManager/ResponsiveModal";
import { cn } from "@/lib/utils";
import type { UserMembership, UserMembershipsProps } from "./UserMemberships.types";

const ROLE = { ADMIN: "Admin", FUNCIONARIO: "Funcionário" } as const;
const OTHER_ROLE = { ADMIN: "FUNCIONARIO", FUNCIONARIO: "ADMIN" } as const;

function LinkForm({ props, onClose }: { props: UserMembershipsProps; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(async (prev: Parameters<typeof props.linkAction>[0], fd: FormData) => {
    const r = await props.linkAction(prev, fd);
    if (r.ok) {
      toast.success("Usuário vinculado.");
      onClose();
    }
    return r;
  }, {});
  const error = state.error ?? state.fieldErrors?.organizationId ?? state.fieldErrors?.email ?? state.fieldErrors?.role;
  return (
    <form action={formAction} noValidate className="grid gap-4">
      <input type="hidden" name="email" value={props.userEmail} />
      <div className="grid gap-1.5">
        <AppLabel htmlFor="ul-org">Empresa *</AppLabel>
        <AppSelect id="ul-org" name="organizationId" defaultValue="" required>
          <option value="" disabled>
            Selecione…
          </option>
          {props.linkableOrganizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </AppSelect>
      </div>
      <div className="grid gap-1.5">
        <AppLabel htmlFor="ul-role">Papel *</AppLabel>
        <AppSelect id="ul-role" name="role" defaultValue="FUNCIONARIO">
          <option value="FUNCIONARIO">Funcionário</option>
          <option value="ADMIN">Admin</option>
        </AppSelect>
      </div>
      {error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg px-3 py-2.5 text-sm font-bold">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <AppButton type="button" tone="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </AppButton>
        <AppButton type="submit" disabled={pending}>
          {pending ? "Aguarde…" : "Vincular"}
        </AppButton>
      </div>
    </form>
  );
}

export function UserMemberships(props: UserMembershipsProps) {
  const { userName, memberships, linkableOrganizations, changeRoleAction, setActiveAction } = props;
  const [linking, setLinking] = useState(false);

  // botões em linha (ConfirmAction dentro de DropdownMenu desmonta ao fechar o menu)
  const actions = (m: UserMembership) => (
    <div className="flex flex-wrap gap-2">
      <ConfirmAction
        withReason={false}
        triggerLabel={`Tornar ${ROLE[OTHER_ROLE[m.role]]}`}
        title={`Tornar ${userName} ${ROLE[OTHER_ROLE[m.role]]}?`}
        description={`Em ${m.organizationName}, o papel muda de ${ROLE[m.role]} para ${ROLE[OTHER_ROLE[m.role]]}.`}
        confirmLabel="Confirmar"
        successMessage="Papel atualizado."
        onConfirm={() => changeRoleAction(m.organizationId, m.id, OTHER_ROLE[m.role])}
      />
      {m.active ? (
        <ConfirmAction
          danger
          withReason={false}
          triggerLabel="Desativar acesso"
          title="Desativar acesso?"
          description={`${userName} perde o acesso a ${m.organizationName} agora.`}
          confirmLabel="Desativar"
          successMessage="Acesso desativado."
          onConfirm={() => setActiveAction(m.organizationId, m.id, false)}
        />
      ) : (
        <ConfirmAction
          withReason={false}
          triggerLabel="Reativar acesso"
          title="Reativar acesso?"
          description={`${userName} volta a acessar ${m.organizationName}.`}
          confirmLabel="Reativar"
          successMessage="Acesso reativado."
          onConfirm={() => setActiveAction(m.organizationId, m.id, true)}
        />
      )}
    </div>
  );

  return (
    <section aria-labelledby="vinculos-title" className="bg-card grid gap-4 rounded-xl border p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="vinculos-title" className="text-lg leading-tight font-extrabold">
          Empresas e papéis
        </h2>
        <AppButton type="button" tone="outline" className="max-sm:w-full sm:ml-auto" onClick={() => setLinking(true)} disabled={linkableOrganizations.length === 0}>
          <Link2 aria-hidden />
          Vincular a uma empresa
        </AppButton>
      </div>

      {memberships.length === 0 ? (
        <EmptyState title="Sem vínculos." description="Este usuário ainda não pertence a nenhuma empresa." />
      ) : (
        <ul className="grid gap-3">
          {memberships.map((m) => (
            <li key={m.id} className={cn("bg-background flex flex-wrap items-center gap-3 rounded-lg border p-3", !m.active && "opacity-80")}>
              <div className="min-w-0 flex-1 basis-56">
                <Link
                  href={`/plataforma/empresas/${m.organizationId}`}
                  className={cn("font-heading font-bold underline-offset-4 hover:underline", !m.active && "text-muted-foreground line-through")}
                >
                  {m.organizationName}
                </Link>
                <p className="text-muted-foreground text-sm">
                  {ROLE[m.role]} · {m.active ? "Ativo" : "Inativo"}
                </p>
              </div>
              {actions(m)}
            </li>
          ))}
        </ul>
      )}

      <ResponsiveModal open={linking} onOpenChange={setLinking} title="Vincular a uma empresa" description={`${userName} passa a acessar a empresa com o papel escolhido.`}>
        <LinkForm props={props} onClose={() => setLinking(false)} />
      </ResponsiveModal>
    </section>
  );
}
