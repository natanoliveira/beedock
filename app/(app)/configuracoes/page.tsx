import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminOnlyNotice } from "@/components/molecules/AdminOnlyNotice";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Configurações" };

const LINKS = [
  { href: "/configuracoes/equipe", title: "Equipe", text: "Convide pessoas e defina papéis." },
  { href: "/configuracoes/categorias", title: "Categorias", text: "Organize entradas e saídas." },
  { href: "/configuracoes/formas-de-pagamento", title: "Formas de pagamento", text: "Pix, dinheiro, cartão e outras." },
];

export default async function Page() {
  const { role } = await requireTenant();

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-extrabold md:text-3xl">Configurações</h1>
      {can(role, "settings.manage") ? (
        <ul className="grid gap-3 md:max-w-xl">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="bg-card hover:bg-muted focus-visible:ring-ring/50 flex min-h-14 items-center justify-between gap-3 rounded-lg border p-4 outline-none focus-visible:ring-3"
              >
                <span>
                  <span className="font-heading block font-bold">{l.title}</span>
                  <span className="text-muted-foreground text-sm">{l.text}</span>
                </span>
                <ChevronRight aria-hidden className="size-5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <AdminOnlyNotice />
      )}
    </div>
  );
}
