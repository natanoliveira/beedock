"use server";

/*
 * Contrato de campos (FormData) de saveTransactionAction:
 * - type: "INCOME" | "EXPENSE"
 * - amount: texto em reais (ex.: "1.234,56")
 * - occurredOn: "YYYY-MM-DD"
 * - categoryId, paymentMethodId (opcional), description
 * - payerName, payerDocument (opcionais, só para INCOME)
 * - receipt: File (opcional; File vazio = sem arquivo)
 * - removeReceipt: "on" para remover o comprovante atual
 * fieldErrors usa as mesmas chaves; values devolve os campos de texto enviados (nunca o File).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/session";
import { toFormState, plainValues, type FormState } from "@/features/platform/form-state";
import { transactionSchema } from "./schemas";
import { createTransaction, deleteTransaction, updateTransaction } from "./service";

export type { FormState };

const NOT_FOUND = "Este lançamento não existe mais. Atualize a página.";
const idSchema = z.string().min(1);

function revalidate() {
  revalidatePath("/lancamentos");
  revalidatePath("/inicio");
}

export async function saveTransactionAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = plainValues(fd);
  const entry = fd.get("receipt");
  const file = entry instanceof File && entry.size > 0 ? entry : undefined;
  try {
    const ctx = await requireTenant();
    const input = transactionSchema.parse(values);
    if (id === null) await createTransaction(ctx, input, file);
    else await updateTransaction(ctx, idSchema.parse(id), input, file);
  } catch (e) {
    return toFormState(e, NOT_FOUND, values);
  }
  revalidate();
  return { ok: true };
}

export async function deleteTransactionAction(id: string): Promise<FormState> {
  try {
    const ctx = await requireTenant();
    await deleteTransaction(ctx, idSchema.parse(id));
  } catch (e) {
    return toFormState(e, NOT_FOUND);
  }
  revalidate();
  return { ok: true };
}
