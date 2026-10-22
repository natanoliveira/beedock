import { LogoutButton } from "@/components/molecules/LogoutButton";
import type { OrgAccountProps } from "./OrgAccount.types";

/** Usuário logado (nome + papel) e botão de sair. */
export function OrgAccount({ userName, roleLabel, logoutAction }: OrgAccountProps) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <div className="hidden text-right leading-tight sm:block">
        <p className="max-w-40 truncate text-[13px] font-bold">{userName}</p>
        <p className="text-ink-foreground/65 text-[11px]">{roleLabel}</p>
      </div>
      <LogoutButton logoutAction={logoutAction} />
    </div>
  );
}
