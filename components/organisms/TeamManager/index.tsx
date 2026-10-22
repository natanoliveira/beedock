"use client";

import { Link2, UserPlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import { ConfirmAction } from "@/components/molecules/ConfirmAction";
import { EmptyState } from "@/components/molecules/EmptyState";
import { InviteLink } from "@/components/molecules/InviteLink";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { InviteForm, LinkForm } from "./MemberForms";
import { ResponsiveModal } from "./ResponsiveModal";
import type { TeamInvite, TeamManagerProps, TeamMember } from "./TeamManager.types";

const ROLE = { ADMIN: "Admin", FUNCIONARIO: "Funcionário" } as const;
const OTHER_ROLE = { ADMIN: "FUNCIONARIO", FUNCIONARIO: "ADMIN" } as const;

const ActiveBadge = ({ active }: { active: boolean }) => (
  <span
    className={cn(
      "font-heading inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-[13px] font-bold [font-stretch:100%]",
      active ? "bg-income-soft text-income" : "bg-muted text-muted-foreground",
    )}
  >
    <span aria-hidden className="hex h-2.5 w-[9px] bg-current" />
    {active ? "Ativo" : "Inativo"}
  </span>
);

export function TeamManager({
  members,
  invites,
  currentUserId,
  flashUrl,
  consumeFlash,
  inviteAction,
  changeRoleAction,
  setActiveAction,
  revokeInviteAction,
  linkAction,
  organizationId,
}: TeamManagerProps) {
  // useState preserva o link mesmo se a página re-renderizar sem o cookie (consumido abaixo).
  const [flash, setFlash] = useState(flashUrl ?? null);
  const [inviting, setInviting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [regen, setRegen] = useState<{ url: string; phone: string | null } | null>(null);
  const [regenPending, startRegen] = useTransition();

  useEffect(() => {
    if (flashUrl) void consumeFlash?.();
  }, [flashUrl, consumeFlash]);

  const regenerate = (i: TeamInvite) =>
    startRegen(async () => {
      const fd = new FormData();
      fd.set("name", i.name);
      fd.set("email", i.email);
      fd.set("role", i.role);
      if (i.phone) fd.set("phone", i.phone);
      const r = await inviteAction({}, fd);
      if (r.ok && r.inviteUrl) {
        setRegen({ url: r.inviteUrl, phone: i.phone });
        toast.success("Convite gerado.");
      } else {
        toast.error(r.error ?? Object.values(r.fieldErrors ?? {})[0] ?? "Não foi possível gerar o convite.");
      }
    });

  const memberActions = (m: TeamMember) => (
    <div className="flex flex-wrap gap-2">
      <ConfirmAction
        withReason={false}
        triggerLabel={`Tornar ${ROLE[OTHER_ROLE[m.role]]}`}
        title={`Tornar ${m.name} ${ROLE[OTHER_ROLE[m.role]]}?`}
        description={m.role === "ADMIN" ? `${m.name} deixa de gerenciar a equipe e as configurações.` : `${m.name} passa a gerenciar a equipe e as configurações.`}
        confirmLabel="Confirmar"
        successMessage="Papel atualizado."
        onConfirm={() => changeRoleAction(m.id, OTHER_ROLE[m.role])}
      />
      {m.active ? (
        <ConfirmAction
          danger
          withReason={false}
          triggerLabel="Desativar acesso"
          title="Desativar acesso?"
          description={m.userId === currentUserId ? "Você perde o acesso a esta empresa agora e será desconectado." : `${m.name} perde o acesso a esta empresa agora.`}
          confirmLabel="Desativar"
          successMessage="Acesso desativado."
          onConfirm={() => setActiveAction(m.id, false)}
        />
      ) : (
        <ConfirmAction
          withReason={false}
          triggerLabel="Reativar acesso"
          title="Reativar acesso?"
          description={`${m.name} volta a acessar esta empresa.`}
          confirmLabel="Reativar"
          successMessage="Acesso reativado."
          onConfirm={() => setActiveAction(m.id, true)}
        />
      )}
    </div>
  );

  const you = (m: TeamMember) =>
    m.userId === currentUserId && <span className="bg-ink text-primary ml-2 rounded-full px-2 py-0.5 align-middle text-xs font-bold">Você</span>;
  const lastSeen = (m: TeamMember) => (m.lastSeenAt ? formatDateTime(m.lastSeenAt) : "Nunca");

  return (
    <section aria-labelledby="team-title" className="bg-card grid gap-4 rounded-xl border p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="team-title" className="text-lg leading-tight font-extrabold">
          Equipe
        </h2>
        <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row max-sm:w-full">
          {linkAction && organizationId && (
            <AppButton type="button" tone="outline" onClick={() => setLinking(true)}>
              <Link2 aria-hidden />
              Vincular usuário existente
            </AppButton>
          )}
          <AppButton type="button" onClick={() => setInviting(true)}>
            <UserPlus aria-hidden />
            Convidar pessoa
          </AppButton>
        </div>
      </div>

      {flash && (
        <div className="grid gap-2">
          <InviteLink url={flash} phone={invites[0]?.phone ?? null} />
          <div>
            <AppButton type="button" tone="outline" onClick={() => setFlash(null)}>
              Ocultar link
            </AppButton>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <EmptyState title="Ninguém na equipe ainda." description="Convide a primeira pessoa para dar acesso." />
      ) : (
        <>
          <div className="hidden md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="text-muted-foreground border-b text-sm">
                  <th className="py-2 pr-3 font-bold">Nome</th>
                  <th className="py-2 pr-3 font-bold">Papel</th>
                  <th className="py-2 pr-3 font-bold">Status</th>
                  <th className="py-2 pr-3 font-bold">Último acesso</th>
                  <th className="py-2 text-right font-bold">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className={cn("border-b last:border-0", !m.active && "opacity-80")}>
                    <td className="py-3 pr-3">
                      <span className="font-heading font-bold">{m.name}</span>
                      {you(m)}
                      <span className="text-muted-foreground block text-sm">{m.email}</span>
                    </td>
                    <td className="py-3 pr-3">{ROLE[m.role]}</td>
                    <td className="py-3 pr-3">
                      <ActiveBadge active={m.active} />
                    </td>
                    <td className="py-3 pr-3 text-sm tabular-nums">{lastSeen(m)}</td>
                    <td className="py-3">
                      <div className="flex justify-end">{memberActions(m)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-3 md:hidden">
            {members.map((m) => (
              <li key={m.id} className="bg-background grid gap-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-heading font-bold">
                      {m.name}
                      {you(m)}
                    </p>
                    <p className="text-muted-foreground text-sm break-all">{m.email}</p>
                  </div>
                  <ActiveBadge active={m.active} />
                </div>
                <p className="text-sm">
                  {ROLE[m.role]} <span className="text-muted-foreground">· Último acesso: {lastSeen(m)}</span>
                </p>
                {memberActions(m)}
              </li>
            ))}
          </ul>
        </>
      )}

      {invites.length > 0 && (
        <div className="grid gap-3 border-t pt-4">
          <h3 className="font-heading font-bold">Convites pendentes</h3>
          <ul className="grid gap-3">
            {invites.map((i) => (
              <li key={i.id} className="bg-background flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-heading font-bold">
                    {i.name} <span className="text-muted-foreground text-sm font-normal">· {ROLE[i.role]}</span>
                  </p>
                  <p className="text-muted-foreground text-sm break-all">{i.email}</p>
                  <p className="text-muted-foreground text-sm">Expira em {formatDateTime(i.expiresAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AppButton type="button" tone="outline" disabled={regenPending} onClick={() => regenerate(i)}>
                    {regenPending ? "Gerando…" : "Gerar novo link"}
                  </AppButton>
                  <ConfirmAction
                    danger
                    withReason={false}
                    triggerLabel="Revogar"
                    title="Revogar convite?"
                    description={`O link enviado a ${i.name} deixa de funcionar.`}
                    confirmLabel="Revogar"
                    successMessage="Convite revogado."
                    onConfirm={() => revokeInviteAction(i.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ResponsiveModal open={inviting} onOpenChange={setInviting} title="Convidar pessoa" description="Gere um link para a pessoa criar a senha e entrar.">
        <InviteForm action={inviteAction} onClose={() => setInviting(false)} />
      </ResponsiveModal>
      <ResponsiveModal open={!!regen} onOpenChange={(o) => !o && setRegen(null)} title="Novo link de convite" description="O link anterior foi revogado.">
        {regen && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <InviteLink url={regen.url} phone={regen.phone} />
            <div className="flex md:justify-end">
              <AppButton type="button" tone="outline" onClick={() => setRegen(null)}>
                Concluir
              </AppButton>
            </div>
          </div>
        )}
      </ResponsiveModal>
      {linkAction && organizationId && (
        <ResponsiveModal open={linking} onOpenChange={setLinking} title="Vincular usuário existente" description="A pessoa já tem conta no BeeDock e passa a acessar esta empresa.">
          <LinkForm action={linkAction} organizationId={organizationId} onClose={() => setLinking(false)} />
        </ResponsiveModal>
      )}
    </section>
  );
}
