import "server-only";
import { env } from "@/lib/env";

export type MailStatus = "sent" | "skipped" | "failed";

/** Brevo transacional via fetch. Sem chave/remetente (ou em teste) não envia: o link copiável cobre. */
export async function sendMail(to: { email: string; name: string }, subject: string, html: string): Promise<MailStatus> {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM || process.env.NODE_ENV === "test") return "skipped";
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: "BeeDock", email: env.MAIL_FROM }, to: [to], subject, htmlContent: html }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
