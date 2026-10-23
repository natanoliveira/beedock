import { LegalLinks } from "@/components/molecules/LegalLinks";
import type { AppShellTemplateProps } from "./AppShellTemplate.types";

/** Topo escuro sticky com faixa tape, marca, menu horizontal e conta; conteúdo centralizado (máx. 1240px). */
export function AppShellTemplate({ brand, navigation, account, banner, brandStyle, children }: AppShellTemplateProps) {
  return (
    <div style={brandStyle} className="min-h-dvh">
      <header className="bg-ink text-ink-foreground sticky top-0 z-30">
        <div aria-hidden className="tape h-1.5" />
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-4 md:px-8 lg:gap-7">
          {brand}
          <span aria-hidden className="hidden h-7 w-px bg-white/10 lg:block" />
          {navigation}
          {account}
        </div>
      </header>
      {banner}
      <main className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-12 md:px-8 md:pt-8 md:pb-14">{children}</main>
      <footer className="mx-auto max-w-[1240px] px-4 pb-6 md:px-8">
        <LegalLinks />
      </footer>
    </div>
  );
}
