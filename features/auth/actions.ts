"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { revokeSession } from "@/features/auth/service";
import { LoginError, loginSchema, signIn, signOut } from "@/lib/auth";
import { requestMeta } from "@/lib/request";
import { getCurrentSession } from "@/lib/session";

export type LoginState = { error?: string; email?: string };

const MESSAGES: Record<string, string> = {
  invalid: "E-mail ou senha incorretos.",
  locked: "Conta bloqueada por excesso de tentativas. Tente novamente em 15 minutos.",
  rate: "Muitas tentativas a partir desta rede. Aguarde alguns minutos.",
  inactive: "Seu acesso está desativado. Fale com o administrador da empresa.",
};

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/inicio" });
    return {};
  } catch (error) {
    if (error instanceof LoginError) return { error: MESSAGES[error.code] ?? MESSAGES.invalid, email };
    if (error instanceof AuthError) return { error: "Não foi possível entrar agora. Tente novamente.", email };
    throw error; // redirect de sucesso
  }
}

export async function logoutAction() {
  const session = await getCurrentSession();
  if (session) {
    await revokeSession(session.sessionId, {
      userId: session.user.id,
      userName: session.user.name,
      role: session.user.isMaster ? "MASTER" : session.role,
      organizationId: session.organization?.id ?? null,
      meta: requestMeta(await headers()),
    });
  }
  await signOut({ redirectTo: "/login" });
}
