import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/organisms/LoginForm";
import { AuthTemplate } from "@/components/templates/AuthTemplate";
import { loginAction } from "@/features/auth/actions";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) redirect(session.user.isMaster && !session.organization ? "/plataforma" : "/inicio");

  return (
    <AuthTemplate title="Entrar" subtitle="Pedidos, entradas e saídas da sua estamparia em um só lugar.">
      <LoginForm action={loginAction} />
    </AuthTemplate>
  );
}
