import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { HexMarkProps } from "./HexMark.types";

const hexMark = cva("hex inline-grid shrink-0 place-items-center font-heading font-extrabold [font-stretch:100%]", {
  variants: {
    tone: {
      primary: "bg-primary text-primary-foreground",
      ink: "bg-foreground text-background",
      muted: "bg-muted text-muted-foreground",
      income: "bg-income-soft text-income",
      expense: "bg-expense-soft text-expense",
    },
    size: { sm: "h-[18px] w-4 text-[0px]", md: "h-[46px] w-10 text-sm", lg: "h-[58px] w-[50px] text-base" },
  },
});

export function HexMark({ children, tone = "primary", size = "md", className }: HexMarkProps) {
  return (
    <span aria-hidden={children ? undefined : true} className={cn(hexMark({ tone, size }), className)}>
      {children}
    </span>
  );
}
