import type { Metadata } from "next";
import { headers } from "next/headers";
import { AcceptInviteForm } from "@/components/organisms/AcceptInviteForm";
import { AuthTemplate } from "@/components/templates/AuthTemplate";
import { acceptInvitationAction } from "@/features/platform/actions";
import { findInvitation } from "@/features/platform/invitations";
import { requestMeta } from "@/lib/request";

export const metadata: Metadata = { title: "Aceitar convite", robots: { index: false } };

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findInvitation(token, requestMeta(await headers()));

  if (!invite) {
    return (
      <AuthTemplate title="Convite indisponível">
        <p role="alert" className="bg-expense-soft text-expense rounded-lg px-3 py-2.5 text-sm font-bold">
          Convite inválido ou expirado. Peça um novo ao suporte.
        </p>
      </AuthTemplate>
    );
  }

  return (
    <AuthTemplate title={`Bem-vindo, ${invite.name}`} subtitle={
        invite.existingUser
          ? `${invite.organizationName} · ${invite.email}. Você já tem conta: confirme sua senha para entrar nesta empresa.`
          : `${invite.organizationName} · ${invite.email}. Defina sua senha para entrar.`
      }
    >
      <AcceptInviteForm token={token} action={acceptInvitationAction} existingUser={invite.existingUser} />
    </AuthTemplate>
  );
}
