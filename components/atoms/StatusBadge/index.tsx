import { cn } from "@/lib/utils";
import type { StatusBadgeProps } from "./StatusBadge.types";

const STATUS = {
  OPEN: { label: "Aberto", className: "bg-warning-soft text-warning" },
  READY: { label: "Pronto", className: "bg-receivable-soft text-receivable" },
  DELIVERED: { label: "Entregue", className: "bg-income-soft text-income" },
  CANCELED: { label: "Cancelado", className: "bg-muted text-muted-foreground line-through" },
} as const;

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "font-heading inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-[13px] font-bold [font-stretch:100%]",
        s.className,
        className,
      )}
    >
      <span aria-hidden className="hex h-2.5 w-[9px] bg-current" />
      {s.label}
    </span>
  );
}
