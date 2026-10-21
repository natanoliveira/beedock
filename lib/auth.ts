import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { verifyCredentials, type LoginResult } from "@/features/auth/service";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requestMeta } from "@/lib/request";

declare module "next-auth" {
  interface Session {
    sid?: string;
  }
}

export const loginSchema = z.object({
  email: z.email("Informe um e-mail válido.").trim(),
  password: z.string().min(1, "Informe a senha."),
});

export class LoginError extends CredentialsSignin {
  constructor(reason: Exclude<LoginResult, { ok: true }>["reason"]) {
    super();
    this.code = reason;
  }
}

// JWT só carrega o id da sessão (sid). Validade, inatividade e revogação
// são checadas na tabela Session a cada request (lib/session.ts).
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  logger: {
    // falha de credencial já vai para a auditoria; não poluir o log com stack trace
    error(error) {
      if (error.name !== "CredentialsSignin") logger.error("auth", error);
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) throw new LoginError("invalid");
        const result = await verifyCredentials(parsed.data.email, parsed.data.password, requestMeta(request.headers));
        if (!result.ok) throw new LoginError(result.reason);
        return { id: result.sessionId };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sid = user.id;
      return token;
    },
    session({ session, token }) {
      session.sid = typeof token.sid === "string" ? token.sid : undefined;
      return session;
    },
  },
});
