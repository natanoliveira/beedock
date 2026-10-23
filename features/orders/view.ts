import type { OrderRow } from "./queries";
import { dueLabel } from "./rules";

/** Linha pronta para as telas: o texto de prazo é calculado no servidor (mesmo fuso da empresa). */
export const toViewRow = (o: OrderRow, today: string) => ({
  id: o.id,
  number: o.number,
  customerName: o.customer.name,
  description: o.description,
  productTypeName: o.productType.name,
  dueLabel: dueLabel(o.dueDate, today),
  overdue: o.overdue,
  status: o.status,
  totalCents: o.totalCents,
  paidCents: o.paidCents,
  balanceCents: o.balanceCents,
});
