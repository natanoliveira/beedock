import Link from "next/link";
import { HexMark } from "@/components/atoms/HexMark";
import { OrgSwitcher } from "@/components/organisms/OrgSwitcher";
import { PlatformNav } from "@/components/organisms/PlatformNav";
import { LogoutButton } from "@/components/molecules/LogoutButton";
import { logoutAction } from "@/features/auth/actions";
import { switchOrganizationAction } from "@/features/members/actions";
import { listOrganizationOptions } from "@/features/members/switch";
import { requireMaster } from "@/lib/session";

export default async function PlataformaLayout({ children }: { children: React.ReactNode }) {
  const session = await requireMaster();
  const options = await listOrganizationOptions({ userId: session.user.id, isMaster: true });
  return (
    <div className="min-h-dvh">
      <header className="bg-ink text-ink-foreground">
        <div aria-hidden className="tape h-1.5" />
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-0 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 md:px-8">
          <Link
            href="/plataforma"
            className="flex items-center gap-2.5 rounded outline-none focus-visible:ring-3 focus-visible:ring-white/50"
          >
            <HexMark tone="primary">BD</HexMark>
            <span className="font-heading text-lg font-black [font-stretch:125%]">
              Bee<span className="text-primary">Dock</span>
            </span>
          </Link>
          <PlatformNav className="order-last w-full md:order-none md:w-auto" />
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <OrgSwitcher options={options} currentId={null} label="Entrar em empresa" switchAction={switchOrganizationAction} />
            <p className="hidden min-w-0 truncate text-sm opacity-80 md:block">{session.user.name}</p>
          </div>
          <LogoutButton logoutAction={logoutAction} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-12 md:px-8 md:pt-8">{children}</main>
    </div>
  );
}
