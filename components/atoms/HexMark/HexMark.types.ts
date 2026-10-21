import type { ReactNode } from "react";

export type HexMarkProps = {
  children?: ReactNode;
  tone?: "primary" | "ink" | "muted" | "income" | "expense";
  size?: "sm" | "md" | "lg";
  className?: string;
};
