"use server";

/*
 * Contrato de campos (FormData):
 * - saveCategoryAction: name, type ("INCOME" | "EXPENSE"; ignorado na edição, o tipo não muda).
 * - savePaymentMethodAction: name.
 * - set*ActiveAction(id, active): argumentos vinculados (não FormData), validados em runtime.
 * fieldErrors usa as mesmas chaves; values devolve os campos enviados.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/session";
import { toFormState, plainValues, type FormState } from "@/features/platform/form-state";
import { categorySchema, paymentMethodSchema } from "./schemas";
import {
  createCategory,
  createPaymentMethod,
  updateCategory,
  updatePaymentMethod,
} from "./service";

export type { FormState };

const NOT_FOUND = "Este item não existe mais. Atualize a página.";
const idSchema = z.string().min(1);
const activeSchema = z.boolean();

function revalidate(path: string) {
  revalidatePath(path);
  revalidatePath("/lancamentos");
  revalidatePath("/inicio");
}

const CATEGORIES = "/configuracoes/categorias";
const METHODS = "/configuracoes/formas-de-pagamento";

export async function saveCategoryAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = plainValues(fd);
  try {
    const ctx = await requireTenant();
    if (id === null) await createCategory(ctx, categorySchema.parse(values));
    else {
      const { name } = categorySchema.pick({ name: true }).parse(values);
      await updateCategory(ctx, idSchema.parse(id), { name });
    }
  } catch (e) {
    return toFormState(e, NOT_FOUND, values);
  }
  revalidate(CATEGORIES);
  return { ok: true };
}

export async function setCategoryActiveAction(id: string, active: boolean): Promise<FormState> {
  try {
    const ctx = await requireTenant();
    await updateCategory(ctx, idSchema.parse(id), { active: activeSchema.parse(active) });
  } catch (e) {
    return toFormState(e, NOT_FOUND);
  }
  revalidate(CATEGORIES);
  return { ok: true };
}

export async function savePaymentMethodAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = plainValues(fd);
  try {
    const ctx = await requireTenant();
    const input = paymentMethodSchema.parse(values);
    if (id === null) await createPaymentMethod(ctx, input);
    else await updatePaymentMethod(ctx, idSchema.parse(id), { name: input.name });
  } catch (e) {
    return toFormState(e, NOT_FOUND, values);
  }
  revalidate(METHODS);
  return { ok: true };
}

export async function setPaymentMethodActiveAction(id: string, active: boolean): Promise<FormState> {
  try {
    const ctx = await requireTenant();
    await updatePaymentMethod(ctx, idSchema.parse(id), { active: activeSchema.parse(active) });
  } catch (e) {
    return toFormState(e, NOT_FOUND);
  }
  revalidate(METHODS);
  return { ok: true };
}
