import type { Metadata } from "next";
import { AppButton } from "@/components/atoms/AppButton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { AuthTemplate } from "@/components/templates/AuthTemplate";
import { logoutAction } from "@/features/auth/actions";
import { requireMaster } from "@/lib/session";

export const metadata: Metadata = { title: "Plataforma" };

// ponytail: painel completo (empresas, convites, acesso de suporte) é a Fase 2
export default async function PlataformaPage() {
  const session = await requireMaster();
  return (
    <AuthTemplate title="Plataforma" subtitle={`Olá, ${session.user.name}.`}>
      <EmptyState
        title="Painel da plataforma"
        description="Empresas, convites e acesso de suporte chegam na Fase 2."
        action={
          <form action={logoutAction}>
            <AppButton type="submit" tone="outline">
              Sair
            </AppButton>
          </form>
        }
      />
    </AuthTemplate>
  );
}
