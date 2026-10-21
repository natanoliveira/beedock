import type { AppShellTemplateProps } from "./AppShellTemplate.types";

/** <md: cabeçalho + conteúdo + barra inferior. ≥md: sidebar fixa à esquerda. */
export function AppShellTemplate({ header, navigation, banner, brandStyle, children }: AppShellTemplateProps) {
  return (
    <div style={brandStyle} className="min-h-dvh md:grid md:grid-cols-[264px_1fr]">
      <aside className="bg-ink text-ink-foreground md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
        <div aria-hidden className="tape h-1.5" />
        <div className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 md:pt-5">{header}</div>
        {/* navigation traz as duas versões: sidebar (≥md) e barra inferior fixa (<md) */}
        <div className="md:bg-card md:text-foreground md:flex-1 md:overflow-y-auto md:px-3 md:py-4">{navigation}</div>
      </aside>
      <div className="min-w-0">
        {banner}
        <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-12">{children}</main>
      </div>
    </div>
  );
}
