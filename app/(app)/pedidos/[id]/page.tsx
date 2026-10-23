import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderDetail } from "@/components/organisms/OrderDetail";
import {
  cancelOrderAction,
  changeOrderStatusAction,
  deleteOrderAction,
  deletePaymentAction,
  saveOrderAction,
  savePaymentAction,
} from "@/features/orders/actions";
import { getOrder, orderFormOptions } from "@/features/orders/queries";
import { dueLabel } from "@/features/orders/rules";
import { todayIn } from "@/features/transactions/period";
import { getFinancialSettings } from "@/features/transactions/service";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Pedido" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  const { id } = await params;
  const order = await getOrder(ctx, id);
  if (!order) notFound();
  const [options, settings] = await Promise.all([
    orderFormOptions(ctx, { productTypeId: order.productType.id }),
    getFinancialSettings(ctx),
  ]);
  const today = todayIn(settings.timezone);

  return (
    <OrderDetail
      order={{
        id: order.id,
        number: order.number,
        status: order.status,
        description: order.description,
        productTypeId: order.productType.id,
        productTypeName: order.productType.name,
        dueDate: order.dueDate,
        dueLabel: dueLabel(order.dueDate, today),
        overdue: order.overdue,
        deliveredOn: order.deliveredOn,
        canceledAt: order.canceledAt,
        totalCents: order.totalCents,
        paidCents: order.paidCents,
        balanceCents: order.balanceCents,
        customer: order.customer,
        payments: order.payments.map((p) => ({
          id: p.id,
          paidAt: p.paidAt,
          amountCents: p.amountCents,
          methodId: p.method.id,
          methodName: p.method.name,
          transactionId: p.transactionId,
        })),
        refund: order.refund && { amountCents: order.refund.amountCents, occurredOn: order.refund.occurredOn },
      }}
      options={options}
      today={today}
      canDelete={can(ctx.role, "order.delete")}
      saveOrderAction={saveOrderAction}
      changeStatusAction={changeOrderStatusAction}
      deleteOrderAction={deleteOrderAction}
      savePaymentAction={savePaymentAction}
      deletePaymentAction={deletePaymentAction}
      cancelOrderAction={cancelOrderAction}
    />
  );
}
