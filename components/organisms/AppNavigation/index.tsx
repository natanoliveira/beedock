"use client";

import {
  ArrowDownUp,
  BarChart3,
  Ellipsis,
  Hexagon,
  History,
  Package,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppSheet, AppSheetContent, AppSheetHeader, AppSheetTitle, AppSheetTrigger } from "@/components/atoms/AppSheet";
import { cn } from "@/lib/utils";
import type { AppNavigationProps } from "./AppNavigation.types";

type Item = { href: string; label: string; icon: LucideIcon };

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function NavLink({ item, pathname, compact }: { item: Item; pathname: string; compact?: boolean }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        compact
          ? "grid min-h-11 justify-items-center gap-0.5 text-[11px] font-bold"
          : "font-heading flex min-h-11 items-center gap-3 rounded-lg px-3 font-bold [font-stretch:100%]",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        !compact && active && "bg-muted",
      )}
    >
      <Icon className={cn("size-[22px]", active && "text-primary-strong")} aria-hidden />
      {item.label}
    </Link>
  );
}

export function AppNavigation({ showReports, showAudit, showSettings }: AppNavigationProps) {
  const pathname = usePathname();

  const main: Item[] = [
    { href: "/inicio", label: "Início", icon: Hexagon },
    { href: "/pedidos", label: "Pedidos", icon: Package },
    { href: "/lancamentos", label: "Lançamentos", icon: ArrowDownUp },
    ...(showReports ? [{ href: "/relatorios", label: "Relatórios", icon: BarChart3 }] : []),
  ];
  const more: Item[] = [
    { href: "/clientes", label: "Clientes", icon: Users },
    ...(showSettings ? [{ href: "/configuracoes", label: "Configurações", icon: Settings }] : []),
    ...(showAudit ? [{ href: "/configuracoes/auditoria", label: "Auditoria", icon: History }] : []),
  ];

  return (
    <>
      <nav aria-label="Principal" className="hidden gap-1 md:grid">
        {[...main, ...more].map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <nav
        aria-label="Principal"
        className="bg-card fixed inset-x-0 bottom-0 z-40 grid h-[76px] auto-cols-fr grid-flow-col items-center border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {main.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} compact />
        ))}
        <AppSheet>
          <AppSheetTrigger className="text-muted-foreground grid min-h-11 justify-items-center gap-0.5 text-[11px] font-bold">
            <Ellipsis className="size-[22px]" aria-hidden />
            Mais
          </AppSheetTrigger>
          <AppSheetContent side="bottom" className="rounded-t-3xl pb-8">
            <AppSheetHeader>
              <div aria-hidden className="tape mx-auto mb-2 h-1.5 w-14 rounded-full" />
              <AppSheetTitle className="font-heading">Mais opções</AppSheetTitle>
            </AppSheetHeader>
            <div className="grid gap-1 px-4">
              {more.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </AppSheetContent>
        </AppSheet>
      </nav>
    </>
  );
}
