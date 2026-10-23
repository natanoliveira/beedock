"use server";

/*
 * Contrato de campos (FormData):
 * - saveCustomerAction: name, phone, email, document, address, note.
 * - anonymizeCustomerAction: reason (10–500 caracteres).
 * fieldErrors usa as mesmas chaves; values devolve os campos enviados.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/session";
import { toFormState, plainValues, type FormState } from "@/lib/form-state";
import { anonymizeSchema, customerSchema } from "./schemas";
import { anonymizeCustomer, createCustomer, deleteCustomer, updateCustomer } from "./service";

export type { FormState };

const NOT_FOUND = "Este cliente não existe mais. Atualize a página.";
const idSchema = z.string().min(1);

function revalidate(id?: string) {
  revalidatePath("/clientes");
  if (id) revalidatePath(`/clientes/${id}`);
  revalidatePath("/pedidos");
}

export async function saveCustomerAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = plainValues(fd);
  try {
    const ctx = await requireTenant();
    const input = customerSchema.parse(values);
    if (id === null) await createCustomer(ctx, input);
    else await updateCustomer(ctx, idSchema.parse(id), input);
  } catch (e) {
    return toFormState(e, NOT_FOUND, values);
  }
  revalidate(id ?? undefined);
  return { ok: true };
}

export async function deleteCustomerAction(id: string): Promise<FormState> {
  try {
    const ctx = await requireTenant();
    await deleteCustomer(ctx, idSchema.parse(id));
  } catch (e) {
    return toFormState(e, NOT_FOUND);
  }
  revalidate();
  return { ok: true };
}

export async function anonymizeCustomerAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = plainValues(fd);
  try {
    const ctx = await requireTenant();
    await anonymizeCustomer(ctx, idSchema.parse(id), anonymizeSchema.parse(values));
  } catch (e) {
    return toFormState(e, NOT_FOUND, values);
  }
  revalidate(id);
  return { ok: true };
}
