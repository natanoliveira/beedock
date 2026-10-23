"use server";

/*
 * Contrato de campos (FormData) de saveOrderAction:
 * - customerId (existente) OU newCustomerName + newCustomerPhone; productTypeId, description,
 *   total (reais, ex.: "600,00"), dueDate ("YYYY-MM-DD")
 * - só na criação: depositAmount, depositPaymentMethodId, depositPaidAt (sinal opcional)
 * Contrato de cancelOrderAction: reason (opcional) e, se houver recebimentos, refundAmount (reais),
 * refundPaymentMethodId, refundPaidAt ("YYYY-MM-DD").
 * Contrato de savePaymentAction: amount (reais), paymentMethodId, paidAt ("YYYY-MM-DD").
 * fieldErrors usa as mesmas chaves; values devolve os campos enviados.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/session";
import { toFormState, plainValues, type FormState } from "@/lib/form-state";
import { deletePayment, registerPayment, updatePayment } from "./payments";
import { cancelSchema, orderSchema, orderUpdateSchema, paymentSchema } from "./schemas";
import { cancelOrder, changeOrderStatus, createOrder, deleteOrder, updateOrder } from "./service";

export type { FormState };

const NOT_FOUND = "Este pedido não existe mais. Atualize a página.";
const idSchema = z.string().min(1);
const statusSchema = z.enum(["OPEN", "READY", "DELIVERED"]);

function revalidate(id?: string) {
  revalidatePath("/pedidos");
  revalidatePath("/inicio");
  revalidatePath("/clientes");
  revalidatePath("/lancamentos");
  if (id) revalidatePath(`/pedidos/${id}`);
}

export async function saveOrderAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = plainValues(fd);
  try {
    const ctx = await requireTenant();
    if (id === null) await createOrder(ctx, orderSchema.parse(values));
    else await updateOrder(ctx, idSchema.parse(id), orderUpdateSchema.parse(values));
  } catch (e) {
    return toFormState(e, NOT_FOUND, values);
  }
  revalidate(id ?? undefined);
  return { ok: true };
}

export async function changeOrderStatusAction(id: string, to: string): Promise<FormState> {
  try {
    const ctx = await requireTenant();
    await changeOrderStatus(ctx, idSchema.parse(id), statusSchema.parse(to));
  } catch (e) {
    return toFormState(e, NOT_FOUND);
  }
  revalidate(id);
  return { ok: true };
}

export async function deleteOrderAction(id: string): Promise<FormState> {
  try {
    const ctx = await requireTenant();
    await deleteOrder(ctx, idSchema.parse(id));
  } catch (e) {
    return toFormState(e, NOT_FOUND);
  }
  revalidate();
  return { ok: true };
}

export async function savePaymentAction(
  orderId: string,
  paymentId: string | null,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const values = plainValues(fd);
  try {
    const ctx = await requireTenant();
    const input = paymentSchema.parse(values);
    if (paymentId === null) await registerPayment(ctx, idSchema.parse(orderId), input);
    else await updatePayment(ctx, idSchema.parse(paymentId), input);
  } catch (e) {
    return toFormState(e, "Este recebimento não existe mais. Atualize a página.", values);
  }
  revalidate(orderId);
  return { ok: true };
}

export async function deletePaymentAction(orderId: string, paymentId: string): Promise<FormState> {
  try {
    const ctx = await requireTenant();
    await deletePayment(ctx, idSchema.parse(paymentId));
  } catch (e) {
    return toFormState(e, "Este recebimento não existe mais. Atualize a página.");
  }
  revalidate(orderId);
  return { ok: true };
}

export async function cancelOrderAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = plainValues(fd);
  try {
    const ctx = await requireTenant();
    await cancelOrder(ctx, idSchema.parse(id), cancelSchema.parse(values));
  } catch (e) {
    return toFormState(e, NOT_FOUND, values);
  }
  revalidate(id);
  return { ok: true };
}
