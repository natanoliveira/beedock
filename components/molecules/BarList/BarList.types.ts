export type BarListProps = {
  items: { name: string; totalCents: number; pct: number }[];
  tone: "income" | "expense";
  emptyLabel: string;
};
