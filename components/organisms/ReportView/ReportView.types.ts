type Totals = { incomeCents: number; expenseCents: number; profitCents: number };

export type ReportViewProps = {
  report: Totals & {
    toReceiveCents: number;
    incomeByCategory: { name: string; totalCents: number; pct: number }[];
    expenseByCategory: { name: string; totalCents: number; pct: number }[];
    last6: Totals[];
    orders: {
      created: { count: number; totalCents: number };
      delivered: { count: number; totalCents: number };
      canceled: { count: number; refundedCents: number };
    };
  };
  month: { title: string; range: string | null; selected: string; prev: string; next: string | null; current: string };
  last6Labels: string[];
  canExport: boolean;
};
