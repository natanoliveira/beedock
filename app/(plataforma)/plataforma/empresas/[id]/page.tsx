import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrgStatusBadge } from "@/components/atoms/OrgStatusBadge";
import { ConfirmAction } from "@/components/molecules/ConfirmAction";
import { EnterOrgButton } from "@/components/molecules/EnterOrgButton";
import { LogoDropzone } from "@/components/molecules/LogoDropzone";
import { TeamManager } from "@/components/organisms/TeamManager";
import { OrganizationForm } from "@/components/organisms/OrganizationForm";
import { toFormValues } from "@/components/organisms/OrganizationForm/values";
import {
  changeMemberRoleAction,
  inviteMemberAction,
  linkUserAction,
  revokeInvitationAction,
  setMemberActiveAction,
  switchOrganizationAction,
} from "@/features/members/actions";
import { consumeInviteFlashAction, setOrganizationStatusAction, updateOrganizationAction } from "@/features/platform/actions";
import { platformActor } from "@/features/platform/actor";
import { readInviteFlash } from "@/features/platform/invite-flash";
import { blobUploadEnabled } from "@/lib/blob";
import { uploadLogoAction } from "@/features/platform/logo-actions";
import { listTeam } from "@/features/members/service";
import { getOrganization } from "@/features/platform/service";
import { requireMaster } from "@/lib/session";

export const metadata: Metadata = { title: "Empresa" };

export default async function EmpresaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vinculado?: string }>;
}) {
  const { id } = await params;
  const { vinculado } = await searchParams;
  const session = await requireMaster();
  const actor = await platformActor();
  const org = await getOrganization(actor, id);
  if (!org) notFound();
  const team = await listTeam(actor, id);
  const flashUrl = await readInviteFlash();
  const suspended = org.status === "SUSPENDED";

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Link href="/plataforma" className="text-muted-foreground w-fit text-sm underline-offset-4 hover:underline">
          ← Empresas
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl leading-none font-black">{org.name}</h1>
          <OrgStatusBadge status={org.status} />
          <div className="ml-auto">
            <EnterOrgButton
              enterAction={switchOrganizationAction.bind(null, id)}
              disabled={org.status !== "ACTIVE"}
              disabledHint="Reative a empresa para entrar."
            />
          </div>
        </div>
        {org.status !== "ACTIVE" && <p className="text-muted-foreground text-sm">Reative a empresa para entrar.</p>}
      </div>

      {vinculado === "1" && (
        <p role="status" className="bg-warning-soft text-warning rounded-lg px-3 py-2.5 text-sm font-bold">
          Usuário já cadastrado: vinculado como Admin.
        </p>
      )}
      {suspended && (
        <p role="status" className="bg-warning-soft text-warning rounded-lg px-3 py-2.5 text-sm font-bold">
          Empresa suspensa: convites só funcionam depois de reativar.
        </p>
      )}

      <TeamManager
        members={team.members}
        invites={team.invites}
        currentUserId={session.user.id}
        flashUrl={flashUrl}
        consumeFlash={consumeInviteFlashAction.bind(null, id)}
        organizationId={id}
        inviteAction={inviteMemberAction.bind(null, id)}
        changeRoleAction={changeMemberRoleAction.bind(null, id)}
        setActiveAction={setMemberActiveAction.bind(null, id)}
        revokeInviteAction={revokeInvitationAction.bind(null, id)}
        linkAction={linkUserAction}
      />

      <OrganizationForm
        mode="edit"
        action={updateOrganizationAction.bind(null, id)}
        defaults={toFormValues(org)}
        logo={<LogoDropzone uploadAction={uploadLogoAction.bind(null, id)} logoUrl={org.logoUrl} enabled={blobUploadEnabled()} />}
      />

      <section aria-labelledby="status-title" className="bg-card grid gap-3 rounded-xl border p-4 md:p-5">
        <h2 id="status-title" className="text-lg leading-tight font-extrabold">
          {suspended ? "Reativar empresa" : "Suspender empresa"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {suspended
            ? "A empresa volta a aceitar logins. As sessões antigas continuam encerradas."
            : "Encerra as sessões ativas e bloqueia novos logins até a reativação. Os dados são mantidos."}
        </p>
        <div>
          {suspended ? (
            <ConfirmAction
              triggerLabel="Reativar empresa"
              title="Reativar esta empresa?"
              description={`${org.name} poderá entrar novamente.`}
              confirmLabel="Reativar"
              successMessage="Empresa reativada."
              onConfirm={setOrganizationStatusAction.bind(null, id, "ACTIVE")}
            />
          ) : (
            <ConfirmAction
              danger
              triggerLabel="Suspender empresa"
              title="Suspender esta empresa?"
              description={`Todos os usuários de ${org.name} serão desconectados agora.`}
              confirmLabel="Suspender"
              successMessage="Empresa suspensa."
              onConfirm={setOrganizationStatusAction.bind(null, id, "SUSPENDED")}
            />
          )}
        </div>
      </section>
    </div>
  );
}
