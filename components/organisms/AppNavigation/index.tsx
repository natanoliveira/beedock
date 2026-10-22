"use client";

import {
  ArrowDownUp,
  BarChart3,
  ChevronDown,
  Hexagon,
  History,
  Menu,
  Package,
  Settings,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AppButton } from "@/components/atoms/AppButton";
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from "@/components/atoms/AppDropdownMenu";
import {
  AppSheet,
  AppSheetContent,
  AppSheetDescription,
  AppSheetHeader,
  AppSheetTitle,
  AppSheetTrigger,
} from "@/components/atoms/AppSheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { AppNavigationProps } from "./AppNavigation.types";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean };

const AUDIT_HREF = "/configuracoes/auditoria";
const TEAM_HREF = "/configuracoes/equipe";

const isActive = (pathname: string, item: Item) => {
  if (item.href === "/configuracoes")
    return pathname.startsWith(item.href) && !pathname.startsWith(AUDIT_HREF) && !pathname.startsWith(TEAM_HREF);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
};

export function AppNavigation({ showReports, showAudit, showSettings, showTeam }: AppNavigationProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  // menu do topo aparece a partir do lg: a gaveta aberta fecha ao alargar a tela
  const wide = useMediaQuery("(min-width: 1024px)");
  if (wide && sheetOpen) setSheetOpen(false);

  const main: Item[] = [
    { href: "/inicio", label: "Início", icon: Hexagon },
    { href: "/pedidos", label: "Pedidos", icon: Package },
    { href: "/lancamentos", label: "Lançamentos", icon: ArrowDownUp },
    { href: "/clientes", label: "Clientes", icon: Users },
    ...(showReports ? [{ href: "/relatorios", label: "Relatórios", icon: BarChart3 }] : []),
  ];
  const company: Item[] = [
    ...(showSettings ? [{ href: "/configuracoes", label: "Configurações", icon: Settings }] : []),
    ...(showTeam ? [{ href: TEAM_HREF, label: "Equipe", icon: UsersRound }] : []),
    ...(showAudit ? [{ href: AUDIT_HREF, label: "Auditoria", icon: History }] : []),
  ];
  const companyActive = company.some((i) => isActive(pathname, i));

  const topLink =
    "font-heading relative flex h-full items-center gap-2 px-3 text-sm font-bold [font-stretch:100%] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset";

  return (
    <>
      <nav aria-label="Principal" className="hidden h-full flex-1 gap-1 lg:flex">
        {main.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(topLink, active ? "text-white" : "text-ink-foreground/75 hover:text-white")}
            >
              <Icon className={cn("size-[18px]", active && "text-primary")} aria-hidden />
              {item.label}
              {active && <span aria-hidden className="bg-primary absolute inset-x-2.5 bottom-0 h-1 rounded-t" />}
            </Link>
          );
        })}
        {company.length > 0 && (
          <AppDropdownMenu>
            <AppDropdownMenuTrigger
              className={cn(
                topLink,
                "cursor-pointer",
                companyActive ? "text-white" : "text-ink-foreground/75 hover:text-white",
              )}
            >
              Empresa
              <ChevronDown className="size-3.5" aria-hidden />
              {companyActive && <span aria-hidden className="bg-primary absolute inset-x-2.5 bottom-0 h-1 rounded-t" />}
            </AppDropdownMenuTrigger>
            <AppDropdownMenuContent className="w-52">
              {company.map((item) => {
                const Icon = item.icon;
                return (
                  <AppDropdownMenuItem
                    key={item.href}
                    asChild
                    className="font-heading min-h-10 gap-2.5 px-2.5 font-bold"
                  >
                    <Link href={item.href} aria-current={isActive(pathname, item) ? "page" : undefined}>
                      <Icon aria-hidden />
                      {item.label}
                    </Link>
                  </AppDropdownMenuItem>
                );
              })}
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        )}
      </nav>

      <AppSheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <AppSheetTrigger asChild>
          <AppButton
            type="button"
            tone="ghost"
            size="icon"
            aria-label="Abrir menu"
            className="order-last hover:bg-white/10 lg:hidden"
          >
            <Menu aria-hidden />
          </AppButton>
        </AppSheetTrigger>
        <AppSheetContent side="right" className="pb-8">
          <AppSheetHeader>
            <div aria-hidden className="tape mb-2 h-1.5 w-14 rounded-full" />
            <AppSheetTitle className="font-heading">Menu</AppSheetTitle>
            <AppSheetDescription className="sr-only">Navegação principal</AppSheetDescription>
          </AppSheetHeader>
          <nav aria-label="Principal" className="grid gap-1 px-4">
            {[...main, ...company].map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setSheetOpen(false)}
                  className={cn(
                    "font-heading flex min-h-11 items-center gap-3 rounded-lg px-3 font-bold [font-stretch:100%]",
                    active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-[22px]", active && "text-primary-strong")} aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </AppSheetContent>
      </AppSheet>
    </>
  );
}
