import type { OrderStatus } from "@/generated/prisma/enums";

export type StatusBadgeProps = { status: OrderStatus; className?: string };
