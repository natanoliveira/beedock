import "server-only";
import { type Actor, appendAudit } from "@/lib/audit";
import { withScope } from "@/lib/db";
import { sendMail, type MailStatus } from "@/lib/mail";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export type InviteMailInput = { id: string; url: string; name: string; email: string; role: "ADMIN" | "FUNCIONARIO" };

/** Envia o convite por e-mail depois do commit (nunca dentro de tx). Falha não desfaz o convite; o resultado vai à auditoria sem token. */
export async function sendInviteEmail(actor: Actor, organizationId: string, inv: InviteMailInput): Promise<MailStatus> {
  const org = await withScope({ organizationId }, (tx) => tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } }));
  const orgName = org?.name ?? "BeeDock";
  const role = inv.role === "ADMIN" ? "Administrador" : "Funcionário";
  const html = `<p>Olá, ${esc(inv.name)}!</p>
<p>Você foi convidado(a) para o BeeDock da empresa <strong>${esc(orgName)}</strong> como ${role}.</p>
<p><a href="${esc(inv.url)}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Criar minha senha</a></p>
<p>O link vale por 48 horas. Se o botão não abrir, copie este endereço:<br>${esc(inv.url)}</p>`;
  const status = await sendMail({ email: inv.email, name: inv.name }, `Convite para o BeeDock — ${orgName}`, html);
  if (status !== "skipped") {
    await withScope({ organizationId }, (tx) =>
      appendAudit(tx, { ...actor, organizationId }, { action: "invitation.email", entityType: "Invitation", entityId: inv.id, after: { status } }),
    ).catch(() => undefined);
  }
  return status;
}
