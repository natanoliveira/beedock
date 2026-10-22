"use client";

import type { ReactNode } from "react";
import { AppDialog, AppDialogContent, AppDialogDescription, AppDialogHeader, AppDialogTitle } from "@/components/atoms/AppDialog";
import { AppDrawer, AppDrawerContent, AppDrawerDescription, AppDrawerHeader, AppDrawerTitle } from "@/components/atoms/AppDrawer";
import { useMediaQuery } from "@/hooks/use-media-query";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; children: ReactNode };

/** Dialog no desktop, Drawer no mobile (mesmo critério do ConfirmAction). O conteúdo só monta aberto, então o estado reinicia a cada abertura. */
export function ResponsiveModal({ open, onOpenChange, title, description, children }: Props) {
  const desktop = useMediaQuery("(min-width: 768px)");
  return desktop ? (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>{title}</AppDialogTitle>
          <AppDialogDescription>{description}</AppDialogDescription>
        </AppDialogHeader>
        {children}
      </AppDialogContent>
    </AppDialog>
  ) : (
    <AppDrawer open={open} onOpenChange={onOpenChange}>
      <AppDrawerContent>
        <AppDrawerHeader>
          <AppDrawerTitle>{title}</AppDrawerTitle>
          <AppDrawerDescription>{description}</AppDrawerDescription>
        </AppDrawerHeader>
        <div className="max-h-[75dvh] overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)]">{children}</div>
      </AppDrawerContent>
    </AppDrawer>
  );
}
