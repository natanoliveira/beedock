import { HexMark } from "@/components/atoms/HexMark";
import type { OrgHeaderProps } from "./OrgHeader.types";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** Marca da empresa no topo: logo (ou iniciais) + nome. */
export function OrgHeader({ organizationName, logoUrl }: OrgHeaderProps) {
  return (
    <div className="flex min-w-0 shrink items-center gap-2.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo vem do Vercel Blob, tamanho fixo
        <img src={logoUrl} alt="" className="hex h-[39px] w-[34px] shrink-0 object-cover" />
      ) : (
        <HexMark tone="primary" className="h-[39px] w-[34px] text-xs">
          {initials(organizationName)}
        </HexMark>
      )}
      <p className="font-heading max-w-[11rem] truncate text-sm leading-tight font-extrabold sm:max-w-[16rem]">
        {organizationName}
      </p>
    </div>
  );
}
