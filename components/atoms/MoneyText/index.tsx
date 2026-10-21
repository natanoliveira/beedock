import { cn } from "@/lib/utils";
import { formatCents } from "./format";
import type { MoneyTextProps } from "./MoneyText.types";

const TONES = { neutral: "", income: "text-income", expense: "text-expense" };

export function MoneyText({ cents, tone = "neutral", signed = false, className }: MoneyTextProps) {
  return (
    <span className={cn("font-heading font-extrabold [font-stretch:100%] tabular-nums", TONES[tone], className)}>
      {formatCents(cents, signed)}
    </span>
  );
}
