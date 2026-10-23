export type LogoutButtonProps = {
  logoutAction: () => Promise<void>;
  /** Texto visível no gatilho (botão outline); sem label, ícone para o topo escuro. */ label?: string;
};
