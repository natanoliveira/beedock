"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppInput } from "@/components/atoms/AppInput";
import { AppLabel } from "@/components/atoms/AppLabel";
import { startNavigationProgress } from "@/components/atoms/NavigationProgress";
import { AppSelect } from "@/components/atoms/AppSelect";
import { EmptyState } from "@/components/molecules/EmptyState";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { UserListItem, UserListProps } from "./UserList.types";

const ROLE = { ADMIN: "Admin", FUNCIONARIO: "Funcionário" } as const;

export const Badge = ({ tone, children }: { tone: "master" | "locked"; children: string }) => (
  <span
    className={cn(
      "font-heading inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold [font-stretch:100%]",
      tone === "master" ? "bg-ink text-primary" : "bg-expense-soft text-expense",
    )}
  >
    {children}
  </span>
);

export function MembershipChips({ memberships }: { memberships: UserListItem["memberships"] }) {
  if (memberships.length === 0) return <span className="text-muted-foreground text-sm">Sem empresa</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {memberships.map((m) => (
        <li
          key={m.id}
          className={cn(
            "bg-muted rounded-full px-2.5 py-0.5 text-sm",
            !m.active && "text-muted-foreground line-through opacity-70",
          )}
        >
          {m.organizationName} · {ROLE[m.role]}
          {!m.active && <span className="sr-only"> (inativo)</span>}
        </li>
      ))}
    </ul>
  );
}

const lastSeen = (u: UserListItem) => (u.lastSeenAt ? formatDateTime(u.lastSeenAt) : "Nunca");
const href = (u: UserListItem) => `/plataforma/usuarios/${u.id}`;

const Name = ({ u }: { u: UserListItem }) => (
  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
    <span className="font-heading font-extrabold">{u.name}</span>
    {u.isMaster && <Badge tone="master">MASTER</Badge>}
    {u.locked && <Badge tone="locked">Bloqueado</Badge>}
  </span>
);

export function UserList({ users, organizations, total, pageSize, filters }: UserListProps) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q ?? "");
  const current = useRef(filters.q ?? "");
  // última URL pedida: router.replace é assíncrono e window.location ainda pode estar velha
  const pending = useRef<string | null>(null);

  // monta a URL no momento do disparo a partir da URL atual: nenhum filtro vem de closure velha
  const go = useCallback(
    (patch: { q?: string; empresa?: string }) => {
      const p = new URLSearchParams(pending.current ?? window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      p.delete("pagina");
      const s = p.toString();
      pending.current = s;
      const h = `/plataforma/usuarios${s ? `?${s}` : ""}`;
      startNavigationProgress(h);
      router.replace(h);
    },
    [router],
  );

  const pageHref = (pagina: number) => {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.empresa) p.set("empresa", filters.empresa);
    if (pagina > 1) p.set("pagina", String(pagina));
    const s = p.toString();
    return `/plataforma/usuarios${s ? `?${s}` : ""}`;
  };

  // navegação concluída: a URL real volta a ser a fonte
  useEffect(() => {
    pending.current = null;
  }, [filters.q, filters.empresa, filters.pagina]);

  // q mudou por fora (voltar do navegador, link): ressincroniza o campo
  useEffect(() => {
    const fq = filters.q ?? "";
    if (fq !== current.current) {
      current.current = fq;
      setQ(fq);
    }
  }, [filters.q]);

  // debounce de 300ms; volta à página 1 ao mudar a busca
  useEffect(() => {
    const value = q.trim();
    if (value === current.current) return;
    const t = setTimeout(() => {
      if (value === current.current) return;
      current.current = value;
      go({ q: value });
    }, 300);
    return () => clearTimeout(t);
  }, [q, go]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(filters.pagina, pages);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="grid gap-1.5">
          <AppLabel htmlFor="user-q">Buscar por nome ou e-mail</AppLabel>
          <div className="relative">
            <Search aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2" />
            <AppInput id="user-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} autoComplete="off" className="pl-10" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <AppLabel htmlFor="user-org">Empresa</AppLabel>
          <AppSelect
            id="user-org"
            value={filters.empresa ?? ""}
            onChange={(e) => {
              // leva junto o que já foi digitado e cancela o debounce pendente
              current.current = q.trim();
              go({ q: q.trim(), empresa: e.target.value });
            }}
          >
            <option value="">Todas as empresas</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </AppSelect>
        </div>
      </div>

      {users.length === 0 ? (
        <EmptyState title="Nenhum usuário encontrado." description="Ajuste a busca ou o filtro de empresa." />
      ) : (
        <>
          <ul className="grid gap-3 md:hidden">
            {users.map((u) => (
              <li key={u.id}>
                <Link
                  href={href(u)}
                  className="bg-card focus-visible:ring-ring/50 grid gap-2 rounded-xl border p-4 outline-none focus-visible:ring-3 active:scale-[.99]"
                >
                  <Name u={u} />
                  <span className="text-muted-foreground text-sm break-all">{u.email}</span>
                  <MembershipChips memberships={u.memberships} />
                  <span className="text-muted-foreground text-sm">Último acesso: {lastSeen(u)}</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="bg-card hidden overflow-hidden rounded-xl border md:block">
            <table className="w-full text-left">
              <caption className="sr-only">Usuários da plataforma</caption>
              <thead className="bg-muted text-muted-foreground font-heading text-sm [font-stretch:100%]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">Usuário</th>
                  <th scope="col" className="px-4 py-3 font-bold">Empresas</th>
                  <th scope="col" className="px-4 py-3 font-bold">Último acesso</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/50 focus-within:bg-muted/50 relative">
                    <td className="px-4 py-3 align-top">
                      <Link href={href(u)} className="focus-visible:ring-ring/50 rounded outline-none after:absolute after:inset-0 focus-visible:ring-3">
                        <Name u={u} />
                        <span className="text-muted-foreground block text-sm">{u.email}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <MembershipChips memberships={u.memberships} />
                    </td>
                    <td className="px-4 py-3 align-top text-sm">{lastSeen(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav aria-label="Paginação" className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm tabular-nums">
                Página {page} de {pages} · {total} usuários
              </p>
              <div className="flex gap-2">
                <PageLink to={page > 1 ? pageHref(page - 1) : null} label="Página anterior">
                  <ChevronLeft aria-hidden />
                </PageLink>
                <PageLink to={page < pages ? pageHref(page + 1) : null} label="Próxima página">
                  <ChevronRight aria-hidden />
                </PageLink>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function PageLink({ to, label, children }: { to: string | null; label: string; children: React.ReactNode }) {
  const cls = "border-border inline-flex size-11 items-center justify-center rounded-lg border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
  return to ? (
    <Link href={to} aria-label={label} className={cn(cls, "hover:bg-muted")}>
      {children}
    </Link>
  ) : (
    <span aria-hidden className={cn(cls, "opacity-40")}>
      {children}
    </span>
  );
}
