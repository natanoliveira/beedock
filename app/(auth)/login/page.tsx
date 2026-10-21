import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/organisms/LoginForm";
import { AuthTemplate } from "@/components/templates/AuthTemplate";
import { loginAction } from "@/features/auth/actions";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const accepted = sp.convite === "aceito";
  const email = typeof sp.email === "string" ? sp.email : undefined;
  const session = await getCurrentSession();
  if (session) redirect(session.user.isMaster && !session.organization ? "/plataforma" : "/inicio");

  return (
    <AuthTemplate
      eyebrow="Área do cliente"
      title="Entrar"
      footer="Acesso criado pelo administrador da sua empresa."
      subtitle="Use o e-mail e a senha da sua conta."
    >
      <LoginForm
        action={loginAction}
        notice={accepted ? "Conta criada. Entre com seu e-mail e senha." : undefined}
        defaultEmail={accepted ? email : undefined}
      />
    </AuthTemplate>
  );
}
