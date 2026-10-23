import type { OrderStatus } from "@/generated/prisma/enums";

export type { OrderStatus };

const NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  OPEN: ["READY", "DELIVERED", "CANCELED"],
  READY: ["OPEN", "DELIVERED", "CANCELED"],
  DELIVERED: ["OPEN", "READY"],
  CANCELED: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => NEXT[from].includes(to);

export const balanceCents = (totalCents: number, paidCents: number): number => totalCents - paidCents;

/** Datas "YYYY-MM-DD" comparam como texto. */
export const isOverdue = (dueDate: string, today: string): boolean => dueDate < today;

export function dueLabel(dueDate: string, today: string): string {
  if (dueDate === today) return "hoje";
  const t = new Date(`${today}T00:00:00.000Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  if (dueDate === t.toISOString().slice(0, 10)) return "amanhã";
  return `${dueDate.slice(8, 10)}/${dueDate.slice(5, 7)}`;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatBrl = (cents: number): string => BRL.format(cents / 100).replace(/ /g, " ");
