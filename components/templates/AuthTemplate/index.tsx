import { HexMark } from "@/components/atoms/HexMark";
import { cn } from "@/lib/utils";
import type { AuthTemplateProps } from "./AuthTemplate.types";

const FACTS = [
  "Pedidos com prazo e sinal à vista",
  "Caixa do mês sempre fechado",
  "Cada alteração registrada na auditoria",
];

// favo decorativo: células cheias de mel em posições fixas (previews/login-split.html)
const FILLED = new Set([2, 8, 9, 13, 19]);
const HALF = new Set([3, 12, 18]);
const CELLS = Array.from({ length: 20 }, (_, i) =>
  FILLED.has(i) ? "bg-primary" : HALF.has(i) ? "bg-primary/35" : "bg-primary/7",
);

export function AuthTemplate({ title, subtitle, eyebrow, footer, children }: AuthTemplateProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside
        aria-label="BeeDock"
        className="text-ink-foreground relative isolate grid content-between gap-8 overflow-hidden bg-[var(--propolis)] px-4 pt-6 pb-7 lg:px-14 lg:pt-10 lg:pb-11"
      >
        <div aria-hidden className="tape absolute inset-x-0 top-0 h-2" />
        <div
          aria-hidden
          className="absolute -right-[20%] -bottom-[30%] -z-10 aspect-square w-4/5 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--mel)_28%,transparent),transparent)]"
        />

        <div className="mt-2 flex items-center gap-2.5">
          <span aria-hidden className="contents">
            <HexMark tone="primary" className="h-[41px] w-9 text-sm font-black">
              BD
            </HexMark>
          </span>
          <span className="font-heading text-[22px] font-black [font-stretch:125%]">
            Bee<span className="text-primary">Dock</span>
          </span>
        </div>

        <div className="hidden max-w-[560px] lg:block">
          <p className="font-heading mb-4 text-[clamp(32px,3.1vw,46px)] leading-[.98] font-black tracking-tight [font-stretch:125%]">
            Sua estamparia organizada como <span className="text-primary">uma colmeia.</span>
          </p>
          <p className="text-ink-foreground/75 max-w-[36ch] text-[17px]">
            Pedidos, entradas e saídas no mesmo lugar, do balcão ao celular.
          </p>
        </div>
        <p className="text-ink-foreground/75 max-w-[24ch] lg:hidden">
          Pedidos, entradas e saídas da sua estamparia em um só lugar.
        </p>

        <ul className="hidden gap-3 lg:grid">
          {FACTS.map((fact) => (
            <li key={fact} className="text-ink-foreground/90 flex items-center gap-3 text-[15px]">
              <HexMark tone="primary" size="sm" />
              {fact}
            </li>
          ))}
        </ul>

        <div
          aria-hidden
          className="pointer-events-none absolute -right-[90px] -bottom-[60px] -z-10 grid grid-cols-[repeat(4,48px)] gap-x-1 gap-y-1.5 lg:-right-[60px] lg:-bottom-[70px] lg:grid-cols-[repeat(5,76px)]"
        >
          {CELLS.map((tone, i) => (
            <i
              key={i}
              style={{ animationDelay: `${i * 25}ms` }}
              className={cn(
                "hex animate-in fade-in zoom-in-60 fill-mode-both h-[54px] w-12 duration-700 motion-reduce:animate-none lg:h-[86px] lg:w-[76px]",
                // fileiras alternadas deslocadas para formar o favo
                Math.floor(i / 4) % 2 === 1 && "translate-x-[26px] lg:translate-x-0",
                Math.floor(i / 5) % 2 === 1 && "lg:translate-x-10",
                tone,
              )}
            />
          ))}
        </div>
      </aside>

      <main className="grid place-items-center px-4 pt-8 pb-12 lg:px-14 lg:py-12">
        <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both grid w-full max-w-[400px] gap-7 delay-100 duration-500 motion-reduce:animate-none">
          <div className="grid gap-2">
            {eyebrow && (
              <span className="font-heading text-muted-foreground flex items-center gap-2 text-xs font-extrabold tracking-[.12em] uppercase">
                <HexMark tone="primary" size="sm" className="h-2.5 w-[9px]" />
                {eyebrow}
              </span>
            )}
            <h1 className="text-[40px] leading-none font-black tracking-tight">{title}</h1>
            {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
          {footer && <p className="text-muted-foreground text-center text-[13px]">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
