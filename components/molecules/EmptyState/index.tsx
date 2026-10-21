import { HexMark } from "@/components/atoms/HexMark";
import type { EmptyStateProps } from "./EmptyState.types";

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="bg-card grid justify-items-center gap-1 rounded-lg border px-4 py-8 text-center">
      <div aria-hidden className="mb-3 flex">
        <HexMark tone="muted" className="-mx-0.5" />
        <HexMark tone="primary" className="-mx-0.5 -translate-y-2.5" />
        <HexMark tone="muted" className="-mx-0.5" />
      </div>
      <p className="font-heading font-bold">{title}</p>
      {description && <p className="text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
