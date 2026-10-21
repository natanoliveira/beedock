import type { ReactNode } from "react";

export type AuthTemplateProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  footer?: string;
  children: ReactNode;
};
