import { HexMark } from "@/components/atoms/HexMark";
import { MoneyText } from "@/components/atoms/MoneyText";
import { cn } from "@/lib/utils";
import type { KpiCardProps } from "./KpiCard.types";

const TONES = {
  income: { card: "text-income", hex: "income" },
  expense: { card: "text-expense", hex: "expense" },
  profit: { card: "border-primary bg-warning-soft text-warning", hex: "primary" },
  receivable: { card: "text-receivable", hex: "muted" },
} as const;

export function KpiCard({ label, cents, tone }: KpiCardProps) {
  const t = TONES[tone];
  return (
    <div className={cn("bg-card relative overflow-hidden rounded-lg border p-3 shadow-sm md:p-4", t.card)}>
      <HexMark tone={t.hex} size="lg" className="absolute -top-3 -right-3 opacity-25" />
      <p className="font-heading relative text-xs font-bold tracking-wider uppercase [font-stretch:100%]">{label}</p>
      <MoneyText cents={cents} className="text-foreground relative mt-1 block text-xl md:text-2xl" />
    </div>
  );
}
