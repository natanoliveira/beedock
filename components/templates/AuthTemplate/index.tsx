import { HexMark } from "@/components/atoms/HexMark";
import type { AuthTemplateProps } from "./AuthTemplate.types";

export function AuthTemplate({ title, subtitle, children }: AuthTemplateProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div aria-hidden className="tape h-2" />
      <main className="mx-auto grid w-full max-w-sm flex-1 content-center gap-8 px-4 py-10">
        <div className="grid gap-3">
          <div className="flex items-center gap-2.5">
            <HexMark tone="primary">BD</HexMark>
            <span className="font-heading text-xl font-black [font-stretch:125%]">
              Bee<span className="text-primary-strong">Dock</span>
            </span>
          </div>
          <h1 className="text-3xl leading-none font-black">{title}</h1>
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-xl border p-5 shadow-sm">{children}</div>
      </main>
    </div>
  );
}
