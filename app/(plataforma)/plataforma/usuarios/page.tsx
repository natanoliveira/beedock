import type { Metadata } from "next";
import { UserList } from "@/components/organisms/UserList";
import { platformActor } from "@/features/platform/actor";
import { listOrganizations } from "@/features/platform/service";
import { USERS_PAGE_SIZE, listUsers, usersFiltersSchema } from "@/features/platform/users";
import { requireMaster } from "@/lib/session";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMaster();
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const raw = { q: first(sp.q), empresa: first(sp.empresa), pagina: first(sp.pagina) };
  // q > 100 caracteres faz o parse falhar: cai nos padrões
  const parsed = usersFiltersSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : { page: 1 };
  const actor = await platformActor();
  const [{ rows, total }, organizations] = await Promise.all([listUsers(actor, filters), listOrganizations(actor)]);
  return (
    <div className="grid gap-5">
      <h1 className="text-3xl leading-none font-black">Usuários</h1>
      <UserList
        users={rows}
        organizations={organizations.map((o) => ({ id: o.id, name: o.name }))}
        total={total}
        pageSize={USERS_PAGE_SIZE}
        filters={{ q: "q" in filters ? filters.q : undefined, empresa: "organizationId" in filters ? filters.organizationId : undefined, pagina: filters.page }}
      />
    </div>
  );
}
