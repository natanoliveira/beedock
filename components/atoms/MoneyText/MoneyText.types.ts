export type MoneyTextProps = {
  cents: number;
  tone?: "neutral" | "income" | "expense";
  signed?: boolean;
  className?: string;
};
