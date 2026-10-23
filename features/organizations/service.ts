import { appendAudit, authorize, withAudit, type TenantContext } from "@/lib/audit";
import { withScope } from "@/lib/db";
import { orgData, readOrganization, settingsData, writeOrganization } from "@/features/platform/service";
import type { CompanySettingsInput } from "./schemas";

/** Leitura da própria empresa; a page checa `can` antes. */
export function getCompanySettings(ctx: TenantContext) {
  return withScope({ organizationId: ctx.organizationId }, (tx) => readOrganization(tx, ctx.organizationId));
}

export async function updateCompanySettings(ctx: TenantContext, input: CompanySettingsInput): Promise<void> {
  await authorize(ctx, "settings.manage");
  const id = ctx.organizationId; // sempre do ctx, nunca do input
  await withAudit<Awaited<ReturnType<typeof writeOrganization>>>(
    ctx,
    ({ before, after }) => ({ action: "organization.update", entityType: "Organization", entityId: id, before, after }),
    async (tx) => {
      const changes = await writeOrganization(tx, id, orgData(input), settingsData(input.settings), ctx.userId);
      if (changes.idleChanged) {
        await tx.session.updateMany({
          where: { organizationId: id, revokedAt: null },
          data: { idleMinutes: input.settings.sessionIdleMinutes },
        });
      }
      return changes;
    },
  );
}

const logoName = (url: string | null) => (url ? (url.split("/").pop() ?? null) : null);

/** Grava a URL do logo (null remove). Igual à atual = no-op. `previous` é o blob a apagar depois do commit. */
export async function setCompanyLogo(ctx: TenantContext, url: string | null): Promise<{ previous: string | null }> {
  await authorize(ctx, "settings.manage");
  const id = ctx.organizationId;
  return withScope({ organizationId: id }, async (tx) => {
    const { logoUrl } = await tx.organization.findUniqueOrThrow({ where: { id }, select: { logoUrl: true } });
    if (logoUrl === url) return { previous: null };
    await tx.organization.update({ where: { id }, data: { logoUrl: url } });
    await appendAudit(tx, ctx, {
      action: "organization.update",
      entityType: "Organization",
      entityId: id,
      before: { logoUrl: logoName(logoUrl) },
      after: { logoUrl: logoName(url) },
    });
    return { previous: logoUrl };
  });
}
