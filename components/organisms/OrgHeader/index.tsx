import { HexMark } from "@/components/atoms/HexMark";
import { LogoutButton } from "@/components/molecules/LogoutButton";
import type { OrgHeaderProps } from "./OrgHeader.types";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export function OrgHeader({ organizationName, logoUrl, userName, roleLabel, logoutAction }: OrgHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo vem do Vercel Blob, tamanho fixo
        <img src={logoUrl} alt="" className="hex h-[46px] w-10 object-cover" />
      ) : (
        <HexMark tone="primary">{initials(organizationName)}</HexMark>
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <p className="font-heading truncate text-base font-extrabold">{organizationName}</p>
        <p className="truncate text-xs opacity-75">
          {userName} · {roleLabel}
        </p>
      </div>
      <LogoutButton logoutAction={logoutAction} />
    </div>
  );
}
