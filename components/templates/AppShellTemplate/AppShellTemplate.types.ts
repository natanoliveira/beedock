import type { CSSProperties, ReactNode } from "react";

export type AppShellTemplateProps = {
  header: ReactNode;
  navigation: ReactNode;
  banner?: ReactNode;
  brandStyle?: CSSProperties;
  children: ReactNode;
};
