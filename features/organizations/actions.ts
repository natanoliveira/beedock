"use server";

/*
 * Contrato (Admin da própria empresa; organizationId sempre da sessão):
 * - updateCompanySettingsAction(prev, fd): campos de companySettingsSchema (name, primaryColor, …, settings.*). Sucesso: { ok, values }.
 * - uploadCompanyLogoAction(fd): campo `logo` (PNG/JPEG/WebP ≤ 1 MB). Devolve { url } ou { error }.
 * - removeCompanyLogoAction(): sem FormData. Devolve {} ou { error }.
 */

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/audit";
import { type FormState, plainValues, toFormState } from "@/lib/form-state";
import { ForbiddenError } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";
import { formDataToObject } from "@/features/platform/schemas";
import { deleteLogoBlob, storeLogo } from "./logo";
import { companySettingsSchema } from "./schemas";
import { setCompanyLogo, updateCompanySettings } from "./service";

const NOT_FOUND = "Este registro não existe mais. Atualize a página.";

export async function updateCompanySettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = plainValues(fd);
  try {
    const ctx = await requireTenant();
    const input = companySettingsSchema.parse(formDataToObject(fd));
    await updateCompanySettings(ctx, input);
    revalidatePath("/", "layout");
    return { ok: true, values: input };
  } catch (e) {
    return toFormState(e, NOT_FOUND, values);
  }
}

export async function uploadCompanyLogoAction(fd: FormData): Promise<{ url?: string; error?: string }> {
  try {
    const ctx = await requireTenant();
    await authorize(ctx, "settings.manage"); // antes do blob: Funcionário não sobe arquivo
    const stored = await storeLogo(ctx.organizationId, fd);
    if ("error" in stored) return stored;
    let previous: string | null;
    try {
      ({ previous } = await setCompanyLogo(ctx, stored.url));
    } catch (e) {
      await deleteLogoBlob(stored.url, ctx.organizationId); // gravação falhou: não deixa o blob novo órfão
      throw e;
    }
    if (previous && previous !== stored.url) await deleteLogoBlob(previous, ctx.organizationId);
    revalidatePath("/", "layout");
    return { url: stored.url };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}

export async function removeCompanyLogoAction(): Promise<{ error?: string }> {
  try {
    const ctx = await requireTenant();
    const { previous } = await setCompanyLogo(ctx, null);
    if (previous) await deleteLogoBlob(previous, ctx.organizationId);
    revalidatePath("/", "layout");
    return {};
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}
