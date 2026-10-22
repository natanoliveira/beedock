import Link from "next/link";
import { OrgStatusBadge } from "@/components/atoms/OrgStatusBadge";
import { formatDateTime } from "@/lib/format-date";

export type OrganizationListItem = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  activeUsers: number;
  lastSeenAt: Date | null;
  pendingInvite: { expiresAt: Date } | null;
  admin: { name: string } | null;
};

const href = (o: OrganizationListItem) => `/plataforma/empresas/${o.id}`;
const lastSeen = (o: OrganizationListItem) => (o.lastSeenAt ? formatDateTime(o.lastSeenAt) : "nunca");

function Access({ o }: { o: OrganizationListItem }) {
  if (o.admin) return <>Admin ativo</>;
  if (o.pendingInvite) return <>Convite até {formatDateTime(o.pendingInvite.expiresAt)}</>;
  return <span className="text-muted-foreground">Sem convite</span>;
}

export function OrganizationList({ organizations }: { organizations: OrganizationListItem[] }) {
  return (
    <>
      <ul className="grid gap-3 md:hidden">
        {organizations.map((o) => (
          <li key={o.id}>
            <Link
              href={href(o)}
              className="bg-card focus-visible:ring-ring/50 grid gap-2 rounded-xl border p-4 outline-none focus-visible:ring-3 active:scale-[.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-heading truncate font-extrabold">{o.name}</p>
                  <p className="text-muted-foreground truncate text-sm">{o.slug}</p>
                </div>
                <OrgStatusBadge status={o.status} />
              </div>
              <dl className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt>Usuários ativos</dt>
                <dd className="text-foreground tabular-nums">{o.activeUsers}</dd>
                <dt>Último acesso</dt>
                <dd className="text-foreground">{lastSeen(o)}</dd>
                <dt>Admin</dt>
                <dd className="text-foreground">
                  <Access o={o} />
                </dd>
              </dl>
            </Link>
          </li>
        ))}
      </ul>

      <div className="bg-card hidden overflow-hidden rounded-xl border md:block">
        <table className="w-full text-left">
          <caption className="sr-only">Empresas da plataforma</caption>
          <thead className="bg-muted text-muted-foreground font-heading text-sm [font-stretch:100%]">
            <tr>
              <th scope="col" className="px-4 py-3 font-bold">
                Empresa
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-right font-bold">
                Usuários
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Último acesso
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Admin
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {organizations.map((o) => (
              <tr key={o.id} className="hover:bg-muted/50">
                <td className="px-4 py-3">
                  <Link href={href(o)} className="focus-visible:ring-ring/50 rounded outline-none focus-visible:ring-3">
                    <span className="font-heading font-extrabold">{o.name}</span>
                    <span className="text-muted-foreground block text-sm">{o.slug}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <OrgStatusBadge status={o.status} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{o.activeUsers}</td>
                <td className="px-4 py-3 text-sm">{lastSeen(o)}</td>
                <td className="px-4 py-3 text-sm">
                  <Access o={o} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
