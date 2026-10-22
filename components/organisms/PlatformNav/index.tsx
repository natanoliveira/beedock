"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/plataforma", label: "Empresas", match: (p: string) => p === "/plataforma" || p.startsWith("/plataforma/empresas") },
  { href: "/plataforma/usuarios", label: "Usuários", match: (p: string) => p.startsWith("/plataforma/usuarios") },
];

/** Menu da plataforma (MASTER): Empresas | Usuários. */
export function PlatformNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Plataforma" className={cn("flex h-11 items-stretch gap-1", className)}>
      {ITEMS.map((i) => {
        const active = i.match(pathname);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "font-heading relative flex items-center px-3 text-sm font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset",
              active ? "text-white" : "text-ink-foreground/75 hover:text-white",
            )}
          >
            {i.label}
            {active && <span aria-hidden className="bg-primary absolute inset-x-2.5 bottom-0 h-1 rounded-t" />}
          </Link>
        );
      })}
    </nav>
  );
}
