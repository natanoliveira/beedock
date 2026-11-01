import { MoneyText } from "@/components/atoms/MoneyText";
import { cn } from "@/lib/utils";
import type { BarListProps } from "./BarList.types";

export function BarList({ items, tone, emptyLabel }: BarListProps) {
  if (!items.length) return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  return (
    <ul className="grid gap-3">
      {items.map((i) => (
        <li key={i.name} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {i.name} <span className="text-muted-foreground text-xs">{i.pct}%</span>
            </span>
            <MoneyText cents={i.totalCents} tone={tone} />
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
            <div
              className={cn("h-full rounded-full", tone === "income" ? "bg-income" : "bg-expense")}
              style={{ width: `${i.pct}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
