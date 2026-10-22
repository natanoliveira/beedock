import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/organisms/UserList";
import { UserMemberships } from "@/components/organisms/UserMemberships";
import { changeMemberRoleAction, linkUserAction, setMemberActiveAction } from "@/features/members/actions";
import { platformActor } from "@/features/platform/actor";
import { listOrganizations } from "@/features/platform/service";
import { getUser } from "@/features/platform/users";
import { formatDateTime } from "@/lib/format-date";
import { requireMaster } from "@/lib/session";

export const metadata: Metadata = { title: "Usuário" };

export default async function UsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMaster();
  const actor = await platformActor();
  const [user, organizations] = await Promise.all([getUser(actor, id), listOrganizations(actor)]);
  if (!user) notFound();
  const linked = new Set(user.memberships.filter((m) => m.active).map((m) => m.organizationId));
  const linkable = organizations.filter((o) => o.status !== "CLOSED" && !linked.has(o.id)).map((o) => ({ id: o.id, name: o.name }));

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Link href="/plataforma/usuarios" className="text-muted-foreground w-fit text-sm underline-offset-4 hover:underline">
          ← Usuários
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl leading-none font-black">{user.name}</h1>
          {user.isMaster && <Badge tone="master">MASTER</Badge>}
          {user.locked && <Badge tone="locked">Bloqueado</Badge>}
        </div>
        <dl className="text-muted-foreground grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt>E-mail</dt>
          <dd className="text-foreground break-all">{user.email}</dd>
          {user.phone && (
            <>
              <dt>Telefone</dt>
              <dd className="text-foreground">{user.phone}</dd>
            </>
          )}
          <dt>Último acesso</dt>
          <dd className="text-foreground">{user.lastSeenAt ? formatDateTime(user.lastSeenAt) : "Nunca"}</dd>
          <dt>Cadastro</dt>
          <dd className="text-foreground">{formatDateTime(user.createdAt)}</dd>
        </dl>
      </div>

      <UserMemberships
        userName={user.name}
        userEmail={user.email}
        memberships={user.memberships}
        linkableOrganizations={linkable}
        changeRoleAction={changeMemberRoleAction}
        setActiveAction={setMemberActiveAction}
        linkAction={linkUserAction}
      />
    </div>
  );
}
