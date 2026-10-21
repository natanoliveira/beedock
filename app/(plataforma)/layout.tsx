import Link from "next/link";
import { HexMark } from "@/components/atoms/HexMark";
import { LogoutButton } from "@/components/molecules/LogoutButton";
import { logoutAction } from "@/features/auth/actions";
import { requireMaster } from "@/lib/session";

export default async function PlataformaLayout({ children }: { children: React.ReactNode }) {
  const session = await requireMaster();
  return (
    <div className="min-h-dvh">
      <header className="bg-ink text-ink-foreground">
        <div aria-hidden className="tape h-1.5" />
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 md:px-8">
          <Link
            href="/plataforma"
            className="flex items-center gap-2.5 rounded outline-none focus-visible:ring-3 focus-visible:ring-white/50"
          >
            <HexMark tone="primary">BD</HexMark>
            <span className="font-heading text-lg font-black [font-stretch:125%]">
              Bee<span className="text-primary">Dock</span>
            </span>
          </Link>
          <p className="min-w-0 flex-1 truncate text-right text-sm opacity-80">{session.user.name}</p>
          <LogoutButton logoutAction={logoutAction} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-12 md:px-8 md:pt-8">{children}</main>
    </div>
  );
}
