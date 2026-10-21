import type { OrganizationStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const STATUS: Record<OrganizationStatus, { label: string; className: string }> = {
  ACTIVE: { label: "Ativa", className: "bg-income-soft text-income" },
  SUSPENDED: { label: "Suspensa", className: "bg-warning-soft text-warning" },
  CLOSED: { label: "Encerrada", className: "bg-muted text-muted-foreground" },
};

export function OrgStatusBadge({ status, className }: { status: OrganizationStatus; className?: string }) {
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
