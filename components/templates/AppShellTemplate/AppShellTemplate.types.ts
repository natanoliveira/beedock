import type { CSSProperties, ReactNode } from "react";

export type AppShellTemplateProps = {
  /** Marca da empresa (esquerda do topo). */
  brand: ReactNode;
  /** Menu: nav horizontal (≥lg) + botão/gaveta (<lg). Renderizado como itens do flex do topo. */
  navigation: ReactNode;
  /** Usuário + sair (direita do topo). */
  account: ReactNode;
  banner?: ReactNode;
  brandStyle?: CSSProperties;
  children: ReactNode;
};
