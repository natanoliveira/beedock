export type KpiTone = "income" | "expense" | "profit" | "receivable";

export type KpiCardProps = { label: string; cents: number; tone: KpiTone };
