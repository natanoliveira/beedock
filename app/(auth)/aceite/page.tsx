import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TermsAcceptForm } from "@/components/organisms/TermsAcceptForm";
import { AuthTemplate } from "@/components/templates/AuthTemplate";
import { logoutAction } from "@/features/auth/actions";
import { acceptTermsAction } from "@/features/legal/actions";
import { pendingLegalDocumentsFor } from "@/features/legal/service";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = { title: "Aceite dos termos", robots: { index: false } };

const TITLES = { TERMS: "Termos de Uso", PRIVACY: "Política de Privacidade" } as const;

export default async function AceitePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const home = session.user.isMaster && !session.organization ? "/plataforma" : "/inicio";
  if (session.user.isMaster) redirect(home);
  const pending = await pendingLegalDocumentsFor(db, session.user.id);
  if (pending.length === 0) redirect(home);

  return (
    <AuthTemplate
      eyebrow="Antes de continuar"
      title="Termos e privacidade"
      subtitle="Leia e aceite para acessar o BeeDock."
    >
      <TermsAcceptForm
        action={acceptTermsAction}
        logoutAction={logoutAction}
        documents={pending.map((d) => ({
          id: d.id,
          title: TITLES[d.type],
          version: d.version,
          publishedAt: d.publishedAt,
          content: d.content,
          updated: d.updated,
        }))}
      />
    </AuthTemplate>
  );
}
